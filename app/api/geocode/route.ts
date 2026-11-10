import { NextResponse } from "next/server";

/**
 * 住所・スポット名 → 位置の候補を返す。
 *
 * 以前はブラウザから Nominatim を直接呼び、先頭の1件だけを採用していた。
 * そのため日本の住所(丁目・番地)が見つからなかったり、同名の別の場所にピンが立っていた。
 * ここでは次の工夫で精度を上げ、候補を複数返して利用者に選んでもらう。
 *
 *  1. 全角→半角、〒・郵便番号、ハイフン類などの表記ゆれを整える
 *  2. 国土地理院の住所検索(日本の住所に強い)と Nominatim(施設名に強い)を併用する
 *  3. 見つからなければ、建物名・階数を除くなど検索語を変えて Nominatim を再検索する
 *  4. 旅行中の他の予定の近く(near)を優先する
 *  5. Nominatim の利用規約(User-Agent・1秒1リクエスト)をサーバー側で守る
 */

export type GeocodeCandidate = {
  id: string;
  lat: number;
  lng: number;
  /** 一覧に大きく出す名前 */
  name: string;
  /** 一覧に小さく出す住所 */
  address: string;
  source: "gsi" | "osm";
};

const USER_AGENT = "TripChat-TravelApp/1.0 (personal travel planning app)";
const TIMEOUT_MS = 6000;
const MAX_CANDIDATES = 6;

// ---------- 検索語の整形 ----------

const KANJI_NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
function toKanjiNumber(n: number): string {
  if (n <= 10) return KANJI_NUM[n];
  if (n < 20) return `十${KANJI_NUM[n - 10]}`;
  if (n < 100) return `${KANJI_NUM[Math.floor(n / 10)]}十${KANJI_NUM[n % 10]}`;
  return String(n);
}

function normalizeQuery(raw: string): string {
  let q = raw.normalize("NFKC").trim();
  q = q.replace(/[〒]/g, " ");
  // 先頭の郵便番号(123-4567 / 1234567)は住所検索の邪魔になるので除く(住所が続くときだけ)
  q = q.replace(/^\s*\d{3}-?\d{4}\s+(?=\S)/, "");
  // 数字にはさまれた各種ハイフン・長音記号を半角ハイフンにそろえる
  q = q.replace(/(?<=\d)[‐‑‒–—―−ー﹣-](?=\d)/g, "-");
  // 全角スペース・連続スペースを1つに
  q = q.replace(/[\s\u3000]+/g, " ");
  return q.trim();
}

/** 「1丁目9番1号」「1丁目294番地」→「1-9-1」「1-294」(数字+ハイフンの住所表記にそろえる) */
function hyphenate(q: string): string {
  return q
    .replace(/(\d+)\s*丁目\s*(?=\d)/g, "$1-") // 丁目のあとに番地が続くときだけ(「北1条西2丁目」は変えない)
    .replace(/(\d+)\s*番地?\s*(?=\d)/g, "$1-")
    .replace(/(\d+)\s*番地?\s*$/g, "$1")
    .replace(/(\d+)\s*号/g, "$1")
    .replace(/-{2,}/g, "-")
    .trim();
}

/** 住所らしい文字列か(都道府県・市区町村・丁目・番地・「数字-数字」) */
function looksLikeAddress(q: string): boolean {
  return /[都道府県市区町村郡]|丁目|番地?|号|\d+-\d+/.test(q);
}

/** 「丸の内1-9-1」→「丸の内一丁目9-1」(地理院の町名表記に合わせた別表記) */
function toChomeVariant(q: string): string | null {
  const m = q.match(/^(.*?[^\d\s-])\s?(\d{1,2})(?:丁目|-)(\d+)(?:(?:番地?|-)(\d+))?号?\s*$/);
  if (!m) return null;
  const [, head, chome, ban, go] = m;
  return `${head}${toKanjiNumber(Number(chome))}丁目${ban}${go ? `-${go}` : ""}`;
}

/** Nominatim 用の検索語の候補(上から順に試す) */
function nominatimVariants(q: string, hyphenated: string): string[] {
  const variants = [q];
  if (hyphenated !== q) variants.push(hyphenated);
  const noSpace = q.replace(/ /g, "");
  if (noSpace !== q) variants.push(noSpace);
  // 住所のあとの建物名・階数などを落とす(「…1-2-3 ○○ビル5F」→「…1-2-3」)
  const addr = hyphenated.match(/^(.*?\d+(?:-\d+)*)\s+\S.*$/);
  if (addr && addr[1] && addr[1] !== hyphenated) variants.push(addr[1]);
  // 先頭の語だけ(「浅草寺 雷門」→「浅草寺」)
  const first = q.split(" ")[0];
  if (first && first !== q && first.length >= 2) variants.push(first);
  return [...new Set(variants)];
}

// ---------- 外部API ----------

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, ...headers },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function searchGsi(query: string): Promise<GeocodeCandidate[]> {
  const data = await fetchJson(
    `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(query)}`
  );
  if (!Array.isArray(data)) return [];
  const out: GeocodeCandidate[] = [];
  for (const f of data as Array<{
    geometry?: { coordinates?: number[] };
    properties?: { title?: string };
  }>) {
    const c = f.geometry?.coordinates;
    const title = f.properties?.title;
    if (!c || c.length < 2 || !title) continue;
    // 地理院APIの座標は [経度, 緯度] の順
    const [lng, lat] = c;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({
      id: `gsi:${lat.toFixed(5)},${lng.toFixed(5)}:${title}`,
      lat,
      lng,
      name: title,
      address: title,
      source: "gsi",
    });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

// Nominatim は「1秒に1リクエスト」までなので、サーバー内で順番に間隔をあけて送る
let nominatimQueue: Promise<unknown> = Promise.resolve();
let lastNominatimAt = 0;
function nominatimFetch(url: string): Promise<unknown> {
  const run = nominatimQueue.then(async () => {
    const wait = Math.max(0, lastNominatimAt + 1100 - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatimAt = Date.now();
    return fetchJson(url, { "Accept-Language": "ja" });
  });
  nominatimQueue = run.catch(() => undefined);
  return run;
}

type NominatimItem = {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
};

function cleanDisplayName(display: string): string {
  return display
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && p !== "日本" && !/^\d{3}-\d{4}$/.test(p))
    .slice(0, 5)
    .join(" ");
}

async function searchNominatim(
  query: string,
  near: { lat: number; lng: number } | null
): Promise<GeocodeCandidate[]> {
  let url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=${MAX_CANDIDATES}` +
    `&countrycodes=jp&accept-language=ja&q=${encodeURIComponent(query)}`;
  if (near) {
    // 近くを優先(bounded=0 なので範囲外も出る)
    const d = 0.5;
    url += `&viewbox=${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}&bounded=0`;
  }
  const data = await nominatimFetch(url);
  if (!Array.isArray(data)) return [];
  return (data as NominatimItem[])
    .map((item) => {
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);
      const addr = cleanDisplayName(item.display_name);
      const first = item.display_name.split(",")[0].trim();
      const name = item.name || first;
      return {
        id: `osm:${item.osm_type}/${item.osm_id}`,
        lat,
        lng,
        name,
        // 名前と同じ文字で始まる住所は重複して見えるので、名前部分を除く
        address: addr.startsWith(name) ? addr.slice(name.length).trim() || addr : addr,
        source: "osm" as const,
      };
    })
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
}

// ---------- 結果の整理 ----------

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** ほぼ同じ場所(約60m以内)の候補は1つにまとめる */
function dedupe(list: GeocodeCandidate[]): GeocodeCandidate[] {
  const out: GeocodeCandidate[] = [];
  for (const c of list) {
    if (!out.some((o) => distanceKm(o, c) < 0.06)) out.push(c);
  }
  return out;
}

// 同じ検索の連続実行を避ける簡易キャッシュ(10分)
const cache = new Map<string, { at: number; value: GeocodeCandidate[] }>();
const CACHE_TTL = 10 * 60 * 1000;

async function geocode(
  rawQuery: string,
  near: { lat: number; lng: number } | null
): Promise<GeocodeCandidate[]> {
  const q = normalizeQuery(rawQuery);
  if (!q) return [];

  const cacheKey = `${q}|${near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ""}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value;

  const isAddress = looksLikeAddress(q);
  const hy = hyphenate(q);
  const chome = toChomeVariant(hy);
  const gsiQueries = [...new Set([q, hy, ...(chome ? [chome] : [])])];

  const [gsiLists, osmFirst] = await Promise.all([
    Promise.all(gsiQueries.map((g) => searchGsi(g))),
    searchNominatim(q, near),
  ]);
  const gsi = gsiLists.flat();
  let osm = osmFirst;

  // どちらも空なら、検索語を変えて Nominatim をやり直す
  if (gsi.length === 0 && osm.length === 0) {
    for (const v of nominatimVariants(q, hy).slice(1)) {
      osm = await searchNominatim(v, near);
      if (osm.length > 0) break;
    }
  }

  // 住所らしければ地理院を、施設名らしければ OSM を先に並べる
  let merged = dedupe(isAddress ? [...gsi, ...osm] : [...osm, ...gsi]);

  // 他の予定の近くを優先(順序は保ったまま、近い順に安定ソート)
  if (near && merged.length > 1) {
    merged = merged
      .map((c, i) => ({ c, i, d: distanceKm(near, c) }))
      .sort((a, b) => {
        const aNear = a.d < 80 ? 0 : 1;
        const bNear = b.d < 80 ? 0 : 1;
        return aNear - bNear || a.i - b.i;
      })
      .map((x) => x.c);
  }

  const result = merged.slice(0, MAX_CANDIDATES);
  if (result.length > 0) {
    if (cache.size > 200) cache.clear();
    cache.set(cacheKey, { at: Date.now(), value: result });
  }
  return result;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      query?: unknown;
      near?: { lat?: unknown; lng?: unknown } | null;
    };
    if (typeof body.query !== "string" || !body.query.trim() || body.query.length > 200) {
      return NextResponse.json({ candidates: [], error: "Invalid query" }, { status: 400 });
    }
    const near =
      body.near && typeof body.near.lat === "number" && typeof body.near.lng === "number"
        ? { lat: body.near.lat, lng: body.near.lng }
        : null;

    const candidates = await geocode(body.query, near);
    return NextResponse.json({ candidates });
  } catch (error) {
    console.error("API /api/geocode error:", error);
    return NextResponse.json({ candidates: [], error: "Search failed" }, { status: 500 });
  }
}

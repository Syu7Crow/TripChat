/**
 * OpenStreetMap(Overpass API)で、地点の最寄り駅を調べる。無料・APIキー不要。
 * 結果は端末内にキャッシュし、同じ場所は2回目以降すぐ返す。
 * Overpassの負荷を避けるため、問い合わせは1件ずつ間隔をあけて行う。
 */

export type StationLookup =
  | { status: "found"; name: string; lat: number; lng: number; distanceKm: number }
  | { status: "none" } // 一定距離内に駅が無い
  | { status: "error" }; // 通信失敗など(キャッシュしない)

type LatLng = { lat: number; lng: number };

/** 最寄り駅として探す範囲(直線距離)。これより遠い駅は「近くに駅がない」とみなす */
export const STATION_SEARCH_RADIUS_M = 1500;

const STORAGE_KEY = "tripchat.stations.v1";
const cache = new Map<string, StationLookup>();
let loaded = false;

export function stationKey(lat: number, lng: number): string {
  // 小数3桁(約100m)で丸めて、ほぼ同じ場所は同じ結果を使い回す
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function loadCache() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, StationLookup>;
    for (const [k, v] of Object.entries(obj)) cache.set(k, v);
  } catch {
    // 読めなければ無視(キャッシュ無しとして動く)
  }
}

function saveCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(cache)));
  } catch {
    // 容量超過などは無視
  }
}

function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Overpass APIの公開サーバー。混雑・障害に備えて順に試す */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

async function postOverpass(endpoint: string, query: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchNearest(p: LatLng): Promise<StationLookup> {
  const r = STATION_SEARCH_RADIUS_M;
  const query = `[out:json][timeout:12];(node["railway"="station"](around:${r},${p.lat},${p.lng});node["railway"="halt"](around:${r},${p.lat},${p.lng}););out body 30;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await postOverpass(endpoint, query);
      if (!res.ok) continue; // 429(混雑)・504(タイムアウト)などは次のサーバーで再試行

      const data = (await res.json()) as {
        elements: Array<{ lat?: number; lon?: number; tags?: Record<string, string> }>;
      };

      const candidates = data.elements
        .filter((el) => el.lat != null && el.lon != null && el.tags?.name)
        .map((el) => {
          const pos = { lat: el.lat as number, lng: el.lon as number };
          return { name: el.tags!.name, ...pos, distanceKm: distanceKm(p, pos) };
        })
        .sort((a, b) => a.distanceKm - b.distanceKm);

      if (candidates.length === 0) return { status: "none" };
      return { status: "found", ...candidates[0] };
    } catch {
      // 通信失敗・タイムアウト → 次のサーバーへ
    }
  }
  return { status: "error" };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let queue: Promise<unknown> = Promise.resolve();

/** 最寄り駅を調べる(キャッシュ優先・通信は直列に間隔をあけて実行) */
export function findNearestStation(p: LatLng): Promise<StationLookup> {
  loadCache();
  const key = stationKey(p.lat, p.lng);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  const job = queue.then(async () => {
    const again = cache.get(key);
    if (again) return again;

    const result = await fetchNearest(p);
    if (result.status !== "error") {
      cache.set(key, result);
      saveCache();
    }
    await sleep(1100);
    return result;
  });
  queue = job.catch(() => undefined);
  return job;
}
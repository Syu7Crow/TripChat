/**
 * 住所・スポット名から位置(緯度経度)の候補を探す。
 *
 * 実際の検索は内部API(/api/geocode)が行う。サーバー側で
 *   ・国土地理院の住所検索 + OpenStreetMap(Nominatim)の併用
 *   ・全角/半角・ハイフンなどの表記ゆれの吸収
 *   ・建物名・階数を除いた再検索
 * をしているので、以前よりも日本の住所が見つかりやすい。
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

export type LatLng = { lat: number; lng: number };

/** 位置の候補を最大6件返す。通信に失敗したときは null(「見つからない」と区別するため)。 */
export async function searchLocations(
  query: string,
  near?: LatLng | null
): Promise<GeocodeCandidate[] | null> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, near: near ?? null }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { candidates?: GeocodeCandidate[] };
    return data.candidates ?? [];
  } catch {
    return null;
  }
}

/** 候補を「どことして登録されるか」を示す短い表示にする */
export function candidateLabel(c: GeocodeCandidate): string {
  if (c.address && c.address !== c.name) return `${c.name} / ${c.address}`;
  return c.name;
}

/** 以前からの呼び出し口: いちばん上の候補だけを返す(AIプランの自動登録などで使う) */
export type GeocodeResult = { lat: number; lng: number; label: string };

export async function geocodeAddress(
  query: string,
  near?: LatLng | null
): Promise<GeocodeResult | null> {
  const list = await searchLocations(query, near);
  if (!list || list.length === 0) return null;
  const top = list[0];
  return { lat: top.lat, lng: top.lng, label: candidateLabel(top) };
}

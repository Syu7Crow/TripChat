/**
 * OpenStreetMap Nominatimで住所・スポット名から緯度経度を検索する。
 * 無料・APIキー不要だが、利用ポリシー上「1リクエスト/秒程度」に抑える必要がある
 * (卒業制作規模の利用であれば問題ない)。
 * https://operations.osmfoundation.org/policies/nominatim/
 */
export async function geocodeAddress(
  query: string
): Promise<{ lat: number; lng: number } | null> {
  if (!query.trim()) return null;

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp&q=${encodeURIComponent(
    query
  )}`;

  try {
    const res = await fetch(url, {
      headers: { "Accept-Language": "ja" },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;

    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

/**
 * OpenStreetMap Nominatimで住所・スポット名から緯度経度を検索する。
 * 無料・APIキー不要だが、利用ポリシー上「1リクエスト/秒程度」に抑える必要がある
 * (卒業制作規模の利用であれば問題ない)。
 * https://operations.osmfoundation.org/policies/nominatim/
 *
 * label は「どの場所として登録されたか」を利用者が確認するための表示用の名前。
 */
export type GeocodeResult = { lat: number; lng: number; label: string };

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  if (!query.trim()) return null;

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp&q=${encodeURIComponent(
    query
  )}`;

  try {
    const res = await fetch(url, {
      headers: { "Accept-Language": "ja" },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
    if (!data.length) return null;

    // 「札幌駅, 北5条西, 中央区, 札幌市, 北海道, 060-0005, 日本」→ 郵便番号・国名を除いて先頭4つ
    const label = (data[0].display_name ?? query)
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part && part !== "日本" && !/^\d{3}-\d{4}$/.test(part))
      .slice(0, 4)
      .join(" / ");

    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label };
  } catch {
    return null;
  }
}

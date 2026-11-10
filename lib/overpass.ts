/**
 * 地図の指定範囲内のカフェ、ホテル・旅館、グルメ、観光地などを検索する。
 * ブラウザのCORS制限やレートリミットを回避するため、内部APIルート(/api/places)を経由して
 * 安定してOverpass API & Nominatim APIと通信する。
 */

export type PlaceCategory =
  | "all"
  | "cafe"
  | "hotel"
  | "restaurant"
  | "sightseeing"
  | "onsen"
  | "convenience";

export type DiscoveredPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory | string;
  categoryLabel?: string;
};

export type SearchBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export const PRESET_CATEGORIES: Array<{
  id: PlaceCategory;
  label: string;
  icon: string;
}> = [
  { id: "all", label: "おすすめ", icon: "🎯" },
  { id: "cafe", label: "カフェ", icon: "☕" },
  { id: "hotel", label: "ホテル・旅館", icon: "🏨" },
  { id: "restaurant", label: "グルメ", icon: "🍽️" },
  { id: "sightseeing", label: "観光名所", icon: "⛩️" },
  { id: "onsen", label: "温泉・銭湯", icon: "♨️" },
  { id: "convenience", label: "コンビニ", icon: "🛒" },
];

export function getCategoryLabel(cat: string): { label: string; icon: string } {
  switch (cat) {
    case "cafe":
      return { label: "カフェ", icon: "☕" };
    case "hotel":
      return { label: "ホテル・旅館", icon: "🏨" };
    case "restaurant":
      return { label: "グルメ", icon: "🍽️" };
    case "sightseeing":
      return { label: "観光名所", icon: "⛩️" };
    case "onsen":
      return { label: "温泉・銭湯", icon: "♨️" };
    case "convenience":
      return { label: "コンビニ", icon: "🛒" };
    default:
      return { label: "スポット", icon: "📍" };
  }
}

/**
 * 指定したカテゴリーで地図範囲内のスポットを検索
 */
export async function searchNearbyPlaces(
  bounds: SearchBounds,
  category: PlaceCategory = "all"
): Promise<DiscoveredPlace[]> {
  try {
    const res = await fetch("/api/places", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "nearby", bounds, category }),
    });

    if (!res.ok) {
      console.warn("Places API error status:", res.status);
      return [];
    }

    const data = (await res.json()) as { places?: DiscoveredPlace[] };
    return data.places ?? [];
  } catch (err) {
    console.error("searchNearbyPlaces error:", err);
    return [];
  }
}

/**
 * 任意の日本語キーワード（「カフェ」「ホテル」「旅館」「ラーメン」等）で地図範囲内を検索
 */
export async function searchPlacesByKeyword(
  bounds: SearchBounds,
  keyword: string
): Promise<DiscoveredPlace[]> {
  const clean = keyword.trim();
  if (!clean) return [];

  try {
    const res = await fetch("/api/places", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "keyword", bounds, keyword: clean }),
    });

    if (!res.ok) {
      console.warn("Places keyword API error status:", res.status);
      return [];
    }

    const data = (await res.json()) as { places?: DiscoveredPlace[] };
    return data.places ?? [];
  } catch (err) {
    console.error("searchPlacesByKeyword error:", err);
    return [];
  }
}

/**
 * OpenStreetMap(Overpass API & Nominatim API)で、
 * 地図の指定範囲内のカフェ、ホテル・旅館、グルメ、観光地などを検索する。
 * 無料・APIキー不要。
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

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

async function postOverpass(query: string): Promise<Response> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) return res;
    } catch {
      // 次のサーバーへ
    }
  }
  throw new Error("Overpass APIへの接続に失敗しました");
}

function buildOverpassFilters(category: PlaceCategory, bounds: SearchBounds): string {
  const b = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;

  switch (category) {
    case "cafe":
      return `node["amenity"="cafe"](${b});node["amenity"="tea_room"](${b});`;
    case "hotel":
      return `node["tourism"~"hotel|guest_house|japanese_inn|hostel|motel"](${b});way["tourism"~"hotel|guest_house|japanese_inn|hostel|motel"](${b});`;
    case "restaurant":
      return `node["amenity"~"restaurant|fast_food|food_court"](${b});`;
    case "sightseeing":
      return `node["tourism"~"attraction|museum|viewpoint|gallery"](${b});node["historic"](${b});`;
    case "onsen":
      return `node["amenity"="public_bath"](${b});node["natural"="hot_spring"](${b});node["bath:type"="onsen"](${b});`;
    case "convenience":
      return `node["shop"="convenience"](${b});`;
    case "all":
    default:
      return `
        node["tourism"~"attraction|museum|viewpoint"](${b});
        node["amenity"~"cafe|restaurant"](${b});
        node["leisure"="park"](${b});
      `;
  }
}

/**
 * 指定したカテゴリーで地図範囲内のスポットを検索
 */
export async function searchNearbyPlaces(
  bounds: SearchBounds,
  category: PlaceCategory = "all"
): Promise<DiscoveredPlace[]> {
  const filters = buildOverpassFilters(category, bounds);
  const query = `[out:json][timeout:15];(${filters});out center 60;`;

  try {
    const res = await postOverpass(query);
    const data = (await res.json()) as {
      elements: Array<{
        type: string;
        id: number;
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
        tags?: Record<string, string>;
      }>;
    };

    return (data.elements ?? [])
      .filter((el) => {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        return el.tags?.name && lat != null && lon != null;
      })
      .map((el) => {
        const lat = (el.lat ?? el.center?.lat) as number;
        const lng = (el.lon ?? el.center?.lon) as number;
        const { label } = getCategoryLabel(category);
        return {
          id: `${el.type}/${el.id}`,
          name: el.tags!.name,
          lat,
          lng,
          category,
          categoryLabel: label,
        };
      });
  } catch (err) {
    console.error("Overpass search error:", err);
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

  // 1. よくある単語をカテゴリーへマッピングできるか判定
  if (/カフェ|喫茶|お茶|コーヒー|cafe/i.test(clean)) {
    return searchNearbyPlaces(bounds, "cafe");
  }
  if (/ホテル|旅館|宿|民宿|泊|ペンション|hotel|ryokan/i.test(clean)) {
    return searchNearbyPlaces(bounds, "hotel");
  }
  if (/温泉|銭湯|サウナ|風呂|湯|spa|onsen/i.test(clean)) {
    return searchNearbyPlaces(bounds, "onsen");
  }
  if (/コンビニ|ローソン|セブン|ファミマ/i.test(clean)) {
    return searchNearbyPlaces(bounds, "convenience");
  }
  if (/レストラン|グルメ|ご飯|食事|ランチ|ディナー|ラーメン|焼肉|居酒屋|そば|うどん/i.test(clean)) {
    return searchNearbyPlaces(bounds, "restaurant");
  }
  if (/観光|名所|スポット|神社|寺|城|公園|美術館|博物館/i.test(clean)) {
    return searchNearbyPlaces(bounds, "sightseeing");
  }

  // 2. 固有名詞や上記以外の単語は、Nominatimの範囲内検索（viewbox）を呼び出す
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=jp&q=${encodeURIComponent(
      clean
    )}&viewbox=${bounds.west},${bounds.north},${bounds.east},${bounds.south}&bounded=1&limit=30`;

    const res = await fetch(url, {
      headers: { "Accept-Language": "ja" },
    });
    if (!res.ok) return [];

    const items = (await res.json()) as Array<{
      osm_type: string;
      osm_id: number;
      lat: string;
      lon: string;
      display_name: string;
      name?: string;
    }>;

    return items.map((item) => {
      // 表示名から短いスポット名を抽出
      const shortName = item.name || item.display_name.split(",")[0].trim();
      return {
        id: `${item.osm_type}/${item.osm_id}`,
        name: shortName,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        category: "spot",
        categoryLabel: clean,
      };
    });
  } catch (err) {
    console.error("Nominatim bounds search error:", err);
    return [];
  }
}

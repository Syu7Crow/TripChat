import { NextResponse } from "next/server";

export type PlaceCategory =
  | "all"
  | "cafe"
  | "hotel"
  | "restaurant"
  | "sightseeing"
  | "onsen"
  | "convenience";

export type SearchBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type DiscoveredPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory | string;
  categoryLabel?: string;
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

function getCategoryLabel(cat: string): { label: string; icon: string } {
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

async function queryOverpass(query: string): Promise<Response> {
  const headers = {
    "User-Agent": "TripChat-TravelApp/1.0 (contact: travel-app-dev)",
    "Content-Type": "application/x-www-form-urlencoded",
  };

  for (const endpoint of OVERPASS_ENDPOINTS) {
    // 1. POSTでリクエスト
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) return res;
    } catch {
      // 次の方式/サーバーへ
    }

    // 2. GETでリクエスト
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
        method: "GET",
        headers: { "User-Agent": "TripChat-TravelApp/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) return res;
    } catch {
      // 次のサーバーへ
    }
  }

  throw new Error("Overpass API servers are currently unreachable");
}

async function handleNearby(bounds: SearchBounds, category: PlaceCategory = "all"): Promise<DiscoveredPlace[]> {
  const filters = buildOverpassFilters(category, bounds);
  const query = `[out:json][timeout:15];(${filters});out center 60;`;

  try {
    const res = await queryOverpass(query);
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
    console.error("Server-side Overpass search error:", err);
    return [];
  }
}

async function handleKeyword(bounds: SearchBounds, keyword: string): Promise<DiscoveredPlace[]> {
  const clean = keyword.trim();
  if (!clean) return [];

  if (/カフェ|喫茶|お茶|コーヒー|cafe/i.test(clean)) {
    return handleNearby(bounds, "cafe");
  }
  if (/ホテル|旅館|宿|民宿|泊|ペンション|hotel|ryokan/i.test(clean)) {
    return handleNearby(bounds, "hotel");
  }
  if (/温泉|銭湯|サウナ|風呂|湯|spa|onsen/i.test(clean)) {
    return handleNearby(bounds, "onsen");
  }
  if (/コンビニ|ローソン|セブン|ファミマ/i.test(clean)) {
    return handleNearby(bounds, "convenience");
  }
  if (/レストラン|グルメ|ご飯|食事|ランチ|ディナー|ラーメン|焼肉|居酒屋|そば|うどん/i.test(clean)) {
    return handleNearby(bounds, "restaurant");
  }
  if (/観光|名所|スポット|神社|寺|城|公園|美術館|博物館/i.test(clean)) {
    return handleNearby(bounds, "sightseeing");
  }

  // Nominatimの範囲内検索（viewbox）
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=jp&q=${encodeURIComponent(
      clean
    )}&viewbox=${bounds.west},${bounds.north},${bounds.east},${bounds.south}&bounded=1&limit=30`;

    const res = await fetch(url, {
      headers: {
        "Accept-Language": "ja",
        "User-Agent": "TripChat-TravelApp/1.0",
      },
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
    console.error("Server-side Nominatim search error:", err);
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, bounds, category, keyword } = body;

    if (!bounds || typeof bounds.south !== "number") {
      return NextResponse.json({ error: "Invalid bounds parameter" }, { status: 400 });
    }

    if (action === "keyword" && typeof keyword === "string") {
      const places = await handleKeyword(bounds, keyword);
      return NextResponse.json({ places });
    }

    const places = await handleNearby(bounds, category || "all");
    return NextResponse.json({ places });
  } catch (error) {
    console.error("API /api/places error:", error);
    return NextResponse.json({ places: [], error: "Search failed" }, { status: 500 });
  }
}

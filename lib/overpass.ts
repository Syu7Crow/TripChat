/**
 * OpenStreetMapのOverpass APIで、指定した範囲内の観光スポット・カフェなどを探す。
 * 無料・APIキー不要。データの網羅性はGoogleマップ等に比べて劣ることがある点に注意。
 */
export type DiscoveredPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
};

const TAGS: Array<[string, string]> = [
  ["tourism", "attraction"],
  ["tourism", "museum"],
  ["tourism", "viewpoint"],
  ["amenity", "cafe"],
  ["amenity", "restaurant"],
  ["leisure", "park"],
];

export async function searchNearbyPlaces(bounds: {
  south: number;
  west: number;
  north: number;
  east: number;
}): Promise<DiscoveredPlace[]> {
  const filters = TAGS.map(
    ([k, v]) => `node["${k}"="${v}"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});`
  ).join("\n");
  const query = `[out:json][timeout:15];(${filters});out center 80;`;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error("overpass error");

  const data = (await res.json()) as {
    elements: Array<{
      type: string;
      id: number;
      lat?: number;
      lon?: number;
      tags?: Record<string, string>;
    }>;
  };

  return data.elements
    .filter((el) => el.tags?.name && el.lat != null && el.lon != null)
    .map((el) => ({
      id: `${el.type}/${el.id}`,
      name: el.tags!.name,
      lat: el.lat as number,
      lng: el.lon as number,
      category: el.tags?.tourism ?? el.tags?.amenity ?? el.tags?.leisure ?? "spot",
    }));
}

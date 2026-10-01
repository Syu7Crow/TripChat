import type { TravelMode } from "@/lib/trip-utils";

type LatLng = { lat: number; lng: number };

/** 2点間の直線距離(km) */
export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** 直線距離は実際の道のりより短くなりがちなので補正する係数 */
const ROUTE_FACTOR = 1.3;

export function defaultModeForDistance(straightKm: number): TravelMode {
  return straightKm <= 1.2 ? "walking" : "transit";
}

/**
 * 距離をもとに、移動時間と費用の「目安」を計算する。
 * 実際のAPI(乗換案内など)を使わない概算値であることが前提。
 * - 徒歩: 時速4.8km換算
 * - 車: タクシーの一般的な初乗り運賃(500円/1.096km)+加算運賃で概算
 * - 電車: JR普通運賃の距離帯を参考にした概算テーブル(私鉄等では変動する)
 */
export function estimateTravel(
  straightKm: number,
  mode: TravelMode
): { minutes: number; fareYen: number; distanceKm: number } {
  const km = straightKm * ROUTE_FACTOR;

  if (mode === "walking") {
    return { minutes: Math.round((km / 4.8) * 60), fareYen: 0, distanceKm: km };
  }

  if (mode === "driving") {
    const minutes = Math.round((km / 20) * 60) + 5;
    const extraKm = Math.max(km - 1.096, 0);
    const fareYen = Math.round(500 + (extraKm * 1000 * 100) / 255);
    return { minutes, fareYen, distanceKm: km };
  }

  // transit
  const minutes = Math.round((km / 30) * 60) + 10;
  const fareTable: Array<[number, number]> = [
    [3, 150],
    [6, 170],
    [10, 200],
    [15, 240],
    [20, 320],
    [25, 400],
    [30, 480],
    [35, 560],
    [40, 640],
  ];
  const found = fareTable.find(([maxKm]) => km <= maxKm);
  const fareYen = found ? found[1] : 990;
  return { minutes, fareYen, distanceKm: km };
}

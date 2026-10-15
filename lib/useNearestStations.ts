import { useEffect, useRef, useState } from "react";
import { findNearestStation, stationKey, type StationLookup } from "@/lib/stations";

type Point = { lat: number | null; lng: number | null };

/**
 * 渡された地点それぞれの最寄り駅を(1回ずつ)調べ、結果を stationKey(lat,lng) をキーにして返す。
 * まだ調べ終わっていない地点は undefined のまま。
 * retry() で、通信に失敗した地点だけをもう一度調べる。
 */
export function useNearestStations(points: Point[]) {
  const [results, setResults] = useState<Record<string, StationLookup>>({});
  const [tick, setTick] = useState(0);
  const requested = useRef<Set<string>>(new Set());

  // 座標をそのまま文字列にした「署名」。地点が増減・変更したときだけ再実行する
  const signature = points
    .filter((p) => p.lat !== null && p.lng !== null)
    .map((p) => `${p.lat},${p.lng}`)
    .join("|");

  useEffect(() => {
    if (!signature) return;
    for (const part of signature.split("|")) {
      const [lat, lng] = part.split(",").map(Number);
      const key = stationKey(lat, lng);
      if (requested.current.has(key)) continue;
      requested.current.add(key);

      findNearestStation({ lat, lng }).then((result) => {
        if (result.status === "error") requested.current.delete(key);
        setResults((prev) => ({ ...prev, [key]: result }));
      });
    }
  }, [signature, tick]);

  function retry() {
    const failed = Object.keys(results).filter((k) => results[k].status === "error");
    if (failed.length === 0) return;
    failed.forEach((k) => requested.current.delete(k));
    setResults((prev) => {
      const next = { ...prev };
      failed.forEach((k) => delete next[k]);
      return next;
    });
    setTick((t) => t + 1);
  }

  return { stations: results, retry };
}
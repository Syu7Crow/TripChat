"use client";

import dynamic from "next/dynamic";
import type { TimelineItem, TripInfo } from "@/lib/trip-utils";
import { formatDayLabel } from "@/lib/trip-utils";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-2xl border border-paper-line bg-white/40 text-ink-text/50">
      地図を読み込み中…
    </div>
  ),
});

export default function MapTab({
  trip,
  dayNumber,
  dayItems,
  onAddSpot,
}: {
  trip: TripInfo;
  dayNumber: number;
  dayItems: TimelineItem[];
  onAddSpot: (name: string, lat: number, lng: number) => void;
}) {
  const spots = dayItems
    .filter((item): item is TimelineItem & { lat: number; lng: number } =>
      item.lat !== null && item.lng !== null
    )
    .map((item) => ({ id: item.id, title: item.title, lat: item.lat, lng: item.lng }));

  return (
    <div>
      <p className="text-sm text-ink-text/60">
        {formatDayLabel(trip, dayNumber)}の地図です。右上の「この範囲でスポットを探す」で、
        カフェや観光地を探して予定に追加できます(地図を動かしてから押すと、その範囲で探します)。
      </p>
      <div className="mt-4">
        <MapView spots={spots} onAddSpot={onAddSpot} />
      </div>
      {spots.length === 0 && (
        <p className="mt-3 text-xs text-ink-text/40">
          この日はまだ場所が登録された予定がありません。見つけたスポットを追加するか、
          タイムラインで予定の「場所」を入力してください。
        </p>
      )}
    </div>
  );
}

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
}: {
  trip: TripInfo;
  dayNumber: number;
  dayItems: TimelineItem[];
}) {
  const spots = dayItems
    .filter((item): item is TimelineItem & { lat: number; lng: number } =>
      item.lat !== null && item.lng !== null
    )
    .map((item) => ({ id: item.id, title: item.title, lat: item.lat, lng: item.lng }));

  return (
    <div>
      <p className="text-sm text-ink-text/60">
        {formatDayLabel(trip, dayNumber)}の、場所が登録されている予定を表示しています。
      </p>
      {spots.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-paper-line px-4 py-8 text-center text-ink-text/50">
          この日はまだ場所が登録された予定がありません。タイムラインで予定を追加するときに
          「場所」を入力すると、ここに表示されます。
        </p>
      ) : (
        <div className="mt-4">
          <MapView spots={spots} />
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { TimelineItem, TripInfo } from "@/lib/trip-utils";
import { formatDayLabel } from "@/lib/trip-utils";
import { resolveTheme } from "@/lib/theme";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-none md:rounded-2xl border-0 md:border border-paper-line bg-white/40 text-sm text-ink-text/50">
      地図を読み込み中…
    </div>
  ),
});

export default function MapTab({
  trip,
  dayNumber,
  dayNumbers = [],
  onSelectDay,
  dayItems,
  onAddSpot,
  selectedSpotId,
}: {
  trip: TripInfo;
  dayNumber: number;
  dayNumbers?: number[];
  onSelectDay?: (day: number) => void;
  dayItems: TimelineItem[];
  onAddSpot: (name: string, lat: number, lng: number) => void;
  selectedSpotId?: string | null;
}) {
  const theme = resolveTheme(trip);
  const spots = useMemo(
    () =>
      dayItems
        .filter((item): item is TimelineItem & { lat: number; lng: number } =>
          item.lat !== null && item.lng !== null
        )
        .map((item) => ({ id: item.id, title: item.title, lat: item.lat, lng: item.lng })),
    [dayItems]
  );

  return (
    <div className="flex h-full w-full flex-col min-h-0 overflow-hidden">
      {/* 日程セレクターバー（横スクロール） */}
      {dayNumbers.length > 1 && (
        <div className="shrink-0 flex items-center justify-between gap-2 border-b border-paper-line bg-paper/60 px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {dayNumbers.map((d) => {
              const isActive = d === dayNumber;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => onSelectDay?.(d)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition cursor-pointer active:scale-95 ${
                    isActive
                      ? "shadow-xs"
                      : "border border-paper-line bg-white/80 text-ink-text/70 hover:bg-white"
                  }`}
                  style={
                    isActive ? { backgroundColor: theme.bg, color: theme.sub } : undefined
                  }
                >
                  {formatDayLabel(trip, d)}
                </button>
              );
            })}
          </div>
          <span className="shrink-0 text-[11px] font-medium text-ink-text/50 whitespace-nowrap">
            📍 {spots.length}件
          </span>
        </div>
      )}

      {/* 地図表示エリア: 画面全体のスクロールを防ぎ、地図自体の操作のみスクロール/パン可能にする */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden rounded-none md:rounded-2xl border-0 md:border border-paper-line shadow-xs">
        <MapView
          spots={spots}
          dayNumber={dayNumber}
          onAddSpot={onAddSpot}
          selectedSpotId={selectedSpotId}
        />

        {/* スポット未登録時のフローティングガイド */}
        {spots.length === 0 && (
          <div className="pointer-events-none absolute bottom-9 inset-x-4 sm:inset-x-auto sm:left-28 z-[1000] max-w-sm rounded-xl bg-ink/85 backdrop-blur-md px-3.5 py-2.5 text-xs text-paper shadow-md">
            <p className="font-semibold text-amber">📍 この日の登録スポットはまだありません</p>
            <p className="mt-0.5 text-[11px] text-paper/80">
              上部の検索バーや「☕ カフェ」「🏨 ホテル・旅館」などのボタンから、周辺スポットを自由に探して追加できます。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

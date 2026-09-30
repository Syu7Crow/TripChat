export type TimelineItem = {
  id: string;
  trip_id: string;
  day_number: number;
  position: number;
  start_time: string | null;
  end_time: string | null;
  title: string;
  note: string | null;
};

export type TripInfo = {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  invite_code: string;
};

/** 旅行の日程から日数を出す。日付が無ければ、既存の項目や手動追加分から推定する。 */
export function computeDayNumbers(
  trip: TripInfo | null,
  items: TimelineItem[],
  extraDays: number
): number[] {
  if (trip?.start_date && trip?.end_date) {
    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    const diffDays =
      Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    return Array.from({ length: Math.max(diffDays, 1) }, (_, i) => i + 1);
  }

  const maxFromItems = items.reduce((max, item) => Math.max(max, item.day_number), 1);
  const total = Math.max(maxFromItems, extraDays);
  return Array.from({ length: total }, (_, i) => i + 1);
}

export function formatDayLabel(trip: TripInfo | null, dayNumber: number): string {
  if (trip?.start_date) {
    const date = new Date(trip.start_date);
    date.setDate(date.getDate() + (dayNumber - 1));
    return `${dayNumber}日目 (${date.getMonth() + 1}/${date.getDate()})`;
  }
  return `${dayNumber}日目`;
}

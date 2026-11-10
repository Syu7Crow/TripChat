/**
 * 移動手段。"driving" は以前の「車」(タクシー/自家用車を距離で自動切替)で、
 * 既存データとの互換のために残している。新規では taxi / rental / car を使う。
 */
export type TravelMode =
  | "walking"
  | "bus"
  | "transit"
  | "taxi"
  | "rental"
  | "car"
  | "driving"
  | "airplane"
  | "ferry";

export type TimelineItem = {
  id: string;
  trip_id: string;
  day_number: number;
  position: number;
  start_time: string | null;
  end_time: string | null;
  title: string;
  note: string | null;
  lat: number | null;
  lng: number | null;
  travel_mode: TravelMode | null;
  /** 利用者が入力した場所の文字(住所・スポット名)。位置(lat/lng)とは別に、表示用として保存する */
  location_text: string | null;
};

/** timeline_items を読むときの列(列を足したらここだけ直せばよい) */
export const TIMELINE_ITEM_COLUMNS =
  "id, trip_id, day_number, position, start_time, end_time, title, note, lat, lng, travel_mode, location_text";

export type TripInfo = {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  invite_code: string;
  /** ヘッダーの色(#rrggbb)。null は初期色 */
  header_color?: string | null;
  /** ヘッダーの文字の色(#rrggbb)。null は初期色 */
  header_text_color?: string | null;
};

/** "YYYY-MM-DD" をローカル時刻の日付として読む(new Date(文字列) はUTC扱いで、地域によって1日ずれるため) */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Date を "YYYY-MM-DD" にする(ローカル時刻) */
export function toDateString(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** 旅行の日程から日数を出す。日付が無ければ、既存の項目や手動追加分から推定する。 */
export function computeDayNumbers(
  trip: TripInfo | null,
  items: TimelineItem[],
  extraDays: number
): number[] {
  if (trip?.start_date && trip?.end_date) {
    const start = parseLocalDate(trip.start_date);
    const end = parseLocalDate(trip.end_date);
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
    const date = parseLocalDate(trip.start_date);
    date.setDate(date.getDate() + (dayNumber - 1));
    return `${dayNumber}日目 (${date.getMonth() + 1}/${date.getDate()})`;
  }
  return `${dayNumber}日目`;
}

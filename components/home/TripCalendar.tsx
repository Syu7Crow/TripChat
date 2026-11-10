"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Trip } from "@/types/trip";
import { resolveTheme } from "@/lib/theme";
import { parseLocalDate, toDateString } from "@/lib/trip-utils";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const MAX_LANES = 3; // 1週に表示するバーの最大段数(超えた分は「+N」で表示)

type Segment = {
  trip: Trip;
  startCol: number; // 0-6
  endCol: number; // 0-6
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

function tripRange(trip: Trip): { start: string; end: string } | null {
  if (!trip.start_date) return null;
  const start = trip.start_date.slice(0, 10);
  const end = (trip.end_date ?? trip.start_date).slice(0, 10);
  return end < start ? { start, end: start } : { start, end };
}

/** 月カレンダー。旅行を日付をまたぐバーで表示し、タップでその旅行を開く。 */
export default function TripCalendar({ trips }: { trips: Trip[] }) {
  const today = toDateString(new Date());
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  // 表示する週(各週は7日分の "YYYY-MM-DD")
  const weeks = useMemo(() => {
    const first = new Date(year, month, 1);
    const gridStart = new Date(year, month, 1 - first.getDay());
    const lastDate = new Date(year, month + 1, 0);
    const weekCount = Math.ceil((first.getDay() + lastDate.getDate()) / 7);
    return Array.from({ length: weekCount }, (_, w) =>
      Array.from({ length: 7 }, (_, d) =>
        toDateString(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + w * 7 + d))
      )
    );
  }, [year, month]);

  // 週ごとのバー配置(重なる旅行は別の段に置く)
  const weekSegments = useMemo(() => {
    const dated = trips
      .map((trip) => ({ trip, range: tripRange(trip) }))
      .filter((t): t is { trip: Trip; range: { start: string; end: string } } => t.range !== null)
      .sort((a, b) => a.range.start.localeCompare(b.range.start) || b.range.end.localeCompare(a.range.end));

    return weeks.map((week) => {
      const weekStart = week[0];
      const weekEnd = week[6];
      const lanes: number[] = []; // 各段の「埋まっている最後の列」
      const segments: Segment[] = [];
      for (const { trip, range } of dated) {
        if (range.end < weekStart || range.start > weekEnd) continue;
        const startCol = range.start < weekStart ? 0 : week.indexOf(range.start);
        const endCol = range.end > weekEnd ? 6 : week.indexOf(range.end);
        let lane = lanes.findIndex((last) => last < startCol);
        if (lane === -1) lane = lanes.length;
        lanes[lane] = endCol;
        segments.push({
          trip,
          startCol,
          endCol,
          lane,
          continuesBefore: range.start < weekStart,
          continuesAfter: range.end > weekEnd,
        });
      }
      return segments;
    });
  }, [trips, weeks]);

  // 選んだ日(なければ表示中の月)に重なる旅行の一覧
  const listed = useMemo(() => {
    const from = selected ?? toDateString(new Date(year, month, 1));
    const to = selected ?? toDateString(new Date(year, month + 1, 0));
    return trips.filter((trip) => {
      const r = tripRange(trip);
      return r !== null && r.end >= from && r.start <= to;
    });
  }, [trips, selected, year, month]);

  const undated = trips.filter((t) => !t.start_date);

  function moveMonth(delta: number) {
    setCursor(new Date(year, month + delta, 1));
    setSelected(null);
  }

  function formatRange(trip: Trip) {
    const r = tripRange(trip);
    if (!r) return "日程未定";
    const f = (d: string) => `${parseLocalDate(d).getMonth() + 1}/${parseLocalDate(d).getDate()}`;
    return r.start === r.end ? f(r.start) : `${f(r.start)} 〜 ${f(r.end)}`;
  }

  return (
    <div className="mt-6">
      {/* 月の切り替え */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => moveMonth(-1)}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-paper-line bg-white/70 text-lg text-ink-text/70 active:scale-95 cursor-pointer"
          aria-label="前の月"
        >
          ‹
        </button>
        <div className="text-center">
          <p className="font-display text-lg font-semibold text-ink">
            {year}年{month + 1}月
          </p>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
              setSelected(null);
            }}
            className="text-[11px] text-teal underline cursor-pointer"
          >
            今月に戻る
          </button>
        </div>
        <button
          type="button"
          onClick={() => moveMonth(1)}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-paper-line bg-white/70 text-lg text-ink-text/70 active:scale-95 cursor-pointer"
          aria-label="次の月"
        >
          ›
        </button>
      </div>

      {/* カレンダー本体 */}
      <div className="mt-3 overflow-hidden rounded-2xl border border-paper-line bg-white/70 shadow-2xs">
        <div className="grid grid-cols-7 border-b border-paper-line bg-paper/60">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`py-1.5 text-center text-[11px] font-semibold ${
                i === 0 ? "text-red-600/80" : i === 6 ? "text-sky-700/80" : "text-ink-text/60"
              }`}
            >
              {w}
            </div>
          ))}
        </div>

        {weeks.map((week, wi) => {
          const segments = weekSegments[wi];
          const visible = segments.filter((s) => s.lane < MAX_LANES);
          const laneCount = Math.min(
            MAX_LANES,
            segments.reduce((m, s) => Math.max(m, s.lane + 1), 0)
          );
          // 段が足りず隠れた旅行の数(列ごと)
          const hiddenPerCol = Array(7).fill(0) as number[];
          for (const s of segments) {
            if (s.lane < MAX_LANES) continue;
            for (let c = s.startCol; c <= s.endCol; c++) hiddenPerCol[c]++;
          }
          return (
            <div key={wi} className="border-b border-paper-line/70 last:border-b-0">
              {/* 日付の行 */}
              <div className="grid grid-cols-7">
                {week.map((date, di) => {
                  const d = parseLocalDate(date);
                  const inMonth = d.getMonth() === month;
                  const isToday = date === today;
                  const isSelected = date === selected;
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setSelected(isSelected ? null : date)}
                      className={`flex min-h-[30px] items-start justify-center pt-1 cursor-pointer ${
                        isSelected ? "bg-amber/15" : ""
                      }`}
                      aria-label={`${d.getMonth() + 1}月${d.getDate()}日`}
                    >
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                          isToday
                            ? "bg-ink font-bold text-paper"
                            : !inMonth
                              ? "text-ink-text/25"
                              : di === 0
                                ? "text-red-600/80"
                                : di === 6
                                  ? "text-sky-700/80"
                                  : "text-ink-text/80"
                        }`}
                      >
                        {d.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 旅行のバー */}
              <div
                className="grid grid-cols-7 gap-y-0.5 pb-1"
                style={{ minHeight: laneCount > 0 ? undefined : 8 }}
              >
                {visible.map((s) => {
                  const bg = resolveTheme(s.trip).bg;
                  const fg = resolveTheme(s.trip).sub;
                  return (
                    <Link
                      key={`${s.trip.id}-${wi}`}
                      href={`/trips/${s.trip.id}`}
                      className="min-w-0 truncate px-1.5 py-0.5 text-[10px] font-semibold leading-4 active:opacity-80 sm:text-xs"
                      style={{
                        gridColumn: `${s.startCol + 1} / ${s.endCol + 2}`,
                        gridRow: s.lane + 1,
                        backgroundColor: bg,
                        color: fg,
                        borderTopLeftRadius: s.continuesBefore ? 0 : 6,
                        borderBottomLeftRadius: s.continuesBefore ? 0 : 6,
                        borderTopRightRadius: s.continuesAfter ? 0 : 6,
                        borderBottomRightRadius: s.continuesAfter ? 0 : 6,
                        marginLeft: s.continuesBefore ? 0 : 2,
                        marginRight: s.continuesAfter ? 0 : 2,
                      }}
                    >
                      {s.trip.title}
                    </Link>
                  );
                })}
                {hiddenPerCol.map((n, c) =>
                  n > 0 ? (
                    <span
                      key={`more-${c}`}
                      className="text-center text-[10px] text-ink-text/50"
                      style={{ gridColumn: `${c + 1} / ${c + 2}`, gridRow: MAX_LANES + 1 }}
                    >
                      +{n}
                    </span>
                  ) : null
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 選んだ日 / 表示中の月の旅行一覧 */}
      <div className="mt-5">
        <h3 className="text-sm font-semibold text-ink-text/80">
          {selected
            ? `${parseLocalDate(selected).getMonth() + 1}月${parseLocalDate(selected).getDate()}日の旅`
            : `${month + 1}月の旅`}
        </h3>
        {listed.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-paper-line p-4 text-center text-sm text-ink-text/60">
            この期間の旅の予定はありません。
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {listed.map((trip) => (
              <li key={trip.id}>
                <Link
                  href={`/trips/${trip.id}`}
                  className="block rounded-xl border border-paper-line bg-white/70 px-4 py-3 shadow-2xs transition hover:border-teal active:scale-[0.99]"
                  style={{ borderLeftWidth: 6, borderLeftColor: resolveTheme(trip).bg }}
                >
                  <p className="font-semibold text-ink-text">{trip.title}</p>
                  <p className="mt-0.5 text-xs text-ink-text/60">{formatRange(trip)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {undated.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-ink-text/80">日程未定の旅</h3>
            <ul className="mt-2 space-y-2">
              {undated.map((trip) => (
                <li key={trip.id}>
                  <Link
                    href={`/trips/${trip.id}`}
                    className="block rounded-xl border border-paper-line bg-white/70 px-4 py-3 shadow-2xs transition hover:border-teal active:scale-[0.99]"
                    style={{ borderLeftWidth: 6, borderLeftColor: resolveTheme(trip).bg }}
                  >
                    <p className="font-semibold text-ink-text">{trip.title}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

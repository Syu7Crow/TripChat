"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseLocalDate, type TimelineItem, type TripInfo } from "@/lib/trip-utils";

/**
 * 旅行の開始日・終了日を変更する。変更は旅行のメンバー全員に反映される。
 * 予定は「◯日目」で管理しているので、日付を動かすと予定も一緒に移動する。
 * 日程を短くして範囲外になる予定がある場合は、確認のうえ最終日にまとめる。
 */
export default function TripDateEditor({
  trip,
  items,
  onSaved,
}: {
  trip: TripInfo;
  items: TimelineItem[];
  onSaved: (dates: { start_date: string | null; end_date: string | null }) => void | Promise<void>;
}) {
  const supabase = createClient();

  const [start, setStart] = useState(trip.start_date ?? "");
  const [end, setEnd] = useState(trip.end_date ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const dirty = start !== (trip.start_date ?? "") || end !== (trip.end_date ?? "");

  async function handleSave() {
    setMessage(null);

    if ((start && !end) || (!start && end)) {
      setMessage({ type: "error", text: "開始日と終了日は両方入力するか、両方空にしてください。" });
      return;
    }
    if (start && end && end < start) {
      setMessage({ type: "error", text: "終了日は開始日以降にしてください。" });
      return;
    }

    // 範囲外になる予定の確認
    let lastDay: number | null = null;
    let overflow: TimelineItem[] = [];
    if (start && end) {
      lastDay =
        Math.round((parseLocalDate(end).getTime() - parseLocalDate(start).getTime()) / 86400000) + 1;
      overflow = items.filter((it) => it.day_number > (lastDay as number));
      if (overflow.length > 0) {
        const ok = window.confirm(
          `日程を短くすると、${lastDay}日目より後の予定が${overflow.length}件あふれます。\n` +
            `これらを${lastDay}日目にまとめて移動しますか?`
        );
        if (!ok) return;
      }
    }

    setSaving(true);
    const { error } = await supabase
      .from("trips")
      .update({ start_date: start || null, end_date: end || null })
      .eq("id", trip.id);

    if (error) {
      setSaving(false);
      setMessage({ type: "error", text: "保存できませんでした。時間をおいて試してください。" });
      return;
    }

    // あふれた予定を最終日の末尾に移動
    if (lastDay !== null && overflow.length > 0) {
      const target = lastDay;
      let nextPos =
        items.filter((it) => it.day_number === target).reduce((m, it) => Math.max(m, it.position), 0) + 1;
      const ordered = [...overflow].sort(
        (a, b) => a.day_number - b.day_number || a.position - b.position
      );
      for (const it of ordered) {
        await supabase
          .from("timeline_items")
          .update({ day_number: target, position: nextPos++ })
          .eq("id", it.id);
      }
    }

    setSaving(false);
    setMessage({ type: "ok", text: "日程を変更しました。" });
    await onSaved({ start_date: start || null, end_date: end || null });
  }

  return (
    <section id="dates-section" className="scroll-mt-6">
      <h2 className="font-display text-lg font-semibold text-ink">旅行の日程</h2>
      <p className="mt-1 text-xs text-ink-text/60 sm:text-sm">
        日付を変えても、「◯日目」の予定はそのまま一緒に移動します。
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <label className="block text-xs font-semibold text-ink-text/70 mb-1">開始日</label>
          <input
            type="date"
            value={start}
            onChange={(e) => {
              const v = e.target.value;
              setStart(v);
              // 終了日が開始日より前になったら、開始日に合わせる
              if (end && v && end < v) setEnd(v);
            }}
            className="min-h-[46px] rounded-xl border border-paper-line bg-white px-3.5 py-2 text-base sm:text-sm text-ink focus:border-teal focus:outline-none shadow-2xs"
          />
        </div>
        <div className="min-w-0">
          <label className="block text-xs font-semibold text-ink-text/70 mb-1">終了日</label>
          <input
            type="date"
            value={end}
            min={start || undefined}
            onChange={(e) => setEnd(e.target.value)}
            className="min-h-[46px] rounded-xl border border-paper-line bg-white px-3.5 py-2 text-base sm:text-sm text-ink focus:border-teal focus:outline-none shadow-2xs"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="min-h-[44px] rounded-xl bg-amber px-5 py-2 text-sm font-bold text-ink transition hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-xs active:scale-95"
        >
          {saving ? "保存中…" : "日程を保存"}
        </button>
        {(start || end) && (
          <button
            type="button"
            onClick={() => {
              setStart("");
              setEnd("");
            }}
            className="text-xs text-ink-text/60 underline cursor-pointer"
          >
            日付をクリア
          </button>
        )}
      </div>

      {message && (
        <p className={`mt-2 text-xs ${message.type === "ok" ? "text-teal" : "text-red-700"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}

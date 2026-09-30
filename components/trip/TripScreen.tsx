"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import {
  computeDayNumbers,
  formatDayLabel,
  type TimelineItem,
  type TripInfo,
} from "@/lib/trip-utils";

type Member = {
  user_id: string;
  display_name: string;
};

export default function TripScreen({ tripId }: { tripId: string }) {
  const supabase = createClient();
  const { userId, authError, ready } = useSupabaseUser();

  const [trip, setTrip] = useState<TripInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [extraDays, setExtraDays] = useState(1);
  const [activeDay, setActiveDay] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newNote, setNewNote] = useState("");
  const [adding, setAdding] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);

    const { data: tripData, error: tripError } = await supabase
      .from("trips")
      .select("id, title, start_date, end_date, invite_code")
      .eq("id", tripId)
      .single();

    if (tripError || !tripData) {
      setError("この旅行が見つかりませんでした。招待コードから参加し直してください。");
      setLoading(false);
      return;
    }
    setTrip(tripData as TripInfo);

    const { data: memberRows } = await supabase
      .from("trip_members")
      .select("user_id, profiles(display_name)")
      .eq("trip_id", tripId);

    setMembers(
      (memberRows ?? []).map((row) => {
        const profile = row.profiles as unknown as { display_name: string } | null;
        return { user_id: row.user_id, display_name: profile?.display_name ?? "名無しさん" };
      })
    );

    const { data: itemRows, error: itemsError } = await supabase
      .from("timeline_items")
      .select("id, trip_id, day_number, position, start_time, end_time, title, note")
      .eq("trip_id", tripId)
      .order("day_number", { ascending: true })
      .order("position", { ascending: true });

    if (!itemsError) {
      setItems((itemRows ?? []) as TimelineItem[]);
    }

    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // 初回読み込み: ログインが済んだらデータを取得
  useEffect(() => {
    if (!ready || !userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ログイン後の初回データ取得のため意図的
    loadAll();
  }, [ready, userId, loadAll]);

  // Realtimeで他メンバーの変更を反映
  const applyRealtimeChange = useCallback(
    (eventType: string, newRow: TimelineItem | null, oldRow: { id: string } | null) => {
      setItems((prev) => {
        if (eventType === "DELETE" && oldRow) {
          return prev.filter((item) => item.id !== oldRow.id);
        }
        if (!newRow) return prev;
        const exists = prev.some((item) => item.id === newRow.id);
        const next = exists
          ? prev.map((item) => (item.id === newRow.id ? newRow : item))
          : [...prev, newRow];
        return next.sort((a, b) =>
          a.day_number !== b.day_number
            ? a.day_number - b.day_number
            : a.position - b.position
        );
      });
    },
    []
  );

  useEffect(() => {
    if (!tripId) return;
    const channel = supabase
      .channel(`timeline-${tripId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "timeline_items", filter: `trip_id=eq.${tripId}` },
        (payload) => {
          applyRealtimeChange(
            payload.eventType,
            (payload.new ?? null) as TimelineItem | null,
            (payload.old ?? null) as { id: string } | null
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const dayNumbers = computeDayNumbers(trip, items, extraDays);
  const dayItems = items
    .filter((item) => item.day_number === activeDay)
    .sort((a, b) => a.position - b.position);

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setAdding(true);
    const maxPosition = dayItems.reduce((max, item) => Math.max(max, item.position), 0);

    const { data, error: insertError } = await supabase
      .from("timeline_items")
      .insert({
        trip_id: tripId,
        day_number: activeDay,
        position: maxPosition + 1000,
        start_time: newStart || null,
        end_time: newEnd || null,
        title: newTitle.trim(),
        note: newNote || null,
      })
      .select("id, trip_id, day_number, position, start_time, end_time, title, note")
      .single();
    setAdding(false);

    if (insertError || !data) {
      setError("予定を追加できませんでした。時間をおいて試してください。");
      return;
    }

    // Realtimeでも届くが、体感を早くするため即座に反映
    applyRealtimeChange("INSERT", data as TimelineItem, null);
    setNewTitle("");
    setNewStart("");
    setNewEnd("");
    setNewNote("");
  }

  async function moveItem(item: TimelineItem, direction: "up" | "down") {
    const sorted = dayItems;
    const index = sorted.findIndex((i) => i.id === item.id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    const target = sorted[targetIndex];
    const [posA, posB] = [item.position, target.position];

    await Promise.all([
      supabase.from("timeline_items").update({ position: posB }).eq("id", item.id),
      supabase.from("timeline_items").update({ position: posA }).eq("id", target.id),
    ]);

    applyRealtimeChange("UPDATE", { ...item, position: posB }, null);
    applyRealtimeChange("UPDATE", { ...target, position: posA }, null);
  }

  async function deleteItem(id: string) {
    await supabase.from("timeline_items").delete().eq("id", id);
    applyRealtimeChange("DELETE", null, { id });
  }

  function copyInviteCode() {
    if (!trip) return;
    navigator.clipboard.writeText(trip.invite_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!ready || loading) {
    return <main className="min-h-screen bg-paper px-6 py-14 text-ink-text/60">読み込み中…</main>;
  }

  if (authError || error || !trip) {
    return (
      <main className="min-h-screen bg-paper px-6 py-14">
        <p className="text-red-700">{authError ?? error}</p>
        <Link href="/" className="mt-4 inline-block text-teal underline">
          ホームに戻る
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper">
      <section className="rounded-b-[2.5rem] bg-ink px-6 py-10 text-paper md:px-12">
        <Link href="/" className="text-sm text-paper/60">
          ← ホーム
        </Link>
        <h1 className="mt-2 font-display text-3xl text-amber md:text-4xl">{trip.title}</h1>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex -space-x-2">
            {members.map((m) => (
              <span
                key={m.user_id}
                title={m.display_name}
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-teal text-xs font-medium text-white"
              >
                {m.display_name.slice(0, 1)}
              </span>
            ))}
          </div>
          <button
            onClick={copyInviteCode}
            className="rounded-lg border border-paper/30 px-3 py-1 text-sm text-paper/80 hover:bg-paper/10"
          >
            {copied ? "コピーしました" : `招待コード: ${trip.invite_code}`}
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-8 md:px-12">
        {/* 日程タブ */}
        <div className="flex flex-wrap gap-2">
          {dayNumbers.map((day) => (
            <button
              key={day}
              onClick={() => setActiveDay(day)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                activeDay === day
                  ? "bg-ink text-paper"
                  : "border border-paper-line bg-white/60 text-ink-text"
              }`}
            >
              {formatDayLabel(trip, day)}
            </button>
          ))}
          {!trip.start_date && (
            <button
              onClick={() => {
                const next = Math.max(...dayNumbers) + 1;
                setExtraDays(next);
                setActiveDay(next);
              }}
              className="rounded-full border border-dashed border-amber px-4 py-2 text-sm text-amber-dark"
            >
              + 日を追加
            </button>
          )}
        </div>

        {/* タイムライン項目 */}
        <ul className="mt-6 space-y-3">
          {dayItems.map((item, index) => (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-2xl border border-paper-line bg-white/60 px-4 py-3"
            >
              <div className="w-14 shrink-0 pt-1 text-sm text-ink-text/60">
                {item.start_time ? item.start_time.slice(0, 5) : ""}
              </div>
              <div className="flex-1">
                <p className="font-medium text-ink-text">{item.title}</p>
                {item.note && <p className="mt-0.5 text-sm text-ink-text/60">{item.note}</p>}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  onClick={() => moveItem(item, "up")}
                  disabled={index === 0}
                  className="text-ink-text/50 disabled:opacity-20"
                  aria-label="上へ"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveItem(item, "down")}
                  disabled={index === dayItems.length - 1}
                  className="text-ink-text/50 disabled:opacity-20"
                  aria-label="下へ"
                >
                  ▼
                </button>
              </div>
              <button
                onClick={() => deleteItem(item.id)}
                className="shrink-0 text-ink-text/40 hover:text-red-700"
                aria-label="削除"
              >
                ×
              </button>
            </li>
          ))}

          {dayItems.length === 0 && (
            <li className="text-ink-text/60">この日の予定はまだありません。</li>
          )}
        </ul>

        {/* 追加フォーム */}
        <form
          onSubmit={handleAddItem}
          className="mt-6 rounded-2xl border border-dashed border-paper-line px-4 py-4"
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="予定(例: 浅草寺を観光)"
            className="w-full rounded-lg border border-paper-line bg-paper px-3 py-2 text-sm"
          />
          <div className="mt-2 flex gap-2">
            <input
              type="time"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              className="w-full rounded-lg border border-paper-line bg-paper px-3 py-2 text-sm"
            />
            <input
              type="time"
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
              className="w-full rounded-lg border border-paper-line bg-paper px-3 py-2 text-sm"
            />
          </div>
          <input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="メモ(任意)"
            className="mt-2 w-full rounded-lg border border-paper-line bg-paper px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={adding || !newTitle.trim()}
            className="mt-3 rounded-lg bg-amber px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
          >
            {adding ? "追加中…" : "この日に追加"}
          </button>
        </form>
      </section>
    </main>
  );
}

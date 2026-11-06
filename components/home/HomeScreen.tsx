"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import type { Trip } from "@/types/trip";
import { resolveTheme } from "@/lib/theme";
import { countUnreadChat } from "@/lib/unread";
import Badge from "@/components/trip/Badge";

function formatDateRange(start: string | null, end: string | null) {
  if (!start) return "日程未定";
  const fmt = (d: string) => {
    const date = new Date(d);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };
  if (!end || end === start) return fmt(start);
  return `${fmt(start)} 〜 ${fmt(end)}`;
}

export default function HomeScreen() {
  const supabase = createClient();
  const router = useRouter();
  // セッションが全く無い(初めての訪問)場合は自動ログインせず、/login に委ねる
  const { userId, ready } = useSupabaseUser({ autoAnonymous: false });

  useEffect(() => {
    if (ready && !userId) {
      router.replace("/login");
    }
  }, [ready, userId, router]);

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  // 旅行ごとのチャット未読件数(カードのバッジ用)
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const loadTrips = useCallback(async (uid: string | null) => {
    if (!uid) return;
    // 色の列(migration_theme.sql)が未適用でも一覧を出せるよう、失敗したら色なしで取り直す
    const withColors = await supabase
      .from("trip_members")
      .select("trip:trips(id, title, start_date, end_date, header_color, header_text_color)")
      .eq("user_id", uid);
    let rows: Array<{ trip: unknown }> | null = withColors.data;
    let fetchError = withColors.error;
    if (fetchError?.code === "42703") {
      const fallback = await supabase
        .from("trip_members")
        .select("trip:trips(id, title, start_date, end_date)")
        .eq("user_id", uid);
      rows = fallback.data;
      fetchError = fallback.error;
    }

    if (fetchError) {
      setError("旅行の一覧を取得できませんでした。");
      setLoading(false);
      return;
    }

    const list = (rows ?? [])
      .map((row) => row.trip as unknown as Trip)
      .filter(Boolean)
      .sort((a, b) => (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999"));

    setTrips(list);
    setLoading(false);

    // 未読件数は一覧を出した後に数える(遅くても一覧の表示は待たせない)
    const counts = await Promise.all(
      list.map(async (trip) => [trip.id, await countUnreadChat(supabase, trip.id, uid)] as const)
    );
    setUnread(Object.fromEntries(counts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ログイン後の初回データ取得のため意図的
    loadTrips(userId);
  }, [ready, userId, loadTrips]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !userId) return;

    setCreating(true);
    const { data, error: insertError } = await supabase
      .from("trips")
      .insert({
        title: newTitle.trim(),
        start_date: newStart || null,
        end_date: newEnd || null,
      })
      .select("id, title, start_date, end_date")
      .single();
    setCreating(false);

    if (insertError || !data) {
      setError("旅行を作成できませんでした。時間をおいて試してください。");
      return;
    }

    setTrips((prev) => [...prev, data as Trip]);
    setNewTitle("");
    setNewStart("");
    setNewEnd("");
    setShowCreateForm(false);
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;

    setJoining(true);
    setJoinError(null);
    const { data: tripId, error: joinRpcError } = await supabase.rpc("join_trip", {
      _code: joinCode.trim(),
    });
    setJoining(false);

    if (joinRpcError || !tripId) {
      // DB側のトリガー(migration_members.sql)が、BANされた人の参加を "BANNED" で拒否する
      setJoinError(
        joinRpcError?.message?.includes("BANNED")
          ? "この旅行には参加できません(作成者によってBANされています)。"
          : "招待コードが正しくないか、期限切れの可能性があります。"
      );
      return;
    }

    setJoinCode("");
    await loadTrips(userId);
  }

  return (
    <main className="min-h-screen bg-paper pb-12">
      <section className="rounded-b-[2rem] sm:rounded-b-[2.5rem] bg-ink px-5 py-8 sm:px-8 sm:py-12 md:px-12 md:py-16 text-paper shadow-xs">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl md:text-6xl text-amber">
              Tripchat
            </h1>
            <p className="mt-2 sm:mt-3 max-w-md text-sm sm:text-base text-paper/80">
              計画から精算まで、これひとつで完結する旅のしおり。
            </p>
          </div>
          <Link
            href="/account"
            className="shrink-0 rounded-lg border border-paper/30 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm text-paper/80 transition hover:bg-paper/10 active:scale-95"
          >
            アカウント
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-8 px-4 py-8 sm:gap-10 sm:px-6 md:grid-cols-[1fr_260px] md:px-12 md:py-12">
        {/* 旅行一覧: 経路のように点線でつなぐ */}
        <div>
          <h2 className="font-display text-xl text-ink font-semibold">あなたの旅</h2>

          {error && (
            <p className="mt-4 text-sm text-red-700">{error}</p>
          )}

          {loading ? (
            <p className="mt-6 text-ink-text/60">旅の予定を読み込み中…</p>
          ) : (
            <ul className="mt-6 border-l-2 border-dashed border-paper-line pl-5 sm:pl-6">
              {trips.map((trip) => (
                <li key={trip.id} className="relative mb-5 sm:mb-6">
                  <span className="absolute -left-[27px] sm:-left-[29px] top-3 h-3 w-3 rounded-full bg-teal" />
                  <Link
                    href={`/trips/${trip.id}`}
                    className="relative block rounded-2xl border border-paper-line bg-white/70 px-4 py-3.5 sm:px-5 sm:py-4 transition hover:border-teal shadow-2xs active:scale-[0.99]"
                    style={{ borderLeftWidth: 6, borderLeftColor: resolveTheme(trip).bg }}
                  >
                    <Badge count={unread[trip.id] ?? 0} className="absolute right-3.5 top-3.5 sm:right-4 sm:top-4" />
                    <p className="pr-8 sm:pr-10 font-semibold text-ink-text text-base sm:text-lg">{trip.title}</p>
                    <p className="mt-1 text-xs sm:text-sm text-ink-text/60">
                      {formatDateRange(trip.start_date, trip.end_date)}
                    </p>
                  </Link>
                </li>
              ))}

              {trips.length === 0 && (
                <li className="mb-6 rounded-xl border border-dashed border-paper-line p-5 text-center text-sm text-ink-text/60">
                  まだ旅の予定がありません。最初のしおりを作ってみましょう。
                </li>
              )}

              <li className="relative">
                <span className="absolute -left-[27px] sm:-left-[29px] top-3 h-3 w-3 rounded-full border-2 border-amber bg-paper" />
                {!showCreateForm ? (
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="w-full sm:w-auto rounded-2xl border-2 border-dashed border-amber bg-white/40 px-5 py-3.5 sm:py-4 font-medium text-amber-dark transition hover:bg-amber/10 active:scale-95 cursor-pointer text-sm sm:text-base text-left sm:text-center"
                  >
                    + 新しい旅行をつくる
                  </button>
                ) : (
                  <form
                    onSubmit={handleCreate}
                    className="rounded-2xl border border-paper-line bg-white/80 p-4 sm:p-5 shadow-xs"
                  >
                    <p className="text-xs font-semibold text-ink-text/70 mb-2">新しい旅行を作成</p>
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="旅行のタイトル (例: 沖縄旅行)"
                      className="w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none"
                    />
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-medium text-ink-text/60">開始日</label>
                        <input
                          type="date"
                          value={newStart}
                          onChange={(e) => setNewStart(e.target.value)}
                          className="mt-0.5 w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-base sm:text-sm text-ink focus:border-teal focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-ink-text/60">終了日</label>
                        <input
                          type="date"
                          value={newEnd}
                          onChange={(e) => setNewEnd(e.target.value)}
                          className="mt-0.5 w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-base sm:text-sm text-ink focus:border-teal focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="mt-3.5 flex gap-2">
                      <button
                        type="submit"
                        disabled={creating || !newTitle.trim()}
                        className="flex-1 sm:flex-none rounded-lg bg-amber px-5 py-2.5 text-sm font-medium text-ink transition hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-xs active:scale-95 text-center"
                      >
                        {creating ? "作成中…" : "旅をはじめる"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreateForm(false)}
                        className="px-4 py-2.5 text-sm text-ink-text/60 hover:text-ink cursor-pointer"
                      >
                        やめる
                      </button>
                    </div>
                  </form>
                )}
              </li>
            </ul>
          )}
        </div>

        {/* 招待コードで参加 */}
        <aside className="h-fit rounded-2xl border border-paper-line bg-teal-soft/80 p-4 sm:p-5 shadow-2xs">
          <h2 className="font-display text-lg text-ink font-semibold">招待コードで参加</h2>
          <p className="mt-1 text-xs sm:text-sm text-ink-text/70">
            友だちから届いた招待コードを入力してください。
          </p>
          <form onSubmit={handleJoin} className="mt-3">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="招待コード"
              className="w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none"
            />
            {joinError && (
              <p className="mt-2 text-xs sm:text-sm text-red-700">{joinError}</p>
            )}
            <button
              type="submit"
              disabled={joining || !joinCode.trim()}
              className="mt-3 w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-xs active:scale-95"
            >
              {joining ? "確認中…" : "参加する"}
            </button>
          </form>
        </aside>
      </section>
    </main>
  );
}

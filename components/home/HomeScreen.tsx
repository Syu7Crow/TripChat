"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Trip } from "@/types/trip";

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

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    const { data: sessionData } = await supabase.auth.getSession();
    let uid = sessionData.session?.user.id ?? null;

    if (!uid) {
      const { data, error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) {
        setError("ログインに失敗しました。ページを再読み込みしてください。");
        setLoading(false);
        return;
      }
      uid = data.user?.id ?? null;
    }

    setUserId(uid);
    await loadTrips(uid);
  }

  async function loadTrips(uid: string | null) {
    if (!uid) return;
    const { data, error: fetchError } = await supabase
      .from("trip_members")
      .select("trip:trips(id, title, start_date, end_date)")
      .eq("user_id", uid);

    if (fetchError) {
      setError("旅行の一覧を取得できませんでした。");
      setLoading(false);
      return;
    }

    const list = (data ?? [])
      .map((row) => row.trip as unknown as Trip)
      .filter(Boolean)
      .sort((a, b) => (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999"));

    setTrips(list);
    setLoading(false);
  }

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
      setJoinError("招待コードが正しくないか、期限切れの可能性があります。");
      return;
    }

    setJoinCode("");
    await loadTrips(userId);
  }

  return (
    <main className="min-h-screen bg-paper">
      <section className="rounded-b-[2.5rem] bg-ink px-6 py-14 text-paper md:px-12 md:py-20">
        <h1 className="font-display text-4xl text-amber md:text-6xl">
          Tripchat
        </h1>
        <p className="mt-3 max-w-md text-paper/80">
          計画から精算まで、これひとつで完結する旅のしおり。
        </p>
      </section>

      <section className="mx-auto grid max-w-4xl gap-10 px-6 py-12 md:grid-cols-[1fr_260px] md:px-12">
        {/* 旅行一覧: 経路のように点線でつなぐ */}
        <div>
          <h2 className="font-display text-xl text-ink">あなたの旅</h2>

          {error && (
            <p className="mt-4 text-sm text-red-700">{error}</p>
          )}

          {loading ? (
            <p className="mt-6 text-ink-text/60">旅の予定を読み込み中…</p>
          ) : (
            <ul className="mt-6 border-l-2 border-dashed border-paper-line pl-6">
              {trips.map((trip) => (
                <li key={trip.id} className="relative mb-6">
                  <span className="absolute -left-[29px] top-2 h-3 w-3 rounded-full bg-teal" />
                  <Link
                    href={`/trips/${trip.id}`}
                    className="block rounded-2xl border border-paper-line bg-white/60 px-5 py-4 transition hover:border-teal"
                  >
                    <p className="font-medium text-ink-text">{trip.title}</p>
                    <p className="mt-1 text-sm text-ink-text/60">
                      {formatDateRange(trip.start_date, trip.end_date)}
                    </p>
                  </Link>
                </li>
              ))}

              {trips.length === 0 && (
                <li className="mb-6 text-ink-text/60">
                  まだ旅の予定がありません。最初のしおりを作ってみましょう。
                </li>
              )}

              <li className="relative">
                <span className="absolute -left-[29px] top-2 h-3 w-3 rounded-full border-2 border-amber bg-paper" />
                {!showCreateForm ? (
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="rounded-2xl border-2 border-dashed border-amber px-5 py-4 font-medium text-amber-dark transition hover:bg-amber/10"
                  >
                    + 新しい旅行をつくる
                  </button>
                ) : (
                  <form
                    onSubmit={handleCreate}
                    className="rounded-2xl border border-paper-line bg-white/60 px-5 py-4"
                  >
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="旅行のタイトル(例: 沖縄旅行)"
                      className="w-full rounded-lg border border-paper-line bg-paper px-3 py-2 text-sm"
                    />
                    <div className="mt-2 flex gap-2">
                      <input
                        type="date"
                        value={newStart}
                        onChange={(e) => setNewStart(e.target.value)}
                        className="w-full rounded-lg border border-paper-line bg-paper px-3 py-2 text-sm"
                      />
                      <input
                        type="date"
                        value={newEnd}
                        onChange={(e) => setNewEnd(e.target.value)}
                        className="w-full rounded-lg border border-paper-line bg-paper px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="submit"
                        disabled={creating || !newTitle.trim()}
                        className="rounded-lg bg-amber px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
                      >
                        {creating ? "作成中…" : "旅をはじめる"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreateForm(false)}
                        className="px-4 py-2 text-sm text-ink-text/60"
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
        <aside className="h-fit rounded-2xl border border-paper-line bg-teal-soft px-5 py-5">
          <h2 className="font-display text-lg text-ink">招待コードで参加</h2>
          <p className="mt-1 text-sm text-ink-text/70">
            友だちから届いたコードを入力してください。
          </p>
          <form onSubmit={handleJoin} className="mt-3">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="招待コード"
              className="w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-sm"
            />
            {joinError && (
              <p className="mt-2 text-sm text-red-700">{joinError}</p>
            )}
            <button
              type="submit"
              disabled={joining || !joinCode.trim()}
              className="mt-3 w-full rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {joining ? "確認中…" : "参加する"}
            </button>
          </form>
        </aside>
      </section>
    </main>
  );
}

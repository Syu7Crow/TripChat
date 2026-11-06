"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import {
  computeDayNumbers,
  formatDayLabel,
  type TimelineItem,
  type TravelMode,
  type TripInfo,
} from "@/lib/trip-utils";
import { geocodeAddress } from "@/lib/geocode";
import {
  estimateTravel,
  formatDuration,
  haversineDistanceKm,
  normalizeMode,
  planTransit,
  type TravelEstimate,
} from "@/lib/travel-estimate";
import { stationKey } from "@/lib/stations";
import { useNearestStations } from "@/lib/useNearestStations";
import ChecklistTab from "./ChecklistTab";
import MapTab from "./MapTab";
import ChatTab from "./ChatTab";
import SettingsTab from "./SettingsTab";
import MembersTab, { type TripMember } from "./MembersTab";
import TripThemeEditor from "./TripThemeEditor";
import { resolveTheme, type ThemeColors } from "@/lib/theme";
import { countUnreadChat, markChatRead } from "@/lib/unread";
import Avatar from "./Avatar";
import Badge from "./Badge";

// 画面に出す移動手段(旧データの "driving" は normalizeMode でタクシー/自家用車に読み替える)
const TRAVEL_MODES: Array<{ key: Exclude<TravelMode, "driving">; label: string }> = [
  { key: "walking", label: "徒歩" },
  { key: "bus", label: "バス" },
  { key: "transit", label: "電車" },
  { key: "taxi", label: "タクシー" },
  { key: "rental", label: "レンタカー" },
  { key: "car", label: "自家用車" },
];

type Member = TripMember;

export default function TripScreen({ tripId }: { tripId: string }) {
  const supabase = createClient();
  const { userId, authError, ready } = useSupabaseUser();

  const [trip, setTrip] = useState<TripInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [extraDays, setExtraDays] = useState(1);
  const [activeDay, setActiveDay] = useState(1);
  const [activeTab, setActiveTab] = useState<"timeline" | "map" | "checklist" | "chat" | "settings">(
    "timeline"
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  // 自分がもうメンバーではない(作成者にBANされた等)と分かったとき true
  const [removed, setRemoved] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);

  // 非同期の処理や購読の中から「今の値」を読むための参照
  const userIdRef = useRef<string | null>(null);
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const [newTitle, setNewTitle] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [adding, setAdding] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [locationInfo, setLocationInfo] = useState<string | null>(null);

  // メンバー一覧(名前・役割・参加日・アイコン)。設定の「更新」やプロフィール保存の後にも使う
  const loadMembers = useCallback(async () => {
    type Row = {
      user_id: string;
      role: string;
      joined_at: string;
      profiles?: {
        display_name: string;
        avatar_emoji?: string | null;
        avatar_color?: string | null;
        avatar_url?: string | null;
      } | null;
    };

    // アイコン・写真の列(migration_members.sql / migration_avatar_photo.sql)が未適用でも一覧を出せるよう、
    // 失敗したら取る列を減らして取り直す
    const profileColumns = [
      "display_name, avatar_emoji, avatar_color, avatar_url",
      "display_name, avatar_emoji, avatar_color",
      "display_name",
    ];
    let result: { data: unknown; error: { code?: string } | null } = { data: null, error: null };
    for (const columns of profileColumns) {
      result = await supabase
        .from("trip_members")
        .select(`user_id, role, joined_at, profiles(${columns})`)
        .eq("trip_id", tripId);
      if (result.error?.code !== "42703") break;
    }

    if (result.error) {
      setMembersError("メンバーを読み込めませんでした。設定の「最新の状態に更新」を試してください。");
      return;
    }
    setMembersError(null);

    const rows = (result.data ?? []) as unknown as Row[];
    setMembers(
      rows.map((row) => ({
        user_id: row.user_id,
        role: row.role,
        joined_at: row.joined_at,
        display_name: row.profiles?.display_name ?? "名無しさん",
        avatar_emoji: row.profiles?.avatar_emoji ?? null,
        avatar_color: row.profiles?.avatar_color ?? null,
        avatar_url: row.profiles?.avatar_url ?? null,
      }))
    );

    // 読み込みに成功したのに自分が含まれていない = もうこの旅行のメンバーではない
    const me = userIdRef.current;
    if (me && !rows.some((row) => row.user_id === me)) {
      setRemoved(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const loadAll = useCallback(async () => {
    setLoading(true);

    // 色の列(migration_theme.sql)が未適用でも旅行を開けるよう、失敗したら色なしで取り直す
    let { data: tripData, error: tripError } = await supabase
      .from("trips")
      .select("id, title, start_date, end_date, invite_code, header_color, header_text_color")
      .eq("id", tripId)
      .single();
    if (tripError?.code === "42703") {
      ({ data: tripData, error: tripError } = await supabase
        .from("trips")
        .select("id, title, start_date, end_date, invite_code")
        .eq("id", tripId)
        .single());
    }

    if (tripError || !tripData) {
      setError(
        "この旅行が見つからないか、参加が取り消された可能性があります。招待コードから参加し直してください。"
      );
      setLoading(false);
      return;
    }
    setTrip(tripData as TripInfo);

    await loadMembers();

    const { data: itemRows, error: itemsError } = await supabase
      .from("timeline_items")
      .select("id, trip_id, day_number, position, start_time, end_time, title, note, lat, lng, travel_mode")
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

  // 他のメンバーの名前・アイコンの変更や、自分がBANされたことに気づけるよう、
  // 画面に戻ってきたときと1分ごとにメンバーを取り直す
  const tripLoaded = !!trip;
  useEffect(() => {
    if (!tripLoaded || removed) return;
    const refresh = () => {
      if (document.visibilityState === "visible") loadMembers();
    };
    const timer = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [tripLoaded, removed, loadMembers]);

  // チャットの未読バッジ: 開いたときに数え、以降は他メンバーの発言をリアルタイムで加算する
  useEffect(() => {
    if (!ready || !userId || !tripLoaded) return;
    if (activeTabRef.current === "chat") {
      markChatRead(tripId, userId);
      return;
    }
    let cancelled = false;
    countUnreadChat(supabase, tripId, userId).then((count) => {
      if (!cancelled) setUnreadChat(count);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId, tripId, tripLoaded]);

  useEffect(() => {
    if (!tripLoaded) return;
    const channel = supabase
      .channel(`unread-${tripId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trip_messages", filter: `trip_id=eq.${tripId}` },
        (payload) => {
          const row = payload.new as { user_id: string; created_at: string };
          const me = userIdRef.current;
          if (!me || row.user_id === me) return;
          if (activeTabRef.current === "chat") {
            markChatRead(tripId, me, row.created_at);
          } else {
            setUnreadChat((count) => count + 1);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, tripLoaded]);

  // チャットを開いたら既読にする
  useEffect(() => {
    if (activeTab !== "chat" || !userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- チャットを開いた時点で未読を0にするため意図的
    setUnreadChat(0);
    markChatRead(tripId, userId);
  }, [activeTab, tripId, userId]);

  const dayNumbers = computeDayNumbers(trip, items, extraDays);
  const dayItems = items
    .filter((item) => item.day_number === activeDay)
    .sort((a, b) => a.position - b.position);

  // 各予定の最寄り駅(電車が使えるかの判定に使う)
  const { stations, retry: retryStations } = useNearestStations(dayItems);

  // 地図の「発見」機能から、名前と位置だけでその日の予定に追加する
  async function handleQuickAddSpot(name: string, lat: number, lng: number) {
    const maxPosition = dayItems.reduce((max, item) => Math.max(max, item.position), 0);
    const { data, error: insertError } = await supabase
      .from("timeline_items")
      .insert({
        trip_id: tripId,
        day_number: activeDay,
        position: maxPosition + 1000,
        title: name,
        lat,
        lng,
      })
      .select("id, trip_id, day_number, position, start_time, end_time, title, note, lat, lng, travel_mode")
      .single();

    if (!insertError && data) {
      applyRealtimeChange("INSERT", data as TimelineItem, null);
    }
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setAdding(true);
    setLocationNotice(null);
    setLocationInfo(null);
    const maxPosition = dayItems.reduce((max, item) => Math.max(max, item.position), 0);

    let coords: { lat: number; lng: number } | null = null;
    if (newLocation.trim()) {
      const result = await geocodeAddress(newLocation.trim());
      if (result) {
        coords = { lat: result.lat, lng: result.lng };
        // 別の場所に登録されて距離・金額がずれるのを防ぐため、何として登録したかを見せる
        setLocationInfo(
          `「${newTitle.trim()}」の位置: ${result.label}\n意図と違う場合は、場所の欄に住所や正式名称を入れて追加し直してください。`
        );
      } else {
        setLocationNotice(
          "場所が見つからなかったため、位置情報なしで追加しました(地図には表示されません)。"
        );
      }
    }

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
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      })
      .select("id, trip_id, day_number, position, start_time, end_time, title, note, lat, lng, travel_mode")
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
    setNewLocation("");
  }

  async function changeTravelMode(item: TimelineItem, mode: TravelMode) {
    applyRealtimeChange("UPDATE", { ...item, travel_mode: mode }, null);
    await supabase.from("timeline_items").update({ travel_mode: mode }).eq("id", item.id);
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

  function handleThemeSaved(colors: ThemeColors) {
    setTrip((prev) => (prev ? { ...prev, ...colors } : prev));
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

  if (removed) {
    return (
      <main className="min-h-screen bg-paper px-6 py-14">
        <p className="font-medium text-ink-text">この旅行のメンバーではなくなりました。</p>
        <p className="mt-2 text-sm text-ink-text/60">
          作成者によってBANされた可能性があります。心当たりがない場合は、作成者に確認してください。
        </p>
        <Link href="/" className="mt-4 inline-block text-teal underline">
          ホームに戻る
        </Link>
      </main>
    );
  }

  const theme = resolveTheme(trip);

  const TABS: Array<{
    key: "timeline" | "map" | "checklist" | "chat" | "settings";
    label: string;
    badge?: number;
  }> = [
    { key: "timeline", label: "タイムライン" },
    { key: "map", label: "地図" },
    { key: "checklist", label: "持ち物" },
    { key: "chat", label: "チャット", badge: unreadChat },
    { key: "settings", label: "設定" },
  ];

  return (
    <main className="min-h-screen bg-paper">
      <section
        className="rounded-b-[2.5rem] px-6 py-10 md:px-12"
        style={{ backgroundColor: theme.bg, color: theme.sub }}
      >
        <Link href="/" className="text-sm opacity-60">
          ← ホーム
        </Link>
        <h1 className="mt-2 font-display text-3xl md:text-4xl" style={{ color: theme.title }}>
          {trip.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              // メンバー一覧は設定タブの中にあるので、設定を開いてそこまでスクロールする
              setActiveTab("settings");
              setTimeout(
                () => document.getElementById("members-section")?.scrollIntoView({ behavior: "smooth" }),
                50
              );
            }}
            className="flex -space-x-2"
            title="メンバー全員を見る"
            aria-label="メンバー全員を見る"
          >
            {members.slice(0, 6).map((m) => (
              <Avatar
                key={m.user_id}
                name={m.display_name}
                emoji={m.avatar_emoji}
                color={m.avatar_color}
                url={m.avatar_url}
                size={32}
                ringColor={theme.bg}
              />
            ))}
            {members.length > 6 && (
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white/80 text-xs font-medium text-ink-text"
                style={{ borderColor: theme.bg }}
              >
                +{members.length - 6}
              </span>
            )}
          </button>
          <button
            onClick={copyInviteCode}
            className="rounded-lg border border-current/30 px-3 py-1 text-sm opacity-80 hover:bg-current/10"
          >
            {copied ? "コピーしました" : `招待コード: ${trip.invite_code}`}
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-8 md:flex md:items-start md:gap-8 md:px-12">
        {/* 画面タブ: PCは左サイドバー、スマホは下部固定バー */}
        <nav className="hidden shrink-0 flex-col gap-1 md:flex md:w-44">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg px-3 py-2 text-left text-sm font-medium ${
                activeTab === tab.key ? "" : "text-ink-text/60 hover:bg-paper-line/40"
              }`}
              style={
                activeTab === tab.key ? { backgroundColor: theme.bg, color: theme.sub } : undefined
              }
            >
              <span className="flex items-center justify-between gap-2">
                {tab.label}
                <Badge count={tab.badge ?? 0} />
              </span>
            </button>
          ))}
        </nav>

        <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-paper-line bg-paper pb-[env(safe-area-inset-bottom,0px)] md:hidden">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-center text-sm font-medium ${
                activeTab === tab.key ? "text-teal" : "text-ink-text/50"
              }`}
            >
              <span className="relative inline-block">
                {tab.label}
                <Badge count={tab.badge ?? 0} className="absolute -right-5 -top-2" />
              </span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 pb-24 md:pb-0">
        {activeTab === "checklist" && (
          <div className="mt-6">
            <ChecklistTab tripId={tripId} members={members} />
          </div>
        )}

        {activeTab === "map" && (
          <div className="mt-6">
            <MapTab trip={trip} dayNumber={activeDay} dayItems={dayItems} onAddSpot={handleQuickAddSpot} />
          </div>
        )}

        {activeTab === "chat" && (
          <div className="mt-6">
            <ChatTab tripId={tripId} members={members} />
          </div>
        )}

        {activeTab === "settings" && (
          <div className="mt-6 space-y-10">
            <div id="members-section" className="scroll-mt-6">
              <MembersTab
                members={members}
                currentUserId={userId}
                tripId={tripId}
                inviteCode={trip.invite_code}
                error={membersError}
                onRefresh={loadMembers}
              />
            </div>
            <div className="border-t border-paper-line pt-8">
              <TripThemeEditor
                key={`${trip.header_color ?? ""}-${trip.header_text_color ?? ""}`}
                trip={trip}
                onSaved={handleThemeSaved}
              />
            </div>
            <div className="border-t border-paper-line pt-8">
              <SettingsTab onProfileSaved={loadMembers} />
            </div>
          </div>
        )}

        {activeTab === "timeline" && (
          <>
            {/* 日程タブ */}
            <div className="mt-6 flex flex-wrap gap-2">
              {dayNumbers.map((day) => (
                <button
                  key={day}
                  onClick={() => setActiveDay(day)}
                  className={`rounded-full px-4 py-2 text-sm font-medium ${
                    activeDay === day ? "" : "border border-paper-line bg-white/60 text-ink-text"
                  }`}
                  style={
                    activeDay === day ? { backgroundColor: theme.bg, color: theme.sub } : undefined
                  }
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
              {dayItems.map((item, index) => {
                const prev = index > 0 ? dayItems[index - 1] : null;
                const hasRoute = prev && prev.lat !== null && prev.lng !== null && item.lat !== null && item.lng !== null;
                const distanceKm = hasRoute
                  ? haversineDistanceKm({ lat: prev!.lat as number, lng: prev!.lng as number }, { lat: item.lat as number, lng: item.lng as number })
                  : null;

                // 電車は「最寄り駅があり、出発地と目的地で駅が別々」のときだけ使える
                const transitPlan =
                  hasRoute && distanceKm !== null
                    ? planTransit(
                        stations[stationKey(prev!.lat as number, prev!.lng as number)],
                        stations[stationKey(item.lat as number, item.lng as number)],
                        distanceKm
                      )
                    : null;
                // 通信エラーのときは「使えない」と決めつけず、再試行できるようにする
                const transitUnavailable =
                  transitPlan?.status === "unavailable" && transitPlan.kind !== "error";

                // 選ばれた手段: 利用者が選んだものを最優先。未選択のときだけ距離などから自動で提案する
                // (遠距離は海を渡る場合などで車が現実的でないため、自動では車にしない)
                let mode: TravelMode | null = null;
                if (distanceKm !== null) {
                  const saved = item.travel_mode ? normalizeMode(item.travel_mode, distanceKm) : null;
                  mode = saved ?? (distanceKm <= 1.2 ? "walking" : "transit");
                  if (mode === "transit" && transitUnavailable) {
                    if (distanceKm <= 2.5) mode = "walking";
                    else if (distanceKm <= 150) mode = normalizeMode("driving", distanceKm);
                  }
                }

                let estimate: TravelEstimate | null = null;
                let transitDetail: string | null = null;
                if (distanceKm !== null && mode) {
                  if (mode === "transit") {
                    if (transitPlan?.status === "ok") {
                      estimate = transitPlan.estimate;
                      transitDetail = transitPlan.detail;
                    }
                  } else {
                    estimate = estimateTravel(distanceKm, mode);
                  }
                }

                return (
                  <li key={item.id}>
                    {hasRoute && mode && (
                      <div className="mb-2 pl-2 text-xs text-ink-text/60">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>前の予定から</span>
                          <div className="flex flex-wrap gap-1">
                            {TRAVEL_MODES.map(({ key: m, label }) => {
                              const disabled = m === "transit" && transitUnavailable;
                              return (
                                <button
                                  key={m}
                                  onClick={() => changeTravelMode(item, m)}
                                  disabled={disabled}
                                  title={disabled && transitPlan?.status === "unavailable" ? transitPlan.reason : undefined}
                                  className={`rounded-full px-2 py-0.5 ${
                                    mode === m ? "bg-teal text-white" : "border border-paper-line"
                                  } ${disabled ? "cursor-not-allowed opacity-40 line-through" : ""}`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                          {estimate ? (
                            <span>
                              約{formatDuration(estimate.minutes)}・約
                              {estimate.distanceKm < 10
                                ? estimate.distanceKm.toFixed(1)
                                : Math.round(estimate.distanceKm).toLocaleString()}
                              km・概算¥{estimate.fareYen.toLocaleString()}
                              <span className="text-ink-text/40">({estimate.basis})</span>
                            </span>
                          ) : transitPlan?.status === "pending" ? (
                            <span>最寄り駅を確認中…</span>
                          ) : null}
                        </div>
                        {transitDetail && <p className="mt-0.5 text-ink-text/50">{transitDetail}</p>}
                        {mode === "transit" && transitPlan?.status === "ok" && transitPlan.walkingFaster && (
                          <p className="mt-0.5 text-amber-dark">{transitPlan.walkingFaster}</p>
                        )}
                        {transitPlan?.status === "unavailable" &&
                          (!item.travel_mode || item.travel_mode === "transit") && (
                            <p className="mt-0.5 text-amber-dark">
                              {transitPlan.reason}
                              {transitPlan.kind === "error" && (
                                <button onClick={retryStations} className="ml-2 underline">
                                  再試行
                                </button>
                              )}
                            </p>
                          )}
                      </div>
                    )}
                    <div className="flex items-start gap-3 rounded-2xl border border-paper-line bg-white/60 px-4 py-3">
                      <div className="w-16 shrink-0 pt-1 text-sm text-ink-text/60">
                        {item.start_time && <div>{item.start_time.slice(0, 5)}</div>}
                        {item.end_time && (
                          <div className="text-xs text-ink-text/40">〜{item.end_time.slice(0, 5)}</div>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-ink-text">{item.title}</p>
                        {item.note && <p className="mt-0.5 text-sm text-ink-text/60">{item.note}</p>}
                        {item.lat === null && (
                          <p className="mt-0.5 text-xs text-ink-text/40">(位置情報なし・地図には表示されません)</p>
                        )}
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
                    </div>
                  </li>
                );
              })}

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
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="場所(住所やスポット名、任意・地図/移動時間に使われます)"
                className="mt-2 w-full rounded-lg border border-paper-line bg-paper px-3 py-2 text-sm"
              />
              <input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="メモ(任意)"
                className="mt-2 w-full rounded-lg border border-paper-line bg-paper px-3 py-2 text-sm"
              />
              {locationNotice && (
                <p className="mt-2 text-xs text-amber-dark">{locationNotice}</p>
              )}
              {locationInfo && (
                <p className="mt-2 whitespace-pre-line text-xs text-teal">{locationInfo}</p>
              )}
              <button
                type="submit"
                disabled={adding || !newTitle.trim()}
                className="mt-3 rounded-lg bg-amber px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
              >
                {adding ? "追加中…" : "この日に追加"}
              </button>
            </form>
          </>
        )}
        </div>
      </section>
    </main>
  );
}

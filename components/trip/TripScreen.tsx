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
import EditTimelineModal from "./EditTimelineModal";
import AddTimelineModal from "./AddTimelineModal";
import TravelModeModal from "./TravelModeModal";

function TravelModeIcon({ mode, className = "h-4 w-4" }: { mode: TravelMode; className?: string }) {
  switch (mode) {
    case "walking":
      return <span className="text-base leading-none">👣</span>;
    case "transit":
      return (
        <svg className={`${className} text-teal`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 3h8a2 2 0 012 2v11a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zM8 7h8M8 11h8M9 18l-2 3M15 18l2 3" />
        </svg>
      );
    case "bus":
      return <span className="text-base leading-none">🚌</span>;
    case "taxi":
      return <span className="text-base leading-none">🚕</span>;
    case "car":
    case "driving":
    case "rental":
      return <span className="text-base leading-none">🚗</span>;
    case "airplane":
      return <span className="text-base leading-none">✈️</span>;
    case "ferry":
      return <span className="text-base leading-none">⛴️</span>;
    default:
      return (
        <svg className={`${className} text-teal`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 3h8a2 2 0 012 2v11a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zM8 7h8M8 11h8M9 18l-2 3M15 18l2 3" />
        </svg>
      );
  }
}

function getModeLabel(mode: TravelMode): string {
  switch (mode) {
    case "walking":
      return "徒歩";
    case "transit":
      return "電車";
    case "bus":
      return "バス";
    case "taxi":
      return "タクシー";
    case "car":
    case "driving":
      return "自動車";
    case "rental":
      return "レンタカー";
    case "airplane":
      return "飛行機";
    case "ferry":
      return "フェリー";
    default:
      return "移動";
  }
}

/** 1枚目の画像デザインに準拠した移動セクションカード */
function TravelSegmentCard({
  fromTitle,
  toTitle,
  mode,
  estimate,
  onClickChange,
}: {
  fromTitle: string;
  toTitle: string;
  mode: TravelMode;
  estimate: TravelEstimate | null;
  onClickChange: () => void;
}) {
  return (
    <div className="my-2.5 rounded-2xl border border-paper-line/80 bg-white p-3.5 sm:p-4 shadow-2xs transition hover:shadow-xs">
      {/* 上部: アイコン + 移動、右上に所要時間 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-teal font-bold text-sm">
          <TravelModeIcon mode={mode} className="h-4 w-4" />
          <span className="text-sm font-bold text-ink">移動</span>
        </div>
        <span className="text-xs sm:text-sm font-bold text-ink-text/80">
          {estimate ? formatDuration(estimate.minutes) : "--分"}
        </span>
      </div>

      {/* 中央: 出発地 → 目的地 */}
      <div className="mt-2">
        <p className="font-bold text-sm sm:text-base text-ink leading-snug">
          {fromTitle} → {toTitle}
        </p>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-xs text-ink-text/65 font-medium">
            {getModeLabel(mode)}・約{estimate ? estimate.fareYen.toLocaleString() : "0"}円
          </p>
          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
            {estimate?.basis.includes("実データ") || estimate?.basis.includes("駅") ? "実データ" : "推計"}
          </span>
        </div>
      </div>

      {/* 下部: 経路を確認・変更 › */}
      <div className="mt-2.5 pt-2 border-t border-paper-line/40">
        <button
          type="button"
          onClick={onClickChange}
          className="inline-flex items-center gap-1 text-xs font-bold text-teal transition hover:opacity-80 cursor-pointer min-h-[36px] py-1"
        >
          <span>経路を確認・変更</span>
          <span className="text-sm leading-none">›</span>
        </button>
      </div>
    </div>
  );
}

// 画面に出す移動手段(旧データの "driving" は normalizeMode でタクシー/自家用車に読み替える)
const TRAVEL_MODES: Array<{ key: Exclude<TravelMode, "driving">; label: string }> = [
  { key: "walking", label: "徒歩" },
  { key: "transit", label: "電車" },
  { key: "bus", label: "バス" },
  { key: "taxi", label: "タクシー" },
  { key: "car", label: "自動車" },
  { key: "airplane", label: "飛行機" },
  { key: "ferry", label: "フェリー" },
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
  const [editingItem, setEditingItem] = useState<TimelineItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedTravelSegment, setSelectedTravelSegment] = useState<{
    fromItem: TimelineItem;
    toItem: TimelineItem;
    currentMode: TravelMode;
  } | null>(null);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
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

  // タイムラインの予定だけを静かに取り直す。loadAll と違って画面全体を「読み込み中」にしないので、
  // チャットを開いたまま(AIのプランを反映した直後など)でも、チャットが作り直されずに済む
  const reloadItems = useCallback(async () => {
    const { data, error: itemsError } = await supabase
      .from("timeline_items")
      .select("id, trip_id, day_number, position, start_time, end_time, title, note, lat, lng, travel_mode")
      .eq("trip_id", tripId)
      .order("day_number", { ascending: true })
      .order("position", { ascending: true });
    if (!itemsError) setItems((data ?? []) as TimelineItem[]);
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

  async function handleAddModalItem(data: {
    title: string;
    dayNumber: number;
    startTime: string;
    endTime: string;
    location: string;
    note: string;
  }) {
    if (!data.title.trim()) return;

    setAdding(true);
    setLocationNotice(null);
    setLocationInfo(null);
    const dayFiltered = items.filter((it) => it.day_number === data.dayNumber);
    const maxPosition = dayFiltered.reduce((max, item) => Math.max(max, item.position), 0);

    let coords: { lat: number; lng: number } | null = null;
    if (data.location.trim()) {
      const result = await geocodeAddress(data.location.trim());
      if (result) {
        coords = { lat: result.lat, lng: result.lng };
        setLocationInfo(
          `「${data.title.trim()}」の位置: ${result.label}\n意図と違う場合は、編集から場所を修正してください。`
        );
      } else {
        setLocationNotice(
          "場所が見つからなかったため、位置情報なしで追加しました(地図には表示されません)。"
        );
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from("timeline_items")
      .insert({
        trip_id: tripId,
        day_number: data.dayNumber,
        position: maxPosition + 1000,
        start_time: data.startTime || null,
        end_time: data.endTime || null,
        title: data.title.trim(),
        note: data.note || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      })
      .select("id, trip_id, day_number, position, start_time, end_time, title, note, lat, lng, travel_mode")
      .single();
    setAdding(false);

    if (insertError || !inserted) {
      setError("予定を追加できませんでした。時間をおいて試してください。");
      return;
    }

    applyRealtimeChange("INSERT", inserted as TimelineItem, null);
    if (data.dayNumber !== activeDay) {
      setActiveDay(data.dayNumber);
    }
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

  const TAB_ICONS: Record<
    "timeline" | "map" | "checklist" | "chat" | "settings",
    (props: { className?: string }) => React.JSX.Element
  > = {
    timeline: ({ className = "h-5 w-5" }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    map: ({ className = "h-5 w-5" }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503-14.498l4.475 2.238a1.125 1.125 0 01.622.998v10.516a1.125 1.125 0 01-1.625.998l-4.475-2.238a1.125 1.125 0 00-.998 0l-5.002 2.501a1.125 1.125 0 01-.998 0l-4.475-2.238A1.125 1.125 0 012.25 18V7.484a1.125 1.125 0 011.625-.998l4.475 2.238a1.125 1.125 0 00.998 0l5.002-2.501a1.125 1.125 0 01.998 0z" />
      </svg>
    ),
    checklist: ({ className = "h-5 w-5" }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    chat: ({ className = "h-5 w-5" }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.974-.94 4.542 4.542 0 00.569-2.029C3.766 16.51 3 14.39 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
    settings: ({ className = "h-5 w-5" }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  };

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

  const isFullViewTab = activeTab === "chat" || activeTab === "map";

  return (
    <main
      className={`bg-paper ${
        isFullViewTab ? "h-[100dvh] overflow-hidden flex flex-col" : "min-h-screen pb-20 md:pb-0"
      }`}
    >
      {/* 通常ヘッダー（タイムライン・持ち物・設定） */}
      {!isFullViewTab && (
        <section
          className="rounded-b-[2rem] px-4 py-6 md:rounded-b-[2.5rem] md:px-12 md:py-10 shadow-xs"
          style={{ backgroundColor: theme.bg, color: theme.sub }}
        >
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs opacity-75 transition hover:opacity-100 sm:text-sm"
          >
            <span>←</span>
            <span>ホーム</span>
          </Link>
          <h1
            className="mt-2 font-display text-2xl font-bold leading-tight break-words sm:text-3xl md:text-4xl"
            style={{ color: theme.title }}
          >
            {trip.title}
          </h1>

          <div className="mt-3 sm:mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              onClick={() => {
                setActiveTab("settings");
                setTimeout(
                  () => document.getElementById("members-section")?.scrollIntoView({ behavior: "smooth" }),
                  50
                );
              }}
              className="flex items-center -space-x-2 rounded-full p-0.5 transition hover:opacity-90 cursor-pointer"
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
                  size={30}
                  ringColor={theme.bg}
                />
              ))}
              {members.length > 6 && (
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white/80 text-[11px] font-medium text-ink-text"
                  style={{ borderColor: theme.bg }}
                >
                  +{members.length - 6}
                </span>
              )}
            </button>
            <button
              onClick={copyInviteCode}
              className="rounded-lg border border-current/30 px-2.5 py-1 text-xs sm:text-sm opacity-85 transition hover:bg-current/10 cursor-pointer active:scale-95"
            >
              {copied ? "コピーしました！" : `招待: ${trip.invite_code}`}
            </button>
          </div>
        </section>
      )}

      {/* スリムヘッダー（地図・チャット用: 画面全体の縦スクロールを防止して表示領域を最大化） */}
      {isFullViewTab && (
        <header
          className="shrink-0 px-4 py-2.5 sm:px-6 md:px-12 md:py-3 shadow-xs flex items-center justify-between gap-3 z-20"
          style={{ backgroundColor: theme.bg, color: theme.sub }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs opacity-75 transition hover:opacity-100 shrink-0"
            >
              <span>←</span>
              <span className="hidden sm:inline">ホーム</span>
            </Link>
            <span className="opacity-30 text-xs">/</span>
            <h1
              className="font-display text-base sm:text-lg font-bold truncate"
              style={{ color: theme.title }}
            >
              {trip.title}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setActiveTab("settings");
                setTimeout(
                  () => document.getElementById("members-section")?.scrollIntoView({ behavior: "smooth" }),
                  50
                );
              }}
              className="flex items-center -space-x-1.5 rounded-full p-0.5 transition hover:opacity-90 cursor-pointer"
              title="メンバー全員を見る"
              aria-label="メンバー全員を見る"
            >
              {members.slice(0, 4).map((m) => (
                <Avatar
                  key={m.user_id}
                  name={m.display_name}
                  emoji={m.avatar_emoji}
                  color={m.avatar_color}
                  url={m.avatar_url}
                  size={24}
                  ringColor={theme.bg}
                />
              ))}
              {members.length > 4 && (
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full border bg-white/80 text-[10px] font-medium text-ink-text"
                  style={{ borderColor: theme.bg }}
                >
                  +{members.length - 4}
                </span>
              )}
            </button>
            <button
              onClick={copyInviteCode}
              className="rounded-lg border border-current/30 px-2 py-0.5 text-xs opacity-85 transition hover:bg-current/10 cursor-pointer active:scale-95"
            >
              {copied ? "コピー済" : "招待"}
            </button>
          </div>
        </header>
      )}

      <section
        className={`mx-auto w-full max-w-5xl ${
          isFullViewTab
            ? "flex-1 min-h-0 flex flex-col md:flex-row md:items-stretch md:gap-6 px-0 md:px-8 py-0 md:py-4 overflow-hidden"
            : "px-3.5 py-5 sm:px-6 md:flex md:items-start md:gap-8 md:px-12 md:py-8"
        }`}
      >
        {/* 画面タブ: PCは左サイドバー */}
        <nav className="hidden shrink-0 flex-col gap-1 md:flex md:w-48">
          {TABS.map((tab) => {
            const Icon = TAB_ICONS[tab.key];
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition cursor-pointer ${
                  isActive ? "shadow-xs" : "text-ink-text/60 hover:bg-paper-line/40"
                }`}
                style={
                  isActive ? { backgroundColor: theme.bg, color: theme.sub } : undefined
                }
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{tab.label}</span>
                  </span>
                  <Badge count={tab.badge ?? 0} />
                </span>
              </button>
            );
          })}
        </nav>

        {/* スマホ用ボトムナビゲーションバー: 画面下部固定、最低48pxのタップ領域を確保 */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-paper-line bg-paper/95 backdrop-blur-md px-1 pt-1.5 pb-[calc(env(safe-area-inset-bottom,0px)+6px)] shadow-[0_-2px_12px_rgba(0,0,0,0.06)] md:hidden">
          {TABS.map((tab) => {
            const Icon = TAB_ICONS[tab.key];
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex flex-1 min-h-[48px] flex-col items-center justify-center py-1 transition-colors cursor-pointer active:scale-95 ${
                  isActive ? "text-teal font-bold" : "text-ink-text/50 hover:text-ink-text"
                }`}
              >
                <div className="relative">
                  <Icon className={`h-5 w-5 transition-transform ${isActive ? "scale-110 text-teal" : ""}`} />
                  {tab.badge && tab.badge > 0 ? (
                    <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber px-1 text-[10px] font-bold text-ink shadow-xs">
                      {tab.badge > 99 ? "99+" : tab.badge}
                    </span>
                  ) : null}
                </div>
                <span className="mt-1 text-[11px] tracking-tight">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div
          className={`min-w-0 flex-1 ${
            isFullViewTab
              ? "h-full flex flex-col overflow-hidden pb-[calc(env(safe-area-inset-bottom,0px)+56px)] md:pb-0"
              : "pb-20 md:pb-0"
          }`}
        >
        {activeTab === "checklist" && (
          <div className="mt-6">
            <ChecklistTab tripId={tripId} members={members} />
          </div>
        )}

        {activeTab === "map" && (
          <div className="h-full flex flex-col min-h-0">
            <MapTab
              trip={trip}
              dayNumber={activeDay}
              dayNumbers={dayNumbers}
              onSelectDay={setActiveDay}
              dayItems={dayItems}
              onAddSpot={handleQuickAddSpot}
              selectedSpotId={selectedSpotId}
            />
          </div>
        )}

        {activeTab === "chat" && (
          <div className="h-full flex flex-col min-h-0">
            <ChatTab
              tripId={tripId}
              members={members}
              trip={trip}
              timelineItems={items}
              onTimelineUpdated={reloadItems}
            />
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
          <div className="w-full max-w-4xl mx-auto pb-24 md:pb-12 pt-2">
            {/* 日程タブ: スマホでは横スクロール（最低44pxのタップ領域） */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1.5 -mx-3.5 px-3.5 sm:mx-0 sm:px-0">
                {dayNumbers.map((day) => (
                  <button
                    key={day}
                    onClick={() => setActiveDay(day)}
                    className={`min-h-[44px] shrink-0 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition cursor-pointer active:scale-95 ${
                      activeDay === day
                        ? "shadow-sm"
                        : "border border-paper-line bg-white/80 text-ink-text/80 hover:bg-white"
                    }`}
                    style={
                      activeDay === day
                        ? { backgroundColor: theme.bg, color: theme.sub }
                        : undefined
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
                    className="min-h-[44px] shrink-0 rounded-full border border-dashed border-amber px-3.5 py-2 text-xs sm:text-sm font-semibold text-amber-dark hover:bg-amber/10 cursor-pointer active:scale-95"
                  >
                    + 日を追加
                  </button>
                )}
              </div>

              {/* タイムライン項目（縦1列・全幅表示） */}
              <ul className="mt-3 space-y-2.5">
                {dayItems.map((item, index) => {
                  const prev = index > 0 ? dayItems[index - 1] : null;
                  const hasRoute =
                    prev &&
                    prev.lat !== null &&
                    prev.lng !== null &&
                    item.lat !== null &&
                    item.lng !== null;
                  const distanceKm = hasRoute
                    ? haversineDistanceKm(
                        { lat: prev!.lat as number, lng: prev!.lng as number },
                        { lat: item.lat as number, lng: item.lng as number }
                      )
                    : null;

                  const transitPlan =
                    hasRoute && distanceKm !== null
                      ? planTransit(
                          stations[stationKey(prev!.lat as number, prev!.lng as number)],
                          stations[stationKey(item.lat as number, item.lng as number)],
                          distanceKm
                        )
                      : null;

                  let mode: TravelMode = item.travel_mode
                    ? normalizeMode(item.travel_mode, distanceKm ?? 10)
                    : distanceKm !== null && distanceKm <= 1.2
                    ? "walking"
                    : "transit";

                  let estimate: TravelEstimate | null = null;
                  if (distanceKm !== null && mode) {
                    if (mode === "transit") {
                      if (transitPlan?.status === "ok") {
                        estimate = transitPlan.estimate;
                      } else {
                        estimate = estimateTravel(distanceKm, "transit");
                      }
                    } else {
                      estimate = estimateTravel(distanceKm, mode);
                    }
                  }

                  const isSelected = selectedSpotId === item.id;

                  return (
                    <li key={item.id} className="w-full">
                      {/* 1枚目画像の移動カード仕様 */}
                      {hasRoute && mode && (
                        <TravelSegmentCard
                          fromTitle={prev!.title}
                          toTitle={item.title}
                          mode={mode}
                          estimate={estimate}
                          onClickChange={() =>
                            setSelectedTravelSegment({
                              fromItem: prev!,
                              toItem: item,
                              currentMode: mode,
                            })
                          }
                        />
                      )}

                      {/* 予定カード（全幅表示） */}
                      <div
                        className={`w-full flex items-start gap-3 rounded-2xl border bg-white p-3.5 sm:p-4 transition cursor-pointer shadow-2xs hover:shadow-xs active:scale-[0.99] ${
                          isSelected
                            ? "border-teal ring-2 ring-teal/30 bg-teal/5"
                            : "border-paper-line/80 hover:border-paper-line"
                        }`}
                        onClick={() => {
                          setSelectedSpotId(item.id);
                        }}
                      >
                        {/* 時間列 */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingItem(item);
                          }}
                          className="w-14 sm:w-16 shrink-0 pt-0.5 text-xs sm:text-sm font-bold text-ink-text/80 cursor-pointer"
                          title="クリックして時間を編集"
                        >
                          {item.start_time && (
                            <div className="text-sm font-bold text-ink">
                              {item.start_time.slice(0, 5)}
                            </div>
                          )}
                          {item.end_time && (
                            <div className="text-xs text-ink-text/50">
                              〜{item.end_time.slice(0, 5)}
                            </div>
                          )}
                          {!item.start_time && !item.end_time && (
                            <div className="text-xs text-ink-text/40 font-normal">時間未定</div>
                          )}
                        </div>

                        {/* 本文（タイトル・メモ） */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingItem(item);
                          }}
                          className="min-w-0 flex-1 cursor-pointer"
                        >
                          <p className="font-bold text-base sm:text-lg text-ink leading-snug break-words">
                            {item.title}
                          </p>
                          {item.note && (
                            <p className="mt-1 text-xs sm:text-sm text-ink-text/70 leading-relaxed whitespace-pre-wrap">
                              {item.note}
                            </p>
                          )}
                          {item.lat === null && (
                            <p className="mt-1 text-[11px] text-ink-text/40 font-normal">
                              (位置情報なし・地図には表示されません)
                            </p>
                          )}
                        </div>

                        {/* アクションボタン群（最低44pxのタップ領域） */}
                        <div
                          className="flex shrink-0 items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* 地図連携ボタン */}
                          {item.lat !== null && item.lng !== null && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedSpotId(item.id);
                                setActiveTab("map");
                              }}
                              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-teal hover:bg-teal/10 transition cursor-pointer"
                              title="地図で位置を確認"
                              aria-label="地図で確認"
                            >
                              <span className="text-base">📍</span>
                            </button>
                          )}

                          {/* 編集ボタン */}
                        
                          {/* 順序入れ替えボタン */}
                          <div className="flex flex-col">
                            <button
                              onClick={() => moveItem(item, "up")}
                              disabled={index === 0}
                              className="flex h-5 w-6 items-center justify-center rounded text-xs text-ink-text/50 hover:bg-paper-line/50 disabled:opacity-20 cursor-pointer"
                              aria-label="上へ"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => moveItem(item, "down")}
                              disabled={index === dayItems.length - 1}
                              className="flex h-5 w-6 items-center justify-center rounded text-xs text-ink-text/50 hover:bg-paper-line/50 disabled:opacity-20 cursor-pointer"
                              aria-label="下へ"
                            >
                              ▼
                            </button>
                          </div>

                          {/* 削除ボタン */}
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="min-h-[44px] min-w-[36px] flex items-center justify-center rounded-xl text-lg text-ink-text/40 transition hover:bg-red-50 hover:text-red-700 cursor-pointer"
                            aria-label="削除"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}

                {dayItems.length === 0 && (
                  <li className="rounded-2xl border border-dashed border-paper-line p-8 text-center text-sm text-ink-text/60 bg-white/40">
                    <p className="text-base font-semibold text-ink">予定がまだありません</p>
                    <p className="mt-1 text-xs text-ink-text/60">
                      下の「＋ 予定を追加」ボタンから予定を登録しましょう。
                    </p>
                  </li>
                )}
              </ul>

              {/* タイムライン下部の＋ボタン（最初の画面表示はフォームではなく＋だけ） */}
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="w-full min-h-[48px] rounded-2xl border-2 border-dashed border-paper-line/80 bg-white/70 hover:bg-white hover:border-amber py-3 px-4 text-sm font-bold text-ink-text/80 transition flex items-center justify-center gap-2 cursor-pointer active:scale-98 shadow-2xs"
                >
                  <span className="text-lg leading-none text-amber-dark">＋</span>
                  <span>新しい予定を追加</span>
                </button>
              </div>
          </div>
        )}
        </div>
      </section>

      {/* スマホ用 右下固定の大きなフローティング「＋」ボタン */}
      {activeTab === "timeline" && (
        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          aria-label="予定を追加"
          className="fixed right-5 bottom-20 md:hidden z-30 flex h-14 w-14 items-center justify-center rounded-full bg-amber text-ink shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer"
        >
          <svg
            className="h-7 w-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      )}

      {/* 予定追加モーダル / ボトムシート */}
      <AddTimelineModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        dayNumber={activeDay}
        dayNumbers={dayNumbers}
        onAdd={handleAddModalItem}
        adding={adding}
        locationNotice={locationNotice}
        locationInfo={locationInfo}
      />

      {/* 移動方法選択モーダル / ボトムシート（2枚目画像仕様） */}
      {selectedTravelSegment && (
        <TravelModeModal
          isOpen={selectedTravelSegment !== null}
          onClose={() => setSelectedTravelSegment(null)}
          fromItem={selectedTravelSegment.fromItem}
          toItem={selectedTravelSegment.toItem}
          currentMode={selectedTravelSegment.currentMode}
          stations={stations}
          onSelectMode={async (mode) => {
            await changeTravelMode(selectedTravelSegment.toItem, mode);
          }}
        />
      )}

      {/* タイムライン予定編集モーダル / ボトムシート */}
      <EditTimelineModal
        isOpen={editingItem !== null}
        item={editingItem}
        dayNumbers={dayNumbers}
        onClose={() => setEditingItem(null)}
        onSave={(updated) => {
          applyRealtimeChange("UPDATE", updated, null);
        }}
      />
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Avatar from "./Avatar";

export type TripMember = {
  user_id: string;
  display_name: string;
  role?: string;
  joined_at?: string;
  avatar_emoji?: string | null;
  avatar_color?: string | null;
  avatar_url?: string | null;
};

type BanRow = {
  user_id: string;
  display_name: string | null;
  created_at: string;
};

/** Supabase側にBAN用のSQL(migration_members.sql)が入っていないときのエラーかどうか */
function isMissingBanSetup(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "PGRST202" || error?.code === "42P01";
}

const SETUP_MESSAGE =
  "BAN機能の準備がまだです。Supabaseで migration_members.sql を実行してください。";

/**
 * 旅行に参加している全メンバーの一覧(設定タブの中に置く)。
 * 作成者(オーナー)だけは、メンバーをBAN(退出させて再参加も禁止)したり、BANを解除したりできる。
 */
export default function MembersTab({
  members,
  currentUserId,
  tripId,
  inviteCode,
  error,
  onRefresh,
}: {
  members: TripMember[];
  currentUserId: string | null;
  tripId: string;
  inviteCode: string;
  error?: string | null;
  onRefresh: () => Promise<void>;
}) {
  const supabase = createClient();
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const [bans, setBans] = useState<BanRow[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banMessage, setBanMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const isOwner = members.some((m) => m.user_id === currentUserId && m.role === "owner");

  const loadBans = useCallback(async () => {
    const { data, error: bansError } = await supabase
      .from("trip_bans")
      .select("user_id, display_name, created_at")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false });
    if (bansError) {
      if (isMissingBanSetup(bansError)) setBanMessage({ type: "error", text: SETUP_MESSAGE });
      return;
    }
    setBans((data ?? []) as BanRow[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- supabaseは呼び出しごとに新しい参照になるため依存に含めない
  }, [tripId]);

  useEffect(() => {
    if (!isOwner) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- オーナーと分かった時点でBAN一覧を取得するため意図的
    loadBans();
  }, [isOwner, loadBans]);

  async function handleRefresh() {
    setRefreshing(true);
    await onRefresh();
    if (isOwner) await loadBans();
    setRefreshing(false);
  }

  function copyCode() {
    navigator.clipboard.writeText(inviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleBan(member: TripMember) {
    setBusyId(member.user_id);
    setBanMessage(null);
    const { error: rpcError } = await supabase.rpc("ban_member", {
      _trip_id: tripId,
      _user_id: member.user_id,
    });
    setBusyId(null);
    setConfirmingId(null);

    if (rpcError) {
      setBanMessage({
        type: "error",
        text: isMissingBanSetup(rpcError)
          ? SETUP_MESSAGE
          : "BANできませんでした。作成者のアカウントでログインしているか確認してください。",
      });
      return;
    }
    setBanMessage({ type: "ok", text: `${member.display_name}さんをBANしました。` });
    await onRefresh();
    await loadBans();
  }

  async function handleUnban(ban: BanRow) {
    setBusyId(ban.user_id);
    setBanMessage(null);
    const { error: rpcError } = await supabase.rpc("unban_member", {
      _trip_id: tripId,
      _user_id: ban.user_id,
    });
    setBusyId(null);

    if (rpcError) {
      setBanMessage({
        type: "error",
        text: isMissingBanSetup(rpcError) ? SETUP_MESSAGE : "BANを解除できませんでした。",
      });
      return;
    }
    setBanMessage({
      type: "ok",
      text: `${ban.display_name ?? "このメンバー"}のBANを解除しました。招待コードからまた参加できます。`,
    });
    await loadBans();
  }

  // オーナーを先頭に、あとは参加が早い順
  const sorted = [...members].sort((a, b) => {
    if (a.role === "owner" && b.role !== "owner") return -1;
    if (b.role === "owner" && a.role !== "owner") return 1;
    return (a.joined_at ?? "").localeCompare(b.joined_at ?? "");
  });

  return (
    <div className="max-w-md">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg text-ink">メンバー(全{members.length}人)</h3>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded-lg border border-paper-line px-3 py-1 text-xs text-ink-text/70 hover:bg-paper-line/30 disabled:opacity-50"
        >
          {refreshing ? "更新中…" : "最新の状態に更新"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <ul className="mt-3 space-y-2">
        {sorted.map((m) => {
          const isMe = m.user_id === currentUserId;
          const canBan = isOwner && !isMe && m.role !== "owner";
          const confirming = confirmingId === m.user_id;
          const busy = busyId === m.user_id;
          return (
            <li
              key={m.user_id}
              className="rounded-2xl border border-paper-line bg-white/60 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Avatar
                  name={m.display_name}
                  emoji={m.avatar_emoji}
                  color={m.avatar_color}
                  url={m.avatar_url}
                  size={36}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink-text">{m.display_name}</p>
                  {m.joined_at && (
                    <p className="text-xs text-ink-text/50">
                      {new Date(m.joined_at).toLocaleDateString("ja-JP", {
                        month: "numeric",
                        day: "numeric",
                      })}
                      に参加
                    </p>
                  )}
                </div>
                {m.role === "owner" && (
                  <span className="rounded-full bg-amber/20 px-2 py-0.5 text-xs text-amber-dark">
                    作成者
                  </span>
                )}
                {isMe && (
                  <span className="rounded-full bg-teal-soft px-2 py-0.5 text-xs text-teal">あなた</span>
                )}
                {/* {canBan && !confirming && (
                  <button
                    onClick={() => setConfirmingId(m.user_id)}
                    className="rounded-lg border border-paper-line px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
                  >
                    BAN
                  </button>
                )} */}
              </div>

              {canBan && confirming && (
                <div className="mt-3 rounded-xl bg-red-50 px-3 py-3">
                  <p className="text-xs text-red-800">
                    {m.display_name}さんをこの旅行から外し、招待コードを使っても再参加できないようにします。よろしいですか?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => handleBan(m)}
                      disabled={busy}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {busy ? "処理中…" : "BANする"}
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      disabled={busy}
                      className="rounded-lg border border-paper-line bg-white px-3 py-1.5 text-xs text-ink-text/70"
                    >
                      やめる
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {banMessage && (
        <p className={`mt-3 text-xs ${banMessage.type === "ok" ? "text-teal" : "text-red-700"}`}>
          {banMessage.text}
        </p>
      )}

      {isOwner && bans.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-ink-text">BAN中のメンバー</h4>
          <ul className="mt-2 space-y-2">
            {bans.map((b) => (
              <li
                key={b.user_id}
                className="flex items-center gap-3 rounded-2xl border border-dashed border-paper-line px-4 py-2.5"
              >
                <p className="min-w-0 flex-1 truncate text-sm text-ink-text/70">
                  {b.display_name ?? "名前なし"}
                </p>
                <button
                  onClick={() => handleUnban(b)}
                  disabled={busyId === b.user_id}
                  className="rounded-lg border border-paper-line px-2.5 py-1 text-xs text-ink-text/70 hover:bg-paper-line/30 disabled:opacity-50"
                >
                  {busyId === b.user_id ? "処理中…" : "BAN解除"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-xs text-ink-text/50">
        自分の名前とアイコンは、このページ下の「表示名」「アイコン」で変更できます。「名無しさん」のままの人には、変更をお願いしてみてください。
      </p>

      <div className="mt-6 rounded-2xl border border-dashed border-paper-line px-4 py-4">
        <p className="text-sm font-medium text-ink-text">メンバーを招待する</p>
        <p className="mt-1 text-xs text-ink-text/60">
          招待コードを伝えると、ホーム画面の「招待コードで参加」から入れます。
        </p>
        <button
          onClick={copyCode}
          className="mt-2.5 w-full sm:w-auto rounded-lg border border-paper-line bg-white px-3.5 py-2 font-mono text-sm text-ink-text hover:bg-paper-line/20 active:scale-95 transition cursor-pointer text-center shadow-2xs"
        >
          {copied ? "✅ コピーしました！" : `${inviteCode} (タップでコピー)`}
        </button>
      </div>
    </div>
  );
}

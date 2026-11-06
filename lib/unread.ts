import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * チャットの未読バッジ用。「どこまで読んだか」はこの端末(ブラウザ)にだけ保存する。
 * 旅行 × ユーザーごとに別々に記録するので、同じ端末で別アカウントを使っても混ざらない。
 */
const key = (tripId: string, userId: string) => `tripchat:chat-read:${tripId}:${userId}`;

/** 最後に読んだ時刻(ISO文字列)。未記録なら「今」を記録して返す(初回に過去分が全部未読になるのを防ぐ) */
export function getLastRead(tripId: string, userId: string): string {
  try {
    const saved = localStorage.getItem(key(tripId, userId));
    if (saved) return saved;
    const now = new Date().toISOString();
    localStorage.setItem(key(tripId, userId), now);
    return now;
  } catch {
    // localStorage が使えない環境では、未読を数えない
    return new Date().toISOString();
  }
}

export function markChatRead(tripId: string, userId: string, at: string = new Date().toISOString()) {
  try {
    localStorage.setItem(key(tripId, userId), at);
  } catch {
    // 保存できなくても動作には影響しない
  }
}

/** 他のメンバーが、最後に読んだ時刻より後に送ったメッセージの数 */
export async function countUnreadChat(
  supabase: SupabaseClient,
  tripId: string,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("trip_messages")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .neq("user_id", userId)
    .gt("created_at", getLastRead(tripId, userId));
  return error ? 0 : (count ?? 0);
}

/** バッジに出す文字(99件を超えたら 99+) */
export function formatBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

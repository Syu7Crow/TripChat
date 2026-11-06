/**
 * ユーザーIDとSupabase Auth内部メールアドレスの変換・フォーマットユーティリティ
 */

export const INTERNAL_EMAIL_DOMAIN = "@tripchat.local";

/**
 * ユーザーIDを内部用メールアドレスに変換
 * 例: "taro_123" -> "taro_123@tripchat.local"
 */
export function idToInternalEmail(username: string): string {
  return `${username.toLowerCase().trim()}${INTERNAL_EMAIL_DOMAIN}`;
}

/**
 * 内部用メールアドレスまたはGoogleメールから、ユーザー向け表示ラベルを取得
 */
export function formatAccountLabel(email: string | null | undefined): string {
  if (!email) return "ゲスト";
  if (email.endsWith(INTERNAL_EMAIL_DOMAIN)) {
    const rawId = email.replace(INTERNAL_EMAIL_DOMAIN, "");
    return `ID: ${rawId}`;
  }
  return `Google (${email})`;
}

/**
 * ユーザーIDのバリデーション (半角英数字とアンダースコア、ハイフン、3〜24文字)
 */
export function validateUsername(id: string): { ok: boolean; message?: string } {
  const trimmed = id.trim();
  if (trimmed.length < 3) {
    return { ok: false, message: "ユーザーIDは3文字以上で入力してください。" };
  }
  if (trimmed.length > 24) {
    return { ok: false, message: "ユーザーIDは24文字以内で入力してください。" };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { ok: false, message: "ユーザーIDには半角英数字、アンダースコア(_)、ハイフン(-)のみ使用できます。" };
  }
  return { ok: true };
}


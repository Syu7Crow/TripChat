/** メンバーのアイコン(絵文字 + 背景色)の定義。画像アップロードは使わず、DBには文字列だけを保存する */

export const AVATAR_EMOJIS = [
  "✈️", "🗺️", "🏔️", "🏖️", "🏯", "⛩️", "🚃", "🚌",
  "🍜", "🍣", "☕", "🍙", "📷", "🎒", "🧳", "🌸",
  "🍁", "⛄", "🌊", "🌅", "🐱", "🐶", "🦊", "🐼",
  "🐧", "🦉", "🐻", "🐰",
] as const;

export const DEFAULT_AVATAR_COLOR = "#4c9a90"; // ティール(これまでのアイコンの色)

export const AVATAR_COLORS = [
  "#4c9a90", // ティール
  "#e69a35", // アンバー
  "#24333f", // 紺
  "#c8553d", // 赤茶
  "#3f7cac", // 青
  "#6b8e4e", // 緑
  "#7a5fa5", // 紫
  "#d4708a", // ピンク
] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;

/** 写真アイコンを入れる Supabase Storage のバケット名(migration_avatar_photo.sql で作成) */
export const AVATAR_BUCKET = "avatars";

/** 選べる写真の元ファイルの大きさの上限(MB)。保存前に小さく切り抜くので、元はやや大きくてもよい */
export const MAX_PHOTO_MB = 10;

/** 自分のStorageの公開URLだけを写真として扱う(DB側にも同じ制約がある) */
const PHOTO_URL = /^https?:\/\/[^/\s]+\/storage\/v1\/object\/public\/avatars\/[^?#\s]+$/;

export function isValidAvatarUrl(url: string | null | undefined): url is string {
  return !!url && PHOTO_URL.test(url);
}

/** 公開URLから、バケット内のファイルパス(例: "ユーザーID/avatar-123.jpg")を取り出す */
export function avatarPathFromUrl(url: string | null | undefined): string | null {
  if (!isValidAvatarUrl(url)) return null;
  return decodeURIComponent(url.split(`/object/public/${AVATAR_BUCKET}/`)[1] ?? "") || null;
}

export type AvatarInfo = {
  emoji: string | null;
  color: string;
  /** 写真のURL。あれば絵文字より優先して表示する */
  url: string | null;
};

/** DBの値から、画面で使うアイコン情報を決める(未設定・不正な値は初期のアイコンにする) */
export function resolveAvatar(
  emoji: string | null | undefined,
  color: string | null | undefined,
  url?: string | null
): AvatarInfo {
  const okEmoji = emoji && (AVATAR_EMOJIS as readonly string[]).includes(emoji) ? emoji : null;
  const okColor = color && HEX.test(color) ? color : DEFAULT_AVATAR_COLOR;
  return { emoji: okEmoji, color: okColor, url: isValidAvatarUrl(url) ? url : null };
}

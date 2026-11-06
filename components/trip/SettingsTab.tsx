"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import { formatAccountLabel } from "@/lib/auth-utils";
import {
  AVATAR_BUCKET,
  AVATAR_COLORS,
  AVATAR_EMOJIS,
  MAX_PHOTO_MB,
  avatarPathFromUrl,
  resolveAvatar,
} from "@/lib/avatar";
import Avatar from "./Avatar";
import AvatarCropper from "./AvatarCropper";

export default function SettingsTab({
  onProfileSaved,
}: {
  /** 名前・アイコンを保存した後に呼ばれる(旅行画面のメンバー表示を最新にするため) */
  onProfileSaved?: () => void | Promise<void>;
}) {
  const supabase = createClient();
  const router = useRouter();
  const { userId, email, isAnonymous, ready } = useSupabaseUser();

  const [displayName, setDisplayName] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // アイコン(写真 > 絵文字 + 背景色)。avatarReady / photoReady が false のときは、DBに列がまだ無い状態
  const [avatarEmoji, setAvatarEmoji] = useState<string | null>(null);
  const [avatarColor, setAvatarColor] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [savedAvatar, setSavedAvatar] = useState<{
    emoji: string | null;
    color: string | null;
    url: string | null;
  }>({ emoji: null, color: null, url: null });
  const [avatarReady, setAvatarReady] = useState(true);
  const [photoReady, setPhotoReady] = useState(true);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<{ type: "ok" | "error"; text: string } | null>(
    null
  );

  // 写真の切り抜き
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropError, setCropError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (!ready || !userId) return;

    let cancelled = false;
    async function run() {
      // アイコンの列(migration_members.sql / migration_avatar_photo.sql)が未適用でも名前は編集できるよう、
      // 失敗したら取る列を減らして取り直す
      type ProfileRow = {
        display_name: string | null;
        avatar_emoji?: string | null;
        avatar_color?: string | null;
        avatar_url?: string | null;
      };
      const attempts = [
        { columns: "display_name, avatar_emoji, avatar_color, avatar_url", avatar: true, photo: true },
        { columns: "display_name, avatar_emoji, avatar_color", avatar: true, photo: false },
        { columns: "display_name", avatar: false, photo: false },
      ];
      let profile: ProfileRow | null = null;
      let hasAvatarColumns = false;
      let hasPhotoColumn = false;
      for (const attempt of attempts) {
        const result = await supabase
          .from("profiles")
          .select(attempt.columns)
          .eq("id", userId as string)
          .single();
        if (result.error?.code === "42703") continue;
        profile = result.data as unknown as ProfileRow | null;
        hasAvatarColumns = attempt.avatar;
        hasPhotoColumn = attempt.photo;
        break;
      }

      if (!cancelled) {
        const emoji = profile?.avatar_emoji ?? null;
        const color = profile?.avatar_color ?? null;
        const url = profile?.avatar_url ?? null;
        setDisplayName(profile?.display_name ?? "");
        setAvatarEmoji(emoji);
        setAvatarColor(color);
        setAvatarUrl(url);
        setSavedAvatar({ emoji, color, url });
        setAvatarReady(hasAvatarColumns);
        setPhotoReady(hasPhotoColumn);
        setLoadingProfile(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- supabaseは呼び出しごとに新しい参照になるため依存に含めない
  }, [ready, userId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !displayName.trim()) return;

    setSaving(true);
    await supabase.from("profiles").update({ display_name: displayName.trim() }).eq("id", userId);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await onProfileSaved?.();
  }

  const avatarDirty =
    avatarEmoji !== savedAvatar.emoji ||
    avatarColor !== savedAvatar.color ||
    avatarUrl !== savedAvatar.url;

  /** 使わなくなった写真をStorageから消す(失敗しても利用には影響しないので無視する) */
  async function removePhotoFile(url: string | null) {
    const path = avatarPathFromUrl(url);
    if (!path) return;
    try {
      await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    } catch {
      // 消せなくても、アイコンの表示には影響しない
    }
  }

  async function handleSaveAvatar() {
    if (!userId) return;
    setSavingAvatar(true);
    setAvatarMessage(null);
    // .select() で実際に更新された行を受け取る(権限で拒否されるとエラーなしで0行になるため)
    const { data: updated, error } = await supabase
      .from("profiles")
      .update({
        avatar_emoji: avatarEmoji,
        avatar_color: avatarColor,
        ...(photoReady ? { avatar_url: avatarUrl } : null),
      })
      .eq("id", userId)
      .select("id");
    setSavingAvatar(false);

    if (error || !updated || updated.length === 0) {
      setAvatarMessage({
        type: "error",
        text:
          error?.code === "42703"
            ? "アイコンの保存先がまだ用意されていません(migration_members.sql と migration_avatar_photo.sql をSupabaseで実行してください)。"
            : "保存できませんでした。時間をおいて試してください。",
      });
      return;
    }
    if (savedAvatar.url && savedAvatar.url !== avatarUrl) await removePhotoFile(savedAvatar.url);
    setSavedAvatar({ emoji: avatarEmoji, color: avatarColor, url: avatarUrl });
    setAvatarMessage({ type: "ok", text: "保存しました。" });
    await onProfileSaved?.();
  }

  // 端末の写真を選んだら、切り抜き画面を開く
  function handlePickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同じ写真をもう一度選べるようにする
    if (!file) return;

    setAvatarMessage(null);
    if (!file.type.startsWith("image/")) {
      setAvatarMessage({ type: "error", text: "写真(画像ファイル)を選んでください。" });
      return;
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      setAvatarMessage({
        type: "error",
        text: `写真が大きすぎます。${MAX_PHOTO_MB}MB以下の写真を選んでください。`,
      });
      return;
    }
    setCropError(null);
    setCropFile(file);
  }

  // 切り抜いた写真をアップロードし、そのままアイコンとして保存する
  async function handleCropConfirm(blob: Blob) {
    if (!userId) return;
    setUploadingPhoto(true);
    setCropError(null);

    // 毎回ちがうファイル名にして、古い写真がキャッシュで残らないようにする
    const path = `${userId}/avatar-${Date.now()}.jpg`;
    const upload = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });
    if (upload.error) {
      setUploadingPhoto(false);
      setCropError(
        /not found/i.test(upload.error.message)
          ? "写真の保存先がまだ用意されていません(migration_avatar_photo.sql をSupabaseで実行してください)。"
          : "写真をアップロードできませんでした。時間をおいて試してください。"
      );
      return;
    }

    const url = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
    const { data: updated, error } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", userId)
      .select("id");
    setUploadingPhoto(false);

    if (error || !updated || updated.length === 0) {
      await removePhotoFile(url); // 保存に失敗したので、アップロードした写真も消しておく
      setCropError(
        error?.code === "42703"
          ? "写真の保存先がまだ用意されていません(migration_avatar_photo.sql をSupabaseで実行してください)。"
          : "写真を保存できませんでした。時間をおいて試してください。"
      );
      return;
    }

    if (savedAvatar.url) await removePhotoFile(savedAvatar.url);
    setAvatarUrl(url);
    setSavedAvatar((prev) => ({ ...prev, url }));
    setCropFile(null);
    setAvatarMessage({ type: "ok", text: "写真をアイコンにしました。" });
    await onProfileSaved?.();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (!ready || loadingProfile) {
    return <p className="text-sm text-ink-text/50">読み込み中…</p>;
  }

  return (
    <div className="max-w-sm space-y-8">
      <div>
        <h3 className="font-display text-lg text-ink">表示名</h3>
        <p className="mt-1 text-sm text-ink-text/60">
          メンバー一覧やチャットで表示される名前です。
        </p>
        <form onSubmit={handleSave} className="mt-3 flex gap-2">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="flex-1 rounded-lg border border-paper-line bg-white px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={saving || !displayName.trim()}
            className="rounded-lg bg-amber px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </form>
        {saved && <p className="mt-1 text-xs text-teal">保存しました</p>}
      </div>

      <div className="border-t border-paper-line pt-6">
        <h3 className="font-display text-lg text-ink">アイコン</h3>
        <p className="mt-1 text-sm text-ink-text/60">
          メンバー一覧やチャットで、名前の横に表示されます。
        </p>

        <div className="mt-3 flex items-center gap-3">
          <Avatar
            name={displayName || "?"}
            emoji={avatarEmoji}
            color={avatarColor}
            url={avatarUrl}
            size={56}
          />
          <p className="text-xs text-ink-text/50">プレビュー</p>
        </div>

        <p className="mt-4 text-xs text-ink-text/50">写真</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label
            className={`rounded-lg border border-paper-line bg-white px-3 py-2 text-sm text-ink-text focus-within:ring-2 focus-within:ring-teal ${
              photoReady && avatarReady ? "cursor-pointer hover:bg-paper-line/30" : "cursor-not-allowed opacity-50"
            }`}
          >
            📷 写真を選ぶ
            <input
              type="file"
              accept="image/*"
              disabled={!photoReady || !avatarReady || uploadingPhoto}
              onChange={handlePickPhoto}
              className="sr-only"
            />
          </label>
          {avatarUrl && (
            <button
              type="button"
              onClick={() => setAvatarUrl(null)}
              className="rounded-lg border border-paper-line px-3 py-2 text-sm text-ink-text/70 hover:bg-paper-line/30"
            >
              写真をやめる
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-ink-text/50">
          端末の写真から選べます。選んだあとに、丸い枠で表示する範囲を決められます。
          {avatarUrl && "「写真をやめる」のあとは「このアイコンで保存」を押してください。"}
        </p>
        {avatarReady && !photoReady && (
          <p className="mt-1 text-xs text-amber-dark">
            写真の保存先がまだ用意されていません(migration_avatar_photo.sql をSupabaseで実行してください)。
          </p>
        )}

        <p className="mt-4 text-xs text-ink-text/50">絵文字</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              setAvatarEmoji(null);
              setAvatarUrl(null);
            }}
            aria-pressed={avatarEmoji === null && !avatarUrl}
            className={`flex h-9 items-center justify-center rounded-lg border px-2 text-xs ${
              avatarEmoji === null && !avatarUrl
                ? "border-teal bg-teal-soft text-teal"
                : "border-paper-line bg-white text-ink-text/70"
            }`}
          >
            名前の1文字
          </button>
          {AVATAR_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setAvatarEmoji(emoji);
                setAvatarUrl(null);
              }}
              aria-pressed={avatarEmoji === emoji && !avatarUrl}
              aria-label={`アイコンを${emoji}にする`}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border text-lg ${
                avatarEmoji === emoji && !avatarUrl
                  ? "border-teal bg-teal-soft"
                  : "border-paper-line bg-white hover:bg-paper-line/30"
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>

        <p className="mt-4 text-xs text-ink-text/50">背景の色</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {AVATAR_COLORS.map((color) => {
            const selected = resolveAvatar(null, avatarColor).color === color;
            return (
              <button
                key={color}
                type="button"
                onClick={() => setAvatarColor(color)}
                aria-pressed={selected}
                aria-label={`背景色 ${color}`}
                className={`h-8 w-8 rounded-full border-2 ${selected ? "border-ink" : "border-transparent"}`}
                style={{ backgroundColor: color }}
              />
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSaveAvatar}
            disabled={savingAvatar || !avatarDirty || !avatarReady}
            className="rounded-lg bg-amber px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
          >
            {savingAvatar ? "保存中…" : "このアイコンで保存"}
          </button>
          {avatarMessage && (
            <p className={`text-xs ${avatarMessage.type === "ok" ? "text-teal" : "text-red-700"}`}>
              {avatarMessage.text}
            </p>
          )}
        </div>
        {!avatarReady && (
          <p className="mt-2 text-xs text-amber-dark">
            アイコンの保存先がまだ用意されていません(migration_members.sql をSupabaseで実行してください)。
          </p>
        )}

        {cropFile && (
          <AvatarCropper
            file={cropFile}
            busy={uploadingPhoto}
            error={cropError}
            onCancel={() => setCropFile(null)}
            onConfirm={handleCropConfirm}
          />
        )}
      </div>

      <div className="border-t border-paper-line pt-6">
        <h3 className="font-display text-lg text-ink">ログイン状態</h3>
        {isAnonymous ? (
          <>
            <p className="mt-1 text-sm text-ink-text/60">
              ゲストとして利用中です。他の端末と同期するには、ユーザーIDやGoogleでアカウントを登録してください。
            </p>
            <Link
              href="/account"
              className="mt-3 inline-block rounded-lg border border-paper-line px-4 py-2 text-sm text-ink-text hover:bg-paper-line/30"
            >
              アカウントを登録する
            </Link>
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-text/60">{formatAccountLabel(email)} でログイン中</p>
        )}
        <div className="mt-4">
          <button
            onClick={handleLogout}
            className="rounded-lg border border-paper-line px-4 py-2 text-sm text-red-700 hover:bg-red-50"
          >
            ログアウト
          </button>
        </div>
      </div>
    </div>
  );
}

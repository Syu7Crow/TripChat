"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseUser } from "@/lib/supabase/useUser";

export default function SettingsTab() {
  const supabase = createClient();
  const router = useRouter();
  const { userId, email, isAnonymous, ready } = useSupabaseUser();

  const [displayName, setDisplayName] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!ready || !userId) return;

    let cancelled = false;
    async function run() {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId as string)
        .single();
      if (!cancelled) {
        setDisplayName(data?.display_name ?? "");
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
        <h3 className="font-display text-lg text-ink">ログイン状態</h3>
        {isAnonymous ? (
          <>
            <p className="mt-1 text-sm text-ink-text/60">
              ゲストとして利用中です。他の端末と同期するには、メールやGoogleでアカウントを登録してください。
            </p>
            <Link
              href="/account"
              className="mt-3 inline-block rounded-lg border border-paper-line px-4 py-2 text-sm text-ink-text hover:bg-paper-line/30"
            >
              アカウントを登録する
            </Link>
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-text/60">{email} でログイン中</p>
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

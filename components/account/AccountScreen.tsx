"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import { formatAccountLabel } from "@/lib/auth-utils";
import AuthForms from "./AuthForms";

export default function AccountScreen() {
  const supabase = createClient();
  const router = useRouter();
  const { email, isAnonymous, ready } = useSupabaseUser();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (!ready) {
    return <main className="min-h-screen bg-paper px-6 py-14 text-ink-text/60">読み込み中…</main>;
  }

  return (
    <main className="min-h-screen bg-paper pb-10">
      <section className="rounded-b-[2rem] sm:rounded-b-[2.5rem] bg-ink px-5 py-8 sm:px-8 sm:py-10 text-paper md:px-12 shadow-xs">
        <Link href="/" className="inline-flex items-center gap-1 text-xs sm:text-sm text-paper/70 transition hover:text-paper">
          <span>←</span>
          <span>ホーム</span>
        </Link>
        <h1 className="mt-2 font-display text-2xl sm:text-3xl text-amber md:text-4xl">アカウント</h1>
      </section>

      <section className="mx-auto max-w-md px-4 py-8 sm:px-6 md:px-12">
        {!isAnonymous && email ? (
          <div className="rounded-2xl border border-paper-line bg-white/70 px-5 py-5 shadow-2xs">
            <p className="text-xs sm:text-sm text-ink-text/60">ログイン中のアカウント</p>
            <p className="mt-1 text-base sm:text-lg font-semibold text-ink-text">{formatAccountLabel(email)}</p>
            <p className="mt-3 text-xs sm:text-sm text-ink-text/60">
              他の端末でも同じユーザーIDまたはGoogleアカウントでログインすれば、作成した旅行データを共有・同期できます。
            </p>
            <button
              onClick={handleLogout}
              className="mt-4 rounded-lg border border-paper-line px-4 py-2 text-sm text-red-600 transition hover:bg-red-50 cursor-pointer active:scale-95"
            >
              ログアウト
            </button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-xs sm:text-sm text-ink-text/60">
              ゲスト利用中の旅行データはそのまま引き継ぎ、ユーザーIDまたはGoogleでアカウントを登録できます。
            </p>
            <AuthForms redirectPath="/account" />
          </>
        )}
      </section>
    </main>
  );
}

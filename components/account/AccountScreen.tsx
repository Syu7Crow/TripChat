"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseUser } from "@/lib/supabase/useUser";
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
    <main className="min-h-screen bg-paper">
      <section className="rounded-b-[2.5rem] bg-ink px-6 py-10 text-paper md:px-12">
        <Link href="/" className="text-sm text-paper/60">
          ← ホーム
        </Link>
        <h1 className="mt-2 font-display text-3xl text-amber md:text-4xl">アカウント</h1>
      </section>

      <section className="mx-auto max-w-md px-6 py-10 md:px-12">
        {!isAnonymous && email ? (
          <div className="rounded-2xl border border-paper-line bg-white/60 px-5 py-5">
            <p className="text-sm text-ink-text/60">ログイン中のアカウント</p>
            <p className="mt-1 font-medium text-ink-text">{email}</p>
            <p className="mt-3 text-sm text-ink-text/60">
              他の端末でこのページを開き、同じメールアドレスで「ログイン」すれば、同じ旅行データを見られます。
              パスワードは不要で、そのたびにメールでログイン用のリンクが届きます。
            </p>
            <button
              onClick={handleLogout}
              className="mt-4 rounded-lg border border-paper-line px-4 py-2 text-sm text-ink-text hover:bg-paper-line/30"
            >
              ログアウト
            </button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-text/60">
              今ここまで作った旅行のデータはそのままに、アカウントを登録できます。
            </p>
            <AuthForms redirectPath="/account" />
          </>
        )}
      </section>
    </main>
  );
}

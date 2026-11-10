"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import AuthForms from "@/components/account/AuthForms";

export default function LoginScreen() {
  const supabase = createClient();
  const router = useRouter();
  const { userId, ready } = useSupabaseUser({ autoAnonymous: false });
  const [startingGuest, setStartingGuest] = useState(false);

  // 既にログイン済みの状態でこのページに来たら、ホームへ戻す
  useEffect(() => {
    if (ready && userId) {
      router.replace("/");
    }
  }, [ready, userId, router]);

  async function handleGuest() {
    setStartingGuest(true);
    const { error } = await supabase.auth.signInAnonymously();
    setStartingGuest(false);
    if (!error) router.replace("/");
  }

  if (!ready || userId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-sm text-ink-text/60">
        読み込み中…
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-paper">
      {/* 上部ヘッダー（シンプル＆モダン） */}
      <header className="rounded-b-[2rem] sm:rounded-b-[2.5rem] bg-ink px-5 py-8 sm:px-8 sm:py-10 text-paper md:px-12 shadow-xs">
        <div className="mx-auto max-w-md">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs text-paper/70 transition hover:text-paper mb-2"
          >
            <span>←</span>
            <span>ホームへ戻る</span>
          </Link>
          <h1 className="font-display text-3xl sm:text-4xl text-amber font-bold tracking-tight">
            Tripchat
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-paper/80">
            計画から精算まで、これひとつで完結する旅のしおり
          </p>
        </div>
      </header>

      {/* ログイン・新規登録カード */}
      <section className="flex-1 flex flex-col justify-center px-4 py-6 sm:py-8">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-paper-line/80 bg-white p-5 sm:p-7 shadow-sm">
          <AuthForms
            redirectPath="/login"
            onGuestLogin={handleGuest}
            isGuestLoading={startingGuest}
          />
        </div>
      </section>
    </main>
  );
}

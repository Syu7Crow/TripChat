"use client";

import { useEffect, useState } from "react";
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
    return <main className="min-h-screen bg-paper px-6 py-14 text-ink-text/60">読み込み中…</main>;
  }

  return (
    <main className="min-h-screen bg-paper">
      <section className="rounded-b-[2.5rem] bg-ink px-6 py-14 text-paper md:px-12 md:py-20">
        <h1 className="font-display text-4xl text-amber md:text-6xl">Tripchat</h1>
        <p className="mt-3 max-w-md text-paper/80">
          計画から精算まで、これひとつで完結する旅のしおり。
        </p>
      </section>

      <section className="mx-auto max-w-md px-6 py-10 md:px-12">
        <button
          onClick={handleGuest}
          disabled={startingGuest}
          className="w-full rounded-lg bg-ink px-4 py-3 text-sm font-medium text-paper disabled:opacity-50"
        >
          {startingGuest ? "準備中…" : "アカウント登録せずに始める"}
        </button>
        <p className="mt-2 text-xs text-ink-text/40">
          後からいつでもメール・Googleでアカウントを登録できます(途中で作ったデータはそのまま引き継がれます)。
        </p>

        <div className="my-6 flex items-center gap-3 text-xs text-ink-text/40">
          <span className="h-px flex-1 bg-paper-line" />
          すでにアカウントをお持ちの方 / 新しく登録する方
          <span className="h-px flex-1 bg-paper-line" />
        </div>

        <AuthForms redirectPath="/login" />
      </section>
    </main>
  );
}

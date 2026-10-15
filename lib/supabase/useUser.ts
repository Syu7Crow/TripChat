import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * セッションがあればそれを使い、無ければ匿名ログインして、そのユーザー情報を返す。
 * ログイン状態の変化(登録・ログイン・ログアウト)もリアルタイムに反映する。
 *
 * autoAnonymous: false にすると、セッションが無くても自動ログインはせず、
 * userId が null のまま ready になる(ログイン画面への振り分けに使う)。
 */
export function useSupabaseUser(options?: { autoAnonymous?: boolean }) {
  const autoAnonymous = options?.autoAnonymous ?? true;

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const applyUser = useCallback((user: User | null) => {
    setUserId(user?.id ?? null);
    setEmail(user?.email ?? null);
    setIsAnonymous(user?.is_anonymous ?? true);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      let user = sessionData.session?.user ?? null;

      if (!user && autoAnonymous) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) {
          setAuthError("ログインに失敗しました。ページを再読み込みしてください。");
          setReady(true);
          return;
        }
        user = data.user;
      }

      applyUser(user);
      setReady(true);
    })();

    // 登録・ログイン・ログアウトが起きたら即座に反映する
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [applyUser, autoAnonymous]);

  return { userId, email, isAnonymous, authError, ready };
}

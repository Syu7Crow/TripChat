import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * セッションが無ければ匿名ログインして、そのユーザーIDを返す。
 * HomeScreen / TripScreen など、ログインが前提の画面で共通に使う。
 */
export function useSupabaseUser() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      let uid = sessionData.session?.user.id ?? null;

      if (!uid) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) {
          setAuthError("ログインに失敗しました。ページを再読み込みしてください。");
          setReady(true);
          return;
        }
        uid = data.user?.id ?? null;
      }

      setUserId(uid);
      setReady(true);
    })();
  }, []);

  return { userId, authError, ready };
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { idToInternalEmail, validateUsername } from "@/lib/auth-utils";

/**
 * ユーザーID / パスワード / Google の登録・ログインフォーム。
 * /login と /account の両方から利用可能。
 */
export default function AuthForms({ redirectPath }: { redirectPath: string }) {
  const supabase = createClient();
  const router = useRouter();

  const [mode, setMode] = useState<"register" | "login">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}${redirectPath}` : undefined;

  async function ensureSession() {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    return null;
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const val = validateUsername(username);
    if (!val.ok) {
      setError(val.message ?? "ユーザーIDが無効です。");
      return;
    }

    if (password.length < 6) {
      setError("パスワードは6文字以上で入力してください。");
      return;
    }

    setSubmitting(true);
    const internalEmail = idToInternalEmail(username);
    const resolvedName = displayName.trim() || username.trim();

    // 既存のセッション（匿名ゲスト）があるかチェック
    const existingSession = await ensureSession();

    if (existingSession && existingSession.user.is_anonymous) {
      // 既存の匿名ユーザーをID・パスワードに昇格
      const { data, error: updateError } = await supabase.auth.updateUser({
        email: internalEmail,
        password: password,
        data: { display_name: resolvedName },
      });

      if (updateError) {
        setSubmitting(false);
        if (
          updateError.message.toLowerCase().includes("already registered") ||
          updateError.message.toLowerCase().includes("already exists")
        ) {
          setError("このユーザーIDは既に使われています。別のIDを入力してください。");
        } else {
          setError("登録できませんでした: " + updateError.message);
        }
        return;
      }

      if (data.user) {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          display_name: resolvedName,
        });
      }
    } else {
      // 新規登録
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: internalEmail,
        password: password,
        options: {
          data: { display_name: resolvedName },
        },
      });

      if (signUpError) {
        setSubmitting(false);
        if (
          signUpError.message.toLowerCase().includes("already registered") ||
          signUpError.message.toLowerCase().includes("already exists") ||
          signUpError.message.toLowerCase().includes("user already registered")
        ) {
          setError("このユーザーIDは既に使われています。「ログイン」タブをお試しください。");
        } else {
          setError("登録できませんでした: " + signUpError.message);
        }
        return;
      }

      if (data.user) {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          display_name: resolvedName,
        });
      }
    }

    setSubmitting(false);
    setMessage("登録が完了しました！");
    router.replace("/");
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const val = validateUsername(username);
    if (!val.ok) {
      setError(val.message ?? "ユーザーIDが無効です。");
      return;
    }

    if (!password) {
      setError("パスワードを入力してください。");
      return;
    }

    setSubmitting(true);
    const internalEmail = idToInternalEmail(username);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: internalEmail,
      password: password,
    });

    setSubmitting(false);

    if (signInError) {
      setError("ユーザーIDまたはパスワードが正しくありません。");
      return;
    }

    router.replace("/");
  }

  async function handleGoogleLogin() {
    setSubmitting(true);
    setError(null);
    setMessage(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    setSubmitting(false);
    if (oauthError) {
      setError("Googleログインを開始できませんでした。しばらくしてからお試しください。");
    }
  }

  return (
    <div>
      <div className="flex gap-2 border-b border-paper-line">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError(null);
            setMessage(null);
          }}
          className={`-mb-px px-3 py-2 text-sm font-medium ${
            mode === "login" ? "border-b-2 border-teal text-ink-text" : "text-ink-text/50"
          }`}
        >
          ログイン
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setError(null);
            setMessage(null);
          }}
          className={`-mb-px px-3 py-2 text-sm font-medium ${
            mode === "register" ? "border-b-2 border-teal text-ink-text" : "text-ink-text/50"
          }`}
        >
          新しく登録
        </button>
      </div>

      <p className="mt-4 text-sm text-ink-text/60">
        {mode === "register"
          ? "お好みのユーザーIDとパスワードを設定して登録します。"
          : "ユーザーIDとパスワードを入力してログインします。"}
      </p>

      <form onSubmit={mode === "register" ? handleRegister : handleLogin} className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-text/70">ユーザーID (半角英数字)</label>
          <input
            type="text"
            required
            autoCapitalize="none"
            autoCorrect="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="例: yamada_123"
            className="w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none"
          />
        </div>

        {mode === "register" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-text/70">表示名 (任意・ニックネーム)</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例: やまだ"
              className="w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-text/70">パスワード (6文字以上)</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
        {message && <p className="text-sm text-teal">{message}</p>}

        <button
          type="submit"
          disabled={submitting || !username.trim() || !password}
          className="w-full rounded-lg bg-amber px-4 py-2.5 text-sm font-medium text-ink transition hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-xs active:scale-95"
        >
          {submitting ? "処理中…" : mode === "register" ? "アカウントを作成する" : "ログインする"}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-ink-text/40">
        <span className="h-px flex-1 bg-paper-line" />
        または
        <span className="h-px flex-1 bg-paper-line" />
      </div>

      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-paper-line bg-white px-4 py-2.5 text-sm font-medium text-ink-text transition hover:bg-paper-line/20 disabled:opacity-50 cursor-pointer active:scale-95 shadow-2xs"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        {mode === "register" ? "Googleで登録" : "Googleでログイン"}
      </button>

      {mode === "login" && (
        <p className="mt-3 text-xs text-ink-text/40">
          ※ ログインすると、この端末でそれまでゲスト（未登録）で作っていた旅行データは切り替わります。
        </p>
      )}
    </div>
  );
}

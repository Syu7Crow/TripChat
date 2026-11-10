"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { idToInternalEmail, validateUsername } from "@/lib/auth-utils";

/**
 * ユーザーID / パスワード / Google の登録・ログインフォーム。
 * /login と /account の両方から利用可能。
 * ひとつの画面内でログイン・新規登録をスムーズに切り替えて操作できます。
 */
export default function AuthForms({
  redirectPath,
  defaultMode = "login",
  onGuestLogin,
  isGuestLoading = false,
}: {
  redirectPath: string;
  defaultMode?: "login" | "register";
  onGuestLogin?: () => void;
  isGuestLoading?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [mode, setMode] = useState<"register" | "login">(defaultMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
          setError("このユーザーIDは既に使われています。「ログイン」をお試しください。");
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

  function toggleMode(newMode: "register" | "login") {
    setMode(newMode);
    setError(null);
    setMessage(null);
  }

  return (
    <div className="w-full">
      {/* ログイン / 新規登録のセグメント切り替え（押しやすいピル型UI） */}
      <div className="relative flex rounded-2xl bg-paper-line/40 p-1.5 shadow-2xs">
        <button
          type="button"
          onClick={() => toggleMode("login")}
          className={`flex-1 min-h-[44px] rounded-xl text-sm font-bold transition-all cursor-pointer active:scale-98 flex items-center justify-center gap-1.5 ${
            mode === "login"
              ? "bg-white text-ink shadow-sm ring-1 ring-black/5"
              : "text-ink-text/60 hover:text-ink-text"
          }`}
        >
          <span>🔐</span>
          <span>ログイン</span>
        </button>
        <button
          type="button"
          onClick={() => toggleMode("register")}
          className={`flex-1 min-h-[44px] rounded-xl text-sm font-bold transition-all cursor-pointer active:scale-98 flex items-center justify-center gap-1.5 ${
            mode === "register"
              ? "bg-white text-ink shadow-sm ring-1 ring-black/5"
              : "text-ink-text/60 hover:text-ink-text"
          }`}
        >
          <span>✨</span>
          <span>新規登録</span>
        </button>
      </div>

      <p className="mt-4 text-xs sm:text-sm text-ink-text/65 leading-relaxed">
        {mode === "register"
          ? "お好みのユーザーIDとパスワードでアカウントを無料作成します。"
          : "登録済みのユーザーIDとパスワードを入力してログインします。"}
      </p>

      {/* 認証フォーム本体 */}
      <form onSubmit={mode === "register" ? handleRegister : handleLogin} className="mt-4 space-y-3.5">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-text/80">
            ユーザーID <span className="text-[11px] font-normal text-ink-text/50">(半角英数字・アンダースコア)</span>
          </label>
          <input
            type="text"
            required
            autoCapitalize="none"
            autoCorrect="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="例: yamada_123"
            className="w-full min-h-[48px] rounded-xl border border-paper-line bg-white px-3.5 py-2.5 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none shadow-2xs"
          />
        </div>

        {/* 新規登録時のみ表示名入力欄を表示 */}
        {mode === "register" && (
          <div className="animate-in fade-in duration-200">
            <label className="mb-1.5 block text-xs font-semibold text-ink-text/80">
              表示名 <span className="text-[11px] font-normal text-ink-text/50">(ニックネーム・後から変更可能)</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例: やまだ"
              className="w-full min-h-[48px] rounded-xl border border-paper-line bg-white px-3.5 py-2.5 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none shadow-2xs"
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-ink-text/80">
              パスワード <span className="text-[11px] font-normal text-ink-text/50">(6文字以上)</span>
            </label>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-xs text-ink-text/60 hover:text-ink cursor-pointer"
            >
              {showPassword ? "非表示" : "表示する"}
            </button>
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full min-h-[48px] rounded-xl border border-paper-line bg-white px-3.5 py-2.5 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none shadow-2xs pr-10"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs sm:text-sm text-red-700 leading-snug">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-xl bg-teal/10 border border-teal/30 p-3 text-xs sm:text-sm text-teal leading-snug">
            {message}
          </div>
        )}

        {/* 送信ボタン（最低48px） */}
        <div className="pt-1">
          <button
            type="submit"
            disabled={submitting || !username.trim() || !password}
            className="w-full min-h-[50px] rounded-xl bg-amber px-5 py-3 text-base font-bold text-ink transition hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-sm active:scale-98 flex items-center justify-center"
          >
            {submitting ? "処理中…" : mode === "register" ? "アカウントを作成する" : "ログインする"}
          </button>
        </div>
      </form>

      {/* 画面内でのワンタップ切り替えリンク */}
      <div className="mt-4 text-center">
        {mode === "login" ? (
          <p className="text-xs sm:text-sm text-ink-text/60">
            アカウントをお持ちでないですか？{" "}
            <button
              type="button"
              onClick={() => toggleMode("register")}
              className="font-bold text-teal hover:underline cursor-pointer ml-1 inline-flex items-center min-h-[36px]"
            >
              新規登録はこちら
            </button>
          </p>
        ) : (
          <p className="text-xs sm:text-sm text-ink-text/60">
            すでにアカウントをお持ちですか？{" "}
            <button
              type="button"
              onClick={() => toggleMode("login")}
              className="font-bold text-teal hover:underline cursor-pointer ml-1 inline-flex items-center min-h-[36px]"
            >
              ログインはこちら
            </button>
          </p>
        )}
      </div>

      <div className="my-5 flex items-center gap-3 text-xs text-ink-text/40">
        <span className="h-px flex-1 bg-paper-line" />
        または
        <span className="h-px flex-1 bg-paper-line" />
      </div>

      {/* Google ログインボタン */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={submitting}
        className="flex w-full min-h-[48px] items-center justify-center gap-2.5 rounded-xl border border-paper-line bg-white px-4 py-2.5 text-sm font-semibold text-ink-text transition hover:bg-paper-line/20 disabled:opacity-50 cursor-pointer active:scale-98 shadow-2xs"
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
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
        <span>Google でログイン / 登録</span>
      </button>

      {/* ゲストログイン（登録なしで体験） */}
      {onGuestLogin && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onGuestLogin}
            disabled={submitting || isGuestLoading}
            className="w-full min-h-[46px] rounded-xl border border-dashed border-paper-line bg-paper/60 hover:bg-white px-4 py-2.5 text-xs sm:text-sm font-medium text-ink-text/75 transition cursor-pointer active:scale-98 flex items-center justify-center gap-1.5"
          >
            <span>👤</span>
            <span>{isGuestLoading ? "ゲストで準備中…" : "登録せずにゲストとして始める"}</span>
          </button>
          <p className="mt-1 text-center text-[11px] text-ink-text/45">
            ※ ゲストで作ったデータは、後からいつでもアカウントに引き継げます。
          </p>
        </div>
      )}
    </div>
  );
}

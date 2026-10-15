"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * メール(マジックリンク)/ Google の 登録・ログインフォーム。
 * /login (初めての人) と /account (既存の匿名ユーザーの昇格) の両方から使う。
 */
export default function AuthForms({ redirectPath }: { redirectPath: string }) {
  const supabase = createClient();

  const [mode, setMode] = useState<"register" | "login">("register");
  const [formEmail, setFormEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}${redirectPath}` : undefined;

  // register/連携系は、セッションが無ければ先に匿名ログインしてから実行する
  // (無ければ「今から始める人」、あれば「今のデータを引き継ぐ人」として同じ処理で扱える)
  async function ensureSession() {
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    const { error: anonError } = await supabase.auth.signInAnonymously();
    return !anonError;
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    const ok = await ensureSession();
    if (!ok) {
      setSubmitting(false);
      setError("開始できませんでした。ページを再読み込みしてお試しください。");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser(
      { email: formEmail.trim() },
      { emailRedirectTo: redirectTo }
    );
    setSubmitting(false);

    if (updateError) {
      setError(
        updateError.message.toLowerCase().includes("already registered") ||
          updateError.message.toLowerCase().includes("already exists")
          ? "このメールアドレスは既に登録されています。「ログイン」タブからお試しください。"
          : "登録できませんでした。入力内容を確認してください。"
      );
      return;
    }

    setMessage(
      "確認メールを送信しました。メール内のリンクを開くと登録が完了します。他の端末でそのリンクを開けば、その端末でも同じデータが使えるようになります。"
    );
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: formEmail.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    setSubmitting(false);

    if (otpError) {
      setError("送信できませんでした。入力したメールアドレスを確認してください。");
      return;
    }

    setMessage("ログイン用のリンクをメールで送信しました。メールを開いてリンクをクリックしてください。");
  }

  async function handleGoogleLink() {
    setSubmitting(true);
    setError(null);
    setMessage(null);

    const ok = await ensureSession();
    if (!ok) {
      setSubmitting(false);
      setError("開始できませんでした。ページを再読み込みしてお試しください。");
      return;
    }

    const { error: linkError } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo },
    });
    setSubmitting(false);
    if (linkError) {
      setError("Google連携を開始できませんでした。しばらくしてからお試しください。");
    }
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
          onClick={() => setMode("register")}
          className={`-mb-px px-3 py-2 text-sm font-medium ${
            mode === "register" ? "border-b-2 border-teal text-ink-text" : "text-ink-text/50"
          }`}
        >
          新しく登録
        </button>
        <button
          onClick={() => setMode("login")}
          className={`-mb-px px-3 py-2 text-sm font-medium ${
            mode === "login" ? "border-b-2 border-teal text-ink-text" : "text-ink-text/50"
          }`}
        >
          ログイン
        </button>
      </div>

      <p className="mt-4 text-sm text-ink-text/60">
        {mode === "register"
          ? "メールアドレスを登録します。パスワードは不要です。"
          : "既に登録したメールアドレスを入力すると、ログイン用のリンクが届きます(パスワードは不要です)。"}
      </p>

      <form onSubmit={mode === "register" ? handleRegister : handleLogin} className="mt-4 space-y-3">
        <input
          type="email"
          required
          value={formEmail}
          onChange={(e) => setFormEmail(e.target.value)}
          placeholder="メールアドレス"
          className="w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-sm"
        />

        {error && <p className="text-sm text-red-700">{error}</p>}
        {message && <p className="text-sm text-teal">{message}</p>}

        <button
          type="submit"
          disabled={submitting || !formEmail.trim()}
          className="w-full rounded-lg bg-amber px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
        >
          {submitting ? "送信中…" : mode === "register" ? "確認メールを送る" : "ログイン用のリンクを送る"}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-ink-text/40">
        <span className="h-px flex-1 bg-paper-line" />
        または
        <span className="h-px flex-1 bg-paper-line" />
      </div>

      <button
        onClick={mode === "register" ? handleGoogleLink : handleGoogleLogin}
        disabled={submitting}
        className="w-full rounded-lg border border-paper-line bg-white px-4 py-2 text-sm font-medium text-ink-text hover:bg-paper-line/20 disabled:opacity-50"
      >
        {mode === "register" ? "Googleで登録" : "Googleでログイン"}
      </button>

      {mode === "login" && (
        <p className="mt-3 text-xs text-ink-text/40">
          注意: ログインすると、この端末でそれまで匿名で作っていたデータは見えなくなります。
        </p>
      )}
    </div>
  );
}

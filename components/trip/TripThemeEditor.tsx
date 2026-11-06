"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TripInfo } from "@/lib/trip-utils";
import {
  DEFAULT_HEADER_BG,
  DEFAULT_TITLE_COLOR,
  THEME_PRESETS,
  contrastRatio,
  resolveTheme,
  type ThemeColors,
} from "@/lib/theme";

/**
 * 旅行のヘッダーの色・文字の色を変える。変更は旅行のメンバー全員に共通で反映される。
 * (複数の旅行を使い分けるとき、今どの旅行を開いているかが一目で分かるようにするため)
 */
export default function TripThemeEditor({
  trip,
  onSaved,
}: {
  trip: TripInfo;
  onSaved: (colors: ThemeColors) => void;
}) {
  const supabase = createClient();

  const [draft, setDraft] = useState<ThemeColors>({
    header_color: trip.header_color ?? null,
    header_text_color: trip.header_text_color ?? null,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const theme = resolveTheme(draft);
  const ratio = contrastRatio(theme.bg, theme.sub);
  const dirty =
    (draft.header_color ?? null) !== (trip.header_color ?? null) ||
    (draft.header_text_color ?? null) !== (trip.header_text_color ?? null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const { error } = await supabase
      .from("trips")
      .update({
        header_color: draft.header_color,
        header_text_color: draft.header_text_color,
      })
      .eq("id", trip.id);
    setSaving(false);

    if (error) {
      setMessage({
        type: "error",
        text:
          error.code === "42703"
            ? "色の保存先がまだ用意されていません(migration_theme.sql をSupabaseで実行してください)。"
            : "保存できませんでした。時間をおいて試してください。",
      });
      return;
    }
    onSaved(draft);
    setMessage({ type: "ok", text: "保存しました。メンバー全員の画面に反映されます。" });
  }

  return (
    <div className="max-w-sm">
      <h3 className="font-display text-lg text-ink">ヘッダーの色</h3>
      <p className="mt-1 text-sm text-ink-text/60">
        この旅行の見た目を変えます。メンバー全員に共通です。
      </p>

      {/* プレビュー */}
      <div
        className="mt-3 rounded-b-3xl rounded-t-lg px-5 py-4"
        style={{ backgroundColor: theme.bg, color: theme.sub }}
      >
        <p className="text-xs opacity-60">← ホーム</p>
        <p className="mt-1 font-display text-xl" style={{ color: theme.title }}>
          {trip.title}
        </p>
        <p className="mt-1 text-xs opacity-80">招待コード: {trip.invite_code}</p>
      </div>

      {/* 色の選択 */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="text-sm text-ink-text/70">
          ヘッダーの色
          <input
            type="color"
            value={draft.header_color ?? DEFAULT_HEADER_BG}
            onChange={(e) => setDraft((d) => ({ ...d, header_color: e.target.value }))}
            className="mt-1 block h-10 w-full cursor-pointer rounded-lg border border-paper-line bg-white p-1"
          />
        </label>
        <label className="text-sm text-ink-text/70">
          文字の色
          <input
            type="color"
            value={draft.header_text_color ?? DEFAULT_TITLE_COLOR}
            onChange={(e) => setDraft((d) => ({ ...d, header_text_color: e.target.value }))}
            className="mt-1 block h-10 w-full cursor-pointer rounded-lg border border-paper-line bg-white p-1"
          />
        </label>
      </div>

      {/* おすすめの組み合わせ */}
      <p className="mt-4 text-xs text-ink-text/50">おすすめの組み合わせ</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {THEME_PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() =>
              setDraft({ header_color: preset.bg, header_text_color: preset.text })
            }
            className="rounded-lg border border-paper-line px-3 py-1.5 text-xs font-medium"
            style={{ backgroundColor: preset.bg, color: preset.text }}
          >
            {preset.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setDraft({ header_color: null, header_text_color: null })}
          className="rounded-lg border border-paper-line bg-white px-3 py-1.5 text-xs text-ink-text/70"
        >
          初期色に戻す
        </button>
      </div>

      {ratio < 3 && (
        <p className="mt-3 text-xs text-amber-dark">
          背景と文字の色が近く、文字が読みにくい可能性があります(コントラスト比 {ratio.toFixed(1)})。
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="rounded-lg bg-amber px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
        >
          {saving ? "保存中…" : "この色で保存"}
        </button>
        {message && (
          <p className={`text-xs ${message.type === "ok" ? "text-teal" : "text-red-700"}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}

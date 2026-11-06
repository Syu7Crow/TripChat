/** 旅行ごとのヘッダー配色(ヘッダーの色・文字の色)に関する定義と計算 */

export const DEFAULT_HEADER_BG = "#17222c"; // 紺
export const DEFAULT_TITLE_COLOR = "#e69a35"; // アンバー(初期のタイトル色)
export const DEFAULT_SUB_COLOR = "#faf6ee"; // 紙色(初期のサブ文字色)

export type ThemeColors = {
  header_color: string | null;
  header_text_color: string | null;
};

export const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isValidHex(value: string | null | undefined): value is string {
  return !!value && HEX_PATTERN.test(value);
}

/** 画面で実際に使う色を決める(未設定・不正な値は初期色にする) */
export function resolveTheme(colors: Partial<ThemeColors> | null | undefined) {
  const bg = isValidHex(colors?.header_color) ? colors!.header_color! : DEFAULT_HEADER_BG;
  const custom = isValidHex(colors?.header_text_color) ? colors!.header_text_color! : null;
  return {
    bg,
    // 文字色を選んだ場合は、タイトルもサブ文字もその色に統一する
    title: custom ?? DEFAULT_TITLE_COLOR,
    sub: custom ?? DEFAULT_SUB_COLOR,
  };
}

export type ThemePreset = { name: string; bg: string; text: string };

export const THEME_PRESETS: ThemePreset[] = [
  { name: "森", bg: "#1f3d36", text: "#f2efe4" },
  { name: "夕焼け", bg: "#7a2e3a", text: "#ffe9d6" },
  { name: "海", bg: "#0f4c75", text: "#e8f4fa" },
  { name: "桜", bg: "#f4d6dc", text: "#5a2a35" },
  { name: "抹茶", bg: "#dfe8cf", text: "#2f4a1f" },
  { name: "モノクロ", bg: "#222222", text: "#ffffff" },
];

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** 2色のコントラスト比(1〜21)。3未満だと文字が読みにくい */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * AIチャットの返答まわりの共通処理(サーバーのAPIルートと、チャット画面の両方で使う)。
 *
 * AIは「JSONで返して」と頼んでも、時刻を "午後2時" と書いたり、日数を "1日目" と文字で返したりする。
 * それをそのまま画面やDBに渡すと、表示が壊れたり、タイムラインへの反映が失敗したりするので、
 * ここで必ず安全な形に整える。
 */

export type AiSuggestedItem = {
  day_number: number;
  title: string;
  start_time?: string;
  end_time?: string;
  note?: string;
};

export type AiPayload = {
  message: string;
  suggestedItems?: AiSuggestedItem[];
};

/** AIが提案できる予定の最大数(長すぎる返答でチャットが埋まらないように) */
const MAX_ITEMS = 8;

/** "9:00" "09:00" "14:30:00" を "HH:MM" にそろえる。読み取れなければ undefined */
export function normalizeTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return undefined;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${m[2]}`;
}

/** AIが返した suggestedItems を、安全な形の配列にして返す(壊れた要素は捨てる) */
export function sanitizeSuggestedItems(value: unknown): AiSuggestedItem[] {
  if (!Array.isArray(value)) return [];

  const items: AiSuggestedItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;

    const title = typeof r.title === "string" ? r.title.trim() : "";
    if (!title) continue;

    // 日数: 1以上の整数。"2" のような数字の文字列も受け付ける。読めなければ1日目にする
    const dayValue = typeof r.day_number === "string" ? Number.parseInt(r.day_number, 10) : r.day_number;
    const day = typeof dayValue === "number" && Number.isFinite(dayValue) ? Math.floor(dayValue) : 1;

    const item: AiSuggestedItem = {
      day_number: day >= 1 && day <= 60 ? day : 1,
      title: title.slice(0, 80),
    };
    const start = normalizeTime(r.start_time);
    const end = normalizeTime(r.end_time);
    if (start) item.start_time = start;
    if (end) item.end_time = end;
    if (typeof r.note === "string" && r.note.trim()) item.note = r.note.trim().slice(0, 60);

    items.push(item);
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

/** AIの返答テキストから { message, suggestedItems } を取り出す。JSONが崩れていても、読める範囲で救う */
export function extractAiPayload(rawText: string): Required<AiPayload> {
  const clean = rawText.trim();

  const tryParse = (text: string): Required<AiPayload> | null => {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && typeof parsed.message === "string") {
        return {
          message: parsed.message.trim(),
          suggestedItems: sanitizeSuggestedItems(parsed.suggestedItems),
        };
      }
    } catch {
      // 次の方法を試す
    }
    return null;
  };

  // 1. そのままJSON  2. ```json ... ``` の中身  3. 最も外側の { ... }
  const direct = tryParse(clean);
  if (direct) return direct;

  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    const result = tryParse(fenced[1].trim());
    if (result) return result;
  }

  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first !== -1 && last > first) {
    const result = tryParse(clean.slice(first, last + 1));
    if (result) return result;
  }

  // 4. JSONが途中で切れていても、message の文字列だけは取り出す
  const msg = clean.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (msg) {
    try {
      return { message: (JSON.parse(`"${msg[1]}"`) as string).trim(), suggestedItems: [] };
    } catch {
      // 次へ
    }
  }

  // 5. どうしてもJSONとして読めない場合は、コードブロック記号を除いた文章をそのまま見せる
  return {
    message: clean.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim(),
    suggestedItems: [],
  };
}

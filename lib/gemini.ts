/**
 * Gemini API(generateContent)を呼ぶ処理。APIルート(app/api/ai/chat/route.ts)から使う。
 *
 * 作りのポイント:
 * - モデルは複数を順に試す。Googleはモデルを入れ替えていて、古いモデル(gemini-2.5-flash など)は
 *   新規のAPIキーでは使えないことがあるため、使えるモデルが見つかるまで切り替える。
 * - APIキーはURLではなくヘッダーで送る(URLに入れるとログに残りやすいため)。
 * - 思考(thinking)のトークンも maxOutputTokens に含まれ、上限が小さいと返答が途中で切れる。
 *   そのため思考は軽く(low)し、上限は余裕を持たせる。
 * - 失敗の原因を種類(code)に分けて返し、画面に分かりやすい理由を出せるようにする。
 */

export type GeminiErrorCode =
  | "BAD_KEY" // APIキーが正しくない・無効
  | "RATE_LIMIT" // 無料枠の上限・混雑
  | "MODEL_UNAVAILABLE" // 指定のモデルが使えない
  | "BLOCKED" // 安全基準で回答できない
  | "EMPTY" // 回答が空
  | "TIMEOUT" // 時間切れ
  | "UPSTREAM"; // その他のGemini側の失敗

export class GeminiError extends Error {
  code: GeminiErrorCode;
  status?: number;
  constructor(code: GeminiErrorCode, message: string, status?: number) {
    super(message);
    this.name = "GeminiError";
    this.code = code;
    this.status = status;
  }
}

/**
 * 環境変数 GEMINI_MODEL があれば最優先。なければ gemini-3.6-flash から順に試す。
 * (gemini-3.8-flash は、動作確認したAPIキーで応答が返らなかったため、2番目にしている)
 */
export function candidateModels(envModel?: string | null): string[] {
  const list = [envModel?.trim(), "gemini-3.6-flash", "gemini-3.8-flash", "gemini-2.5-flash"];
  return [...new Set(list.filter((m): m is string => !!m))];
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

function isKeyError(status: number, body: string): boolean {
  return (
    [400, 401, 403].includes(status) && /API key|API_KEY_INVALID|api_key/i.test(body)
  );
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
};

export async function generateJson(
  prompt: string,
  options: {
    apiKey: string;
    models: string[];
    fetchImpl?: typeof fetch;
    /** 1回の呼び出しの待ち時間。これを超えたら、そのモデルは諦めて次のモデルを試す */
    timeoutMs?: number;
    /** 全モデルを試す時間の合計の上限 */
    totalTimeoutMs?: number;
    onLog?: (message: string) => void;
  }
): Promise<{ text: string; model: string }> {
  const {
    apiKey,
    models,
    fetchImpl = fetch,
    timeoutMs = 12_000,
    totalTimeoutMs = 28_000,
    onLog = () => {},
  } = options;

  const deadline = Date.now() + totalTimeoutMs;
  let sawRateLimit = false;
  let sawUnavailable = false;
  let sawTimeout = false;
  let lastStatus: number | undefined;

  for (const model of models) {
    // 残り時間が少なければ、これ以上は試さない
    if (deadline - Date.now() < 1_500) break;
    // 思考の設定を受け付けないモデルのために、400で「thinking」に触れていたら設定なしでもう一度送る
    for (const withThinking of [true, false]) {
      const attemptMs = Math.min(timeoutMs, Math.max(1_000, deadline - Date.now()));
      const startedAt = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), attemptMs);
      let res: Response;
      try {
        res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.7,
              maxOutputTokens: 8192,
              ...(withThinking ? { thinkingConfig: { thinkingLevel: "low" } } : null),
            },
          }),
        });
      } catch (error) {
        clearTimeout(timer);
        if (error instanceof Error && error.name === "AbortError") {
          // 応答が来なかったモデルは諦めて、次のモデルを試す
          sawTimeout = true;
          onLog(`model=${model} ${Math.round((Date.now() - startedAt) / 1000)}秒待っても応答なし(時間切れ)`);
          break;
        }
        // 接続そのものの失敗(DNS・プロキシ・ファイアウォールなど)。どのモデルでも同じなので、すぐ終える
        const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
        onLog(`model=${model} 接続エラー: ${cause?.code ?? cause?.message ?? (error as Error)?.message}`);
        throw new GeminiError("UPSTREAM", "AIのサーバーに接続できませんでした。");
      }
      clearTimeout(timer);
      onLog(`model=${model} status=${res.status} ${Date.now() - startedAt}ms`);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        lastStatus = res.status;
        onLog(`model=${model} status=${res.status} thinking=${withThinking} body=${body.slice(0, 400)}`);

        if (isKeyError(res.status, body)) {
          throw new GeminiError("BAD_KEY", "GEMINI_API_KEY が正しくありません。", res.status);
        }
        if (withThinking && res.status === 400 && /thinking/i.test(body)) {
          continue; // 同じモデルを、思考の設定なしで再試行
        }
        if (res.status === 429) sawRateLimit = true;
        else if ([400, 403, 404].includes(res.status)) sawUnavailable = true;
        break; // 次のモデルへ
      }

      const data = (await res.json().catch(() => null)) as GeminiResponse | null;
      if (data?.promptFeedback?.blockReason) {
        throw new GeminiError("BLOCKED", "安全上の理由でAIが回答できませんでした。");
      }
      const text = (data?.candidates?.[0]?.content?.parts ?? [])
        .filter((part) => !part.thought && typeof part.text === "string")
        .map((part) => part.text)
        .join("")
        .trim();
      if (text) return { text, model };

      onLog(`model=${model} 空の回答 finishReason=${data?.candidates?.[0]?.finishReason ?? "none"}`);
      break; // 次のモデルへ
    }
  }

  if (sawRateLimit) {
    throw new GeminiError("RATE_LIMIT", "AIの利用上限に達したか、混み合っています。", 429);
  }
  if (sawTimeout) {
    throw new GeminiError("TIMEOUT", "AIから応答がありませんでした。");
  }
  if (sawUnavailable) {
    throw new GeminiError("MODEL_UNAVAILABLE", "使えるAIモデルが見つかりませんでした。", lastStatus);
  }
  throw new GeminiError("EMPTY", "AIから回答が得られませんでした。", lastStatus);
}

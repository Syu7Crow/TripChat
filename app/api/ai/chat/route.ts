import { NextResponse } from "next/server";
import { extractAiPayload } from "@/lib/ai-chat";
import { GeminiError, candidateModels, generateJson, type GeminiErrorCode } from "@/lib/gemini";

// 長めの応答でも途中で打ち切られないようにする(Vercelなどにデプロイしたときの上限)
export const maxDuration = 30;

/** 画面に出す、失敗の理由(何をすればよいかまで書く) */
const ERROR_MESSAGES: Record<GeminiErrorCode | "NO_KEY" | "BAD_REQUEST", { text: string; status: number }> = {
  NO_KEY: {
    text: "GEMINI_API_KEY が設定されていません。.env.local に設定して、開発サーバーを再起動してください。",
    status: 500,
  },
  BAD_KEY: {
    text: "GEMINI_API_KEY が正しくないか無効です。Google AI Studio でキーを確認し、.env.local を直して開発サーバーを再起動してください。",
    status: 500,
  },
  RATE_LIMIT: {
    text: "AIの利用上限に達したか、混み合っています。1分ほど待ってからもう一度お試しください。",
    status: 429,
  },
  MODEL_UNAVAILABLE: {
    text: "使えるAIモデルが見つかりませんでした。.env.local に GEMINI_MODEL=gemini-3.6-flash のように設定してみてください。",
    status: 500,
  },
  BLOCKED: { text: "安全上の理由でAIが回答できませんでした。言い方を変えて試してください。", status: 422 },
  EMPTY: { text: "AIから回答が得られませんでした。もう一度お試しください。", status: 502 },
  TIMEOUT: {
    text: "AIから応答がありませんでした。もう一度お試しください。何度も続く場合は、このPCからGoogleのAPIに接続できているか、ターミナルで npm run check:ai を実行して確認してください。",
    status: 504,
  },
  UPSTREAM: { text: "AIのサーバーに接続できませんでした。時間をおいてもう一度お試しください。", status: 502 },
  BAD_REQUEST: { text: "メッセージが入力されていません。", status: 400 },
};

function errorResponse(code: keyof typeof ERROR_MESSAGES) {
  const { text, status } = ERROR_MESSAGES[code];
  return NextResponse.json({ error: text, code }, { status });
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return errorResponse("NO_KEY");

    let body: { userMessage?: unknown; tripContext?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      return errorResponse("BAD_REQUEST");
    }
    const { userMessage, tripContext } = body;

    if (!userMessage || typeof userMessage !== "string" || !userMessage.trim()) {
      return errorResponse("BAD_REQUEST");
    }

    const title = (tripContext?.title as string) || "未定";
    const startDate = (tripContext?.start_date as string) || "未定";
    const endDate = (tripContext?.end_date as string) || "未定";
    // 送られてくる量に上限を付ける(巨大なリクエストでAIの利用枠を使い切られないように)
    const timelineItems = ((tripContext?.timelineItems as unknown[]) || []).slice(0, 60);
    const recentMessages = ((tripContext?.recentMessages as unknown[]) || []).slice(-8);

    const timelineSummary =
      timelineItems.length > 0
        ? (timelineItems as Array<{ day_number: number; start_time?: string; end_time?: string; title: string; note?: string }>)
            .map(
              (item) =>
                `・${item.day_number}日目: ${item.start_time || "時間未定"} 〜 ${item.end_time || ""} ${item.title}${
                  item.note ? ` (${item.note})` : ""
                }`
            )
            .join("\n")
        : "（現在、登録されている予定はありません）";

    const chatSummary =
      recentMessages.length > 0
        ? (recentMessages as Array<{ sender: string; body: string }>)
            .map((m) => `${m.sender}: ${String(m.body ?? "").slice(0, 300)}`)
            .join("\n")
        : "（チャット履歴はありません）";

    const userRequest = userMessage.trim().slice(0, 1000);

    const prompt = `あなたはリアルタイム旅行計画・共有Webアプリ「Tripchat」の専属AIアシスタントです。
旅行グループの会話やタイムラインの文脈を汲み取り、メンバー同士の旅のワクワク感を高めながら、旅程の立案や現地での動的なスケジュール再構築をサポートしてください。

【旅行情報】
旅行名: ${title}
日程: ${startDate} 〜 ${endDate}

【現在のタイムライン（旅のしおり）】
${timelineSummary}

【直近のグループチャット会話ログ】
${chatSummary}

【ユーザーからの相談・リクエスト】
${userRequest}

【回答のルール】
1. チャットのテンポを重視し、messageは【必ず2〜3文以内（100〜140文字程度）で簡潔・端的に】返答してください。長文の説明や前置きは省き、要点と提案理由のみをサクッと伝えてください。
2. 親しみやすく前向きなトーン（です・ます調）で回答してください。
3. 「雨が降ってきた」「遅れた」などの要望には、文脈に応じた最適な代案（屋内スポットや時短スケジュール等）を提案してください。
4. スポットの詳細は文章で長々と書かず、suggestedItems に格納してください（各予定の note も30文字以内で端的に）。不要な場合は空配列 [] にしてください。
5. day_number は 1 以上の整数、start_time と end_time は 24時間表記の "HH:MM"（例: "14:00"）で、分からない場合は省略してください。
6. 必ず以下のJSONフォーマットのみを返してください。

{
  "message": "簡潔な2〜3文のメッセージ",
  "suggestedItems": [
    {
      "day_number": 1,
      "title": "スポット名や行動内容 (例: すみだ水族館)",
      "start_time": "14:00",
      "end_time": "16:00",
      "note": "簡潔なメモ (30文字以内)"
    }
  ]
}`;

    const { text: rawText, model } = await generateJson(prompt, {
      apiKey,
      models: candidateModels(process.env.GEMINI_MODEL),
      // 失敗の詳細はサーバーのログ(npm run dev を実行しているターミナル)にだけ残す
      onLog: (message) => console.error("[ai/chat]", message),
    });
    if (process.env.NODE_ENV !== "production") console.log(`[ai/chat] model=${model}`);

    // 堅牢なJSON抽出と、時刻・日数などの整形(壊れた値は画面やDBに渡さない)
    const result = extractAiPayload(rawText);
    if (!result.message) return errorResponse("EMPTY");

    return NextResponse.json({
      message: result.message,
      suggestedItems: result.suggestedItems,
    });
  } catch (error) {
    if (error instanceof GeminiError) {
      console.error("[ai/chat]", error.code, error.message);
      return errorResponse(error.code);
    }
    console.error("[ai/chat] 想定外のエラー:", error);
    return errorResponse("UPSTREAM");
  }
}

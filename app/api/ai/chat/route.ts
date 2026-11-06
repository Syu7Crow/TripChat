import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY が設定されていません。" },
        { status: 500 }
      );
    }

    const { userMessage, tripContext } = await req.json();

    if (!userMessage || typeof userMessage !== "string") {
      return NextResponse.json(
        { error: "メッセージが入力されていません。" },
        { status: 400 }
      );
    }

    const title = tripContext?.title || "未定";
    const startDate = tripContext?.start_date || "未定";
    const endDate = tripContext?.end_date || "未定";
    const timelineItems = tripContext?.timelineItems || [];
    const recentMessages = tripContext?.recentMessages || [];

    const timelineSummary =
      timelineItems.length > 0
        ? timelineItems
            .map(
              (item: { day_number: number; start_time?: string; end_time?: string; title: string; note?: string }) =>
                `・${item.day_number}日目: ${item.start_time || "時間未定"} 〜 ${item.end_time || ""} ${item.title}${
                  item.note ? ` (${item.note})` : ""
                }`
            )
            .join("\n")
        : "（現在、登録されている予定はありません）";

    const chatSummary =
      recentMessages.length > 0
        ? recentMessages
            .slice(-8)
            .map((m: { sender: string; body: string }) => `${m.sender}: ${m.body}`)
            .join("\n")
        : "（チャット履歴はありません）";

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
${userMessage}

【回答のルール】
1. チャットのテンポを重視し、messageは【必ず2〜3文以内（100〜140文字程度）で簡潔・端的に】返答してください。長文の説明や前置きは省き、要点と提案理由のみをサクッと伝えてください。
2. 親しみやすく前向きなトーン（です・ます調）で回答してください。
3. 「雨が降ってきた」「遅れた」などの要望には、文脈に応じた最適な代案（屋内スポットや時短スケジュール等）を提案してください。
4. スポットの詳細は文章で長々と書かず、suggestedItems に格納してください（各予定の note も30文字以内で端的に）。不要な場合は空配列 [] にしてください。
5. 必ず以下のJSONフォーマットのみを返してください。

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

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API Error:", errText);
      return NextResponse.json(
        { error: "AIの呼び出しに失敗しました。" },
        { status: 502 }
      );
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return NextResponse.json(
        { error: "AIから回答が得られませんでした。" },
        { status: 502 }
      );
    }

    // JSONパースの安全処理 (もし万が一パースに失敗しても、テキストを救出してエラーを出さない)
    let parsed: { message?: string; suggestedItems?: unknown[] } = {};
    try {
      const cleanJson = rawText.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.warn("Failed to parse Gemini response as JSON, falling back to rawText:", parseErr);
      parsed = {
        message: rawText,
        suggestedItems: [],
      };
    }

    return NextResponse.json({
      message: parsed.message || rawText,
      suggestedItems: Array.isArray(parsed.suggestedItems) ? parsed.suggestedItems : [],
    });
  } catch (error) {
    console.error("AI chat route error:", error);
    return NextResponse.json(
      { error: "AI処理中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}


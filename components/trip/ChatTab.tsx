"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import { geocodeAddress } from "@/lib/geocode";
import type { TimelineItem, TripInfo } from "@/lib/trip-utils";
import Avatar from "./Avatar";

type Message = {
  id: string;
  trip_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

type Member = {
  user_id: string;
  display_name: string;
  avatar_emoji?: string | null;
  avatar_color?: string | null;
  avatar_url?: string | null;
};

type AiSuggestedItem = {
  day_number: number;
  title: string;
  start_time?: string;
  end_time?: string;
  note?: string;
};

type AiPayload = {
  message: string;
  suggestedItems?: AiSuggestedItem[];
};

const AI_PREFIX = "[TRIPCHAT_AI]:";

function parseAiMessage(body: string): AiPayload | null {
  if (!body.startsWith(AI_PREFIX)) return null;
  try {
    const jsonStr = body.slice(AI_PREFIX.length);
    return JSON.parse(jsonStr) as AiPayload;
  } catch {
    return null;
  }
}

export default function ChatTab({
  tripId,
  members,
  trip,
  timelineItems = [],
  onTimelineUpdated,
}: {
  tripId: string;
  members: Member[];
  trip?: TripInfo | null;
  timelineItems?: TimelineItem[];
  onTimelineUpdated?: () => void;
}) {
  const supabase = createClient();
  const { userId } = useSupabaseUser();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [appliedItemIds, setAppliedItemIds] = useState<Record<string, boolean>>({});
  const [applyingPlanId, setApplyingPlanId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("trip_messages")
      .select("id, trip_id, user_id, body, created_at")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true })
      .limit(200);
    setMessages((data ?? []) as Message[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 初回読み込みのため意図的
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const channel = supabase
      .channel(`chat-${tripId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trip_messages", filter: `trip_id=eq.${tripId}` },
        (payload) => {
          const row = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, aiThinking]);

  function memberName(id: string) {
    return members.find((m) => m.user_id === id)?.display_name ?? "元メンバー";
  }

  // AIに相談して返答を受け取る
  async function callAiAssistant(userQuery: string) {
    setAiThinking(true);
    try {
      // 直近のチャット履歴を整形
      const recentChat = messages.slice(-6).map((m) => {
        const ai = parseAiMessage(m.body);
        if (ai) {
          return { sender: "Tripchat AI", body: ai.message };
        }
        return { sender: memberName(m.user_id), body: m.body };
      });

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          userMessage: userQuery,
          tripContext: {
            title: trip?.title,
            start_date: trip?.start_date,
            end_date: trip?.end_date,
            timelineItems: timelineItems.map((item) => ({
              day_number: item.day_number,
              title: item.title,
              start_time: item.start_time,
              end_time: item.end_time,
              note: item.note,
            })),
            recentMessages: recentChat,
          },
        }),
      });

      if (!res.ok) {
        throw new Error("AIの呼び出しに失敗しました");
      }

      const aiResponse: AiPayload = await res.json();

      // AIメッセージをチャットに保存してグループ全員に共有
      const aiBody = `${AI_PREFIX}${JSON.stringify(aiResponse)}`;
      await supabase.from("trip_messages").insert({
        trip_id: tripId,
        user_id: userId,
        body: aiBody,
      });
    } catch (err) {
      console.error(err);
      alert("AIからの応答の取得に失敗しました。少し時間をおいて再度お試しください。");
    } finally {
      setAiThinking(false);
    }
  }

  // 通常メッセージ送信またはAI呼び出し
  async function handleSend(e: React.FormEvent, forceAi = false) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !userId) return;

    setSending(true);
    setText("");

    // 1. まずユーザー自身のメッセージをチャットに投稿
    const { error } = await supabase.from("trip_messages").insert({
      trip_id: tripId,
      user_id: userId,
      body,
    });
    setSending(false);

    if (error) {
      alert("メッセージの送信に失敗しました。");
      return;
    }

    // 2. AI呼び出し判定（「AIに聞く」ボタン、または @ai / @AI が含まれる場合）
    const isAiQuery = forceAi || /@ai/i.test(body);
    if (isAiQuery) {
      const cleanQuery = body.replace(/@ai/gi, "").trim() || body;
      await callAiAssistant(cleanQuery);
    }
  }

  // クイック相談ボタンを押した時
  async function handleQuickAiPrompt(promptText: string) {
    if (!userId || sending || aiThinking) return;
    setSending(true);

    // 質問を投稿
    await supabase.from("trip_messages").insert({
      trip_id: tripId,
      user_id: userId,
      body: promptText,
    });
    setSending(false);

    // AIを即時呼び出し
    await callAiAssistant(promptText);
  }

  // AIが提案したスケジュールをタイムラインに一括反映
  async function handleApplySuggestedItems(messageId: string, items: AiSuggestedItem[]) {
    if (items.length === 0) return;
    setApplyingPlanId(messageId);

    try {
      for (const item of items) {
        // 場所から緯度経度を検索
        let lat: number | null = null;
        let lng: number | null = null;
        try {
          const geo = await geocodeAddress(item.title);
          if (geo) {
            lat = geo.lat;
            lng = geo.lng;
          }
        } catch {
          // ジオコーディング失敗時は位置なしで追加
        }

        const maxPos = timelineItems
          .filter((t) => t.day_number === item.day_number)
          .reduce((max, t) => Math.max(max, t.position), 0);

        await supabase.from("timeline_items").insert({
          trip_id: tripId,
          day_number: item.day_number || 1,
          position: maxPos + 1000,
          title: item.title,
          start_time: item.start_time || null,
          end_time: item.end_time || null,
          note: item.note || "AIによる提案プラン",
          lat,
          lng,
        });
      }

      setAppliedItemIds((prev) => ({ ...prev, [messageId]: true }));
      onTimelineUpdated?.();
    } catch (err) {
      console.error(err);
      alert("タイムラインへの反映中にエラーが発生しました。");
    } finally {
      setApplyingPlanId(null);
    }
  }

  return (
    <div className="flex h-[68vh] flex-col rounded-2xl border border-paper-line bg-white/70 shadow-xs">
      {/* チャット履歴表示エリア */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {loading && <p className="text-sm text-ink-text/50">読み込み中…</p>}
        {!loading && messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-paper-line p-6 text-center text-sm text-ink-text/60">
            <p className="font-medium text-ink">旅行チャットへようこそ！🎉</p>
            <p className="mt-1 text-xs">メンバー同士の雑談はもちろん、下のボタンからAIに旅行プランや代案を相談できます。</p>
          </div>
        )}

        {messages.map((m) => {
          const aiPayload = parseAiMessage(m.body);
          const mine = m.user_id === userId;

          // AIメッセージのレンダリング
          if (aiPayload) {
            const isApplied = appliedItemIds[m.id];
            const isApplying = applyingPlanId === m.id;

            return (
              <div key={m.id} className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border border-teal/30 bg-teal-soft/20 p-4 text-sm text-ink-text shadow-xs">
                  <div className="mb-2 flex items-center gap-1.5 font-medium text-teal">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal text-[11px] text-white">
                      🤖
                    </span>
                    <span>Tripchat AI</span>
                    <span className="text-[10px] text-teal/60">アシスタント</span>
                  </div>

                  <p className="whitespace-pre-wrap leading-relaxed">{aiPayload.message}</p>

                  {/* 提案された予定リストとタイムライン反映ボタン */}
                  {aiPayload.suggestedItems && aiPayload.suggestedItems.length > 0 && (
                    <div className="mt-3 rounded-xl border border-teal/20 bg-white/80 p-3">
                      <p className="text-xs font-semibold text-teal-dark">📅 提案されたスケジュール案</p>
                      <ul className="mt-2 space-y-1.5 text-xs">
                        {aiPayload.suggestedItems.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-ink-text">
                            <span className="rounded bg-teal/10 px-1.5 py-0.5 font-mono text-[11px] text-teal font-medium">
                              {item.day_number}日目 {item.start_time ? item.start_time.slice(0, 5) : ""}
                            </span>
                            <div className="flex-1">
                              <span className="font-medium">{item.title}</span>
                              {item.note && <span className="ml-1 text-ink-text/60">({item.note})</span>}
                            </div>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-3 pt-2 border-t border-paper-line/50 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleApplySuggestedItems(m.id, aiPayload.suggestedItems!)}
                          disabled={isApplied || isApplying}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                            isApplied
                              ? "bg-teal/10 text-teal cursor-default"
                              : "bg-teal text-white hover:opacity-90 cursor-pointer shadow-xs"
                          }`}
                        >
                          {isApplying
                            ? "反映中…"
                            : isApplied
                            ? "✅ タイムラインに反映済み"
                            : "📋 このプランをタイムラインに反映"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          }

          // 通常のユーザーメッセージ
          const sender = members.find((member) => member.user_id === m.user_id);
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
              {!mine && (
                <Avatar
                  name={memberName(m.user_id)}
                  emoji={sender?.avatar_emoji}
                  color={sender?.avatar_color}
                  url={sender?.avatar_url}
                  size={28}
                />
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm ${
                  mine ? "bg-teal text-white" : "bg-paper-line/40 text-ink-text"
                }`}
              >
                {!mine && <p className="mb-0.5 text-xs font-medium text-teal">{memberName(m.user_id)}</p>}
                <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
              </div>
            </div>
          );
        })}

        {/* AI思考中インジケーター */}
        {aiThinking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border border-teal/20 bg-teal-soft/20 px-3.5 py-2 text-xs text-teal">
              <span className="animate-spin text-sm">🤖</span>
              <span>AIが旅行プランやアドバイスを考えています…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* AIクイック相談ショートカットボタン */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-paper-line bg-paper/40 px-3 py-2 text-xs">
        <span className="text-[11px] font-medium text-ink-text/50">💡 AIクイック相談:</span>
        <button
          type="button"
          onClick={() => handleQuickAiPrompt("急に雨が降ってきた！近くの屋内で楽しめるプランに変更して")}
          disabled={sending || aiThinking}
          className="rounded-full border border-paper-line bg-white px-2.5 py-1 text-ink-text/80 transition hover:border-teal hover:text-teal disabled:opacity-50 cursor-pointer"
        >
          🌧️ 雨天プランに変更
        </button>
        <button
          type="button"
          onClick={() => handleQuickAiPrompt("前の予定が1時間遅れてしまった！この後のスケジュールを再調整して")}
          disabled={sending || aiThinking}
          className="rounded-full border border-paper-line bg-white px-2.5 py-1 text-ink-text/80 transition hover:border-teal hover:text-teal disabled:opacity-50 cursor-pointer"
        >
          ⏱️ 予定遅れの調整
        </button>
        <button
          type="button"
          onClick={() => handleQuickAiPrompt("この周辺でメンバーみんなで楽しめるおすすめのカフェ・グルメを教えて")}
          disabled={sending || aiThinking}
          className="rounded-full border border-paper-line bg-white px-2.5 py-1 text-ink-text/80 transition hover:border-teal hover:text-teal disabled:opacity-50 cursor-pointer"
        >
          🍽️ おすすめグルメ
        </button>
      </div>

      {/* メッセージ入力・送信バー */}
      <form onSubmit={(e) => handleSend(e, false)} className="flex gap-2 border-t border-paper-line p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="メッセージを入力（「@AI 雨が降ってきた」でも相談可能）…"
          className="flex-1 rounded-lg border border-paper-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || aiThinking || !text.trim()}
          className="rounded-lg bg-paper-line/50 px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-paper-line/80 disabled:opacity-50 cursor-pointer"
        >
          送信
        </button>
        <button
          type="button"
          onClick={(e) => handleSend(e, true)}
          disabled={sending || aiThinking || !text.trim()}
          className="flex items-center gap-1 rounded-lg bg-teal px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-xs"
          title="Gemini AIに相談してタイムラインの提案をもらう"
        >
          <span>🤖</span>
          <span>AIに聞く</span>
        </button>
      </form>
    </div>
  );
}

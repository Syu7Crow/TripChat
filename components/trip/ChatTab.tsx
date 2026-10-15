"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseUser } from "@/lib/supabase/useUser";

type Message = {
  id: string;
  trip_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

type Member = { user_id: string; display_name: string };

export default function ChatTab({ tripId, members }: { tripId: string; members: Member[] }) {
  const supabase = createClient();
  const { userId } = useSupabaseUser();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
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
  }, [messages.length]);

  function memberName(id: string) {
    return members.find((m) => m.user_id === id)?.display_name ?? "元メンバー";
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;

    setSending(true);
    const { error } = await supabase.from("trip_messages").insert({ trip_id: tripId, body });
    setSending(false);
    if (!error) setText("");
  }

  return (
    <div className="flex h-[60vh] flex-col rounded-2xl border border-paper-line bg-white/60">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading && <p className="text-sm text-ink-text/50">読み込み中…</p>}
        {!loading && messages.length === 0 && (
          <p className="text-sm text-ink-text/50">まだメッセージはありません。最初の一言を送ってみましょう。</p>
        )}
        {messages.map((m) => {
          const mine = m.user_id === userId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-teal text-white" : "bg-paper-line/40 text-ink-text"}`}>
                {!mine && <p className="mb-0.5 text-xs font-medium text-teal">{memberName(m.user_id)}</p>}
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="flex gap-2 border-t border-paper-line p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="メッセージを入力…"
          className="flex-1 rounded-lg border border-paper-line bg-paper px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="rounded-lg bg-amber px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
        >
          送信
        </button>
      </form>
    </div>
  );
}

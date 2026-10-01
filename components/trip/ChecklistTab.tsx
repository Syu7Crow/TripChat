"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ChecklistItem = {
  id: string;
  trip_id: string;
  kind: "packing" | "todo";
  title: string;
  assignee_id: string | null;
  is_done: boolean;
};

type Member = { user_id: string; display_name: string };

export default function ChecklistTab({
  tripId,
  members,
}: {
  tripId: string;
  members: Member[];
}) {
  const supabase = createClient();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<"packing" | "todo">("packing");
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("checklist_items")
      .select("id, trip_id, kind, title, assignee_id, is_done")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true });
    setItems((data ?? []) as ChecklistItem[]);
    setLoading(false);
  }, [supabase, tripId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 初回データ取得のため意図的
    load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`checklist-${tripId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "checklist_items", filter: `trip_id=eq.${tripId}` },
        (payload) => {
          setItems((prev) => {
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as { id: string }).id;
              return prev.filter((i) => i.id !== oldId);
            }
            const row = payload.new as ChecklistItem;
            const exists = prev.some((i) => i.id === row.id);
            return exists ? prev.map((i) => (i.id === row.id ? row : i)) : [...prev, row];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  function memberName(id: string | null) {
    if (!id) return "未定";
    return members.find((m) => m.user_id === id)?.display_name ?? "不明";
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setAdding(true);
    const { data } = await supabase
      .from("checklist_items")
      .insert({
        trip_id: tripId,
        kind,
        title: title.trim(),
        assignee_id: assigneeId || null,
      })
      .select("id, trip_id, kind, title, assignee_id, is_done")
      .single();
    setAdding(false);
    if (data) {
      setItems((prev) => [...prev, data as ChecklistItem]);
      setTitle("");
      setAssigneeId("");
    }
  }

  async function toggleDone(item: ChecklistItem) {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_done: !i.is_done } : i))
    );
    await supabase.from("checklist_items").update({ is_done: !item.is_done }).eq("id", item.id);
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await supabase.from("checklist_items").delete().eq("id", id);
  }

  if (loading) {
    return <p className="text-ink-text/60">読み込み中…</p>;
  }

  const sections: Array<{ key: "packing" | "todo"; label: string }> = [
    { key: "packing", label: "持ち物" },
    { key: "todo", label: "ToDo" },
  ];

  return (
    <div className="space-y-8">
      {sections.map((section) => {
        const sectionItems = items.filter((i) => i.kind === section.key);
        return (
          <div key={section.key}>
            <h3 className="font-display text-lg text-ink">{section.label}</h3>
            <ul className="mt-3 space-y-2">
              {sectionItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-paper-line bg-white/60 px-4 py-2"
                >
                  <input
                    type="checkbox"
                    checked={item.is_done}
                    onChange={() => toggleDone(item)}
                    className="h-4 w-4 accent-teal"
                  />
                  <span
                    className={`flex-1 ${
                      item.is_done ? "text-ink-text/40 line-through" : "text-ink-text"
                    }`}
                  >
                    {item.title}
                  </span>
                  <span className="shrink-0 rounded-full bg-teal-soft px-2 py-0.5 text-xs text-ink-text/70">
                    {memberName(item.assignee_id)}
                  </span>
                  <button
                    onClick={() => remove(item.id)}
                    className="shrink-0 text-ink-text/40 hover:text-red-700"
                    aria-label="削除"
                  >
                    ×
                  </button>
                </li>
              ))}
              {sectionItems.length === 0 && (
                <li className="text-sm text-ink-text/50">まだ何もありません。</li>
              )}
            </ul>
          </div>
        );
      })}

      <form
        onSubmit={handleAdd}
        className="rounded-2xl border border-dashed border-paper-line px-4 py-4"
      >
        <div className="flex gap-2">
          {sections.map((s) => (
            <button
              type="button"
              key={s.key}
              onClick={() => setKind(s.key)}
              className={`rounded-full px-3 py-1 text-sm ${
                kind === s.key ? "bg-ink text-paper" : "border border-paper-line text-ink-text"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "packing" ? "持ち物(例: パスポート)" : "ToDo(例: レンタカーの予約)"}
          className="mt-2 w-full rounded-lg border border-paper-line bg-paper px-3 py-2 text-sm"
        />
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="mt-2 w-full rounded-lg border border-paper-line bg-paper px-3 py-2 text-sm"
        >
          <option value="">担当者: 未定</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={adding || !title.trim()}
          className="mt-3 rounded-lg bg-amber px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
        >
          {adding ? "追加中…" : "追加"}
        </button>
      </form>
    </div>
  );
}

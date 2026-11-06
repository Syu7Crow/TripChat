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
    <div className="space-y-6 sm:space-y-8">
      {sections.map((section) => {
        const sectionItems = items.filter((i) => i.kind === section.key);
        return (
          <div key={section.key}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg text-ink font-semibold">{section.label}</h3>
              <span className="text-xs text-ink-text/50">
                {sectionItems.filter((i) => i.is_done).length} / {sectionItems.length} 完了
              </span>
            </div>
            <ul className="mt-3 space-y-2">
              {sectionItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2.5 sm:gap-3 rounded-xl border border-paper-line bg-white/70 px-3.5 py-2.5 sm:py-3 shadow-2xs transition hover:border-paper-line/80"
                >
                  <label className="flex items-center justify-center p-1 -m-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.is_done}
                      onChange={() => toggleDone(item)}
                      className="h-5 w-5 rounded border-paper-line accent-teal cursor-pointer"
                    />
                  </label>
                  <span
                    onClick={() => toggleDone(item)}
                    className={`min-w-0 flex-1 text-sm break-words cursor-pointer select-none ${
                      item.is_done ? "text-ink-text/40 line-through" : "text-ink-text"
                    }`}
                  >
                    {item.title}
                  </span>
                  <span className="shrink-0 rounded-full bg-teal-soft/80 px-2.5 py-0.5 text-[11px] sm:text-xs text-ink-text/70">
                    {memberName(item.assignee_id)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-text/40 transition hover:bg-red-50 hover:text-red-700 cursor-pointer"
                    aria-label="削除"
                  >
                    ×
                  </button>
                </li>
              ))}
              {sectionItems.length === 0 && (
                <li className="rounded-xl border border-dashed border-paper-line p-4 text-center text-xs sm:text-sm text-ink-text/50">
                  まだ何も登録されていません。
                </li>
              )}
            </ul>
          </div>
        );
      })}

      <form
        onSubmit={handleAdd}
        className="rounded-2xl border border-dashed border-paper-line bg-white/40 p-4 sm:p-5"
      >
        <p className="text-xs font-semibold text-ink-text/70 mb-2.5">アイテムを追加</p>
        <div className="flex gap-2">
          {sections.map((s) => (
            <button
              type="button"
              key={s.key}
              onClick={() => setKind(s.key)}
              className={`rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition cursor-pointer ${
                kind === s.key
                  ? "bg-ink text-paper shadow-xs"
                  : "border border-paper-line bg-white text-ink-text/70 hover:border-ink/30"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "packing" ? "持ち物 (例: パスポート)" : "ToDo (例: レンタカーの予約)"}
          className="mt-3 w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none"
        />
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="mt-2 w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-base sm:text-sm text-ink focus:border-teal focus:outline-none"
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
          className="mt-3.5 w-full sm:w-auto rounded-lg bg-amber px-5 py-2.5 text-sm font-medium text-ink transition hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-xs active:scale-95"
        >
          {adding ? "追加中…" : `${kind === "packing" ? "持ち物" : "ToDo"}を追加`}
        </button>
      </form>
    </div>
  );
}

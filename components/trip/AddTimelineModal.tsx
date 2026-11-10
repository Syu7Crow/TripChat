"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type AddTimelineModalProps = {
  isOpen: boolean;
  onClose: () => void;
  dayNumber: number;
  dayNumbers: number[];
  onAdd: (data: {
    title: string;
    dayNumber: number;
    startTime: string;
    endTime: string;
    location: string;
    note: string;
  }) => Promise<void>;
  adding: boolean;
  locationNotice?: string | null;
  locationInfo?: string | null;
};

export default function AddTimelineModal({
  isOpen,
  onClose,
  dayNumber: initialDayNumber,
  dayNumbers,
  onAdd,
  adding,
  locationNotice,
  locationInfo,
}: AddTimelineModalProps) {
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState("");
  const [dayNumber, setDayNumber] = useState(initialDayNumber);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setDayNumber(initialDayNumber);
      setTitle("");
      setStartTime("");
      setEndTime("");
      setLocation("");
      setNote("");
    }
  }, [isOpen, initialDayNumber]);

  // モーダル表示中の背景スクロール固定
  useEffect(() => {
    if (isOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [isOpen]);

  // ESCキーで閉じる
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || adding) return;

    await onAdd({
      title: title.trim(),
      dayNumber,
      startTime,
      endTime,
      location,
      note,
    });
    onClose();
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/60 backdrop-blur-xs transition-opacity duration-200"
    >
      {/* 背景タップで閉じる */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* ボトムシート / モーダル本体 */}
      <div
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-2xl border-t sm:border border-paper-line bg-paper p-5 sm:p-6 shadow-2xl max-h-[92dvh] overflow-y-auto z-10 animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* スマホ用ドラッグハンドルバー */}
        <div className="w-12 h-1.5 bg-ink/20 rounded-full mx-auto mb-3 sm:hidden" />

        <div className="flex items-center justify-between border-b border-paper-line pb-3">
          <h2 className="font-display text-lg font-bold text-ink">新しい予定を追加</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-text/50 hover:bg-paper-line/50 hover:text-ink cursor-pointer transition text-2xl leading-none"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {/* 予定名 */}
          <div>
            <label className="block text-xs font-semibold text-ink-text/70 mb-1">
              予定名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="予定名 (例: 浅草寺を観光)"
              className="w-full min-h-[46px] rounded-xl border border-paper-line bg-white px-3.5 py-2.5 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none shadow-2xs"
            />
          </div>

          {/* 日程選択 */}
          <div>
            <label className="block text-xs font-semibold text-ink-text/70 mb-1">日程</label>
            <select
              value={dayNumber}
              onChange={(e) => setDayNumber(Number(e.target.value))}
              className="w-full min-h-[46px] rounded-xl border border-paper-line bg-white px-3.5 py-2.5 text-base sm:text-sm text-ink focus:border-teal focus:outline-none shadow-2xs"
            >
              {dayNumbers.map((d) => (
                <option key={d} value={d}>
                  {d}日目
                </option>
              ))}
            </select>
          </div>

          {/* 開始・終了時間 */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-ink-text/70 mb-1">開始時間</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full min-h-[46px] rounded-xl border border-paper-line bg-white px-3 py-2 text-base sm:text-sm text-ink focus:border-teal focus:outline-none shadow-2xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-text/70 mb-1">終了時間</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full min-h-[46px] rounded-xl border border-paper-line bg-white px-3 py-2 text-base sm:text-sm text-ink focus:border-teal focus:outline-none shadow-2xs"
              />
            </div>
          </div>

          {/* 場所 */}
          <div>
            <label className="block text-xs font-semibold text-ink-text/70 mb-1">
              場所・住所 (地図・移動時間用)
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="住所やスポット名 (任意)"
              className="w-full min-h-[46px] rounded-xl border border-paper-line bg-white px-3.5 py-2.5 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none shadow-2xs"
            />
          </div>

          {/* メモ */}
          <div>
            <label className="block text-xs font-semibold text-ink-text/70 mb-1">メモ</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="メモや持ち物など (任意)"
              className="w-full rounded-xl border border-paper-line bg-white px-3.5 py-2.5 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none shadow-2xs resize-none"
            />
          </div>

          {locationNotice && <p className="text-xs text-amber-dark">{locationNotice}</p>}
          {locationInfo && (
            <p className="whitespace-pre-line text-xs text-teal">{locationInfo}</p>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={adding || !title.trim()}
              className="w-full min-h-[48px] rounded-xl bg-amber px-5 py-3 text-base font-bold text-ink transition hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-sm active:scale-98"
            >
              {adding ? "追加中…" : "この予定を追加する"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
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

  // 下スワイプで閉じるドラッグジェスチャーの状態
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const currentTranslateY = useRef(0);

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
      setTranslateY(0);
      currentTranslateY.current = 0;
      setIsDragging(false);
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

  // スワイプダウン（ドラッグして閉じる）ハンドラー
  function handleTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isDragging) return;
    const deltaY = e.touches[0].clientY - dragStartY.current;
    if (deltaY > 0) {
      // 下方向へのドラッグ
      currentTranslateY.current = deltaY;
      setTranslateY(deltaY);
    } else {
      // 上方向への引き上げには抵抗をつける
      currentTranslateY.current = deltaY * 0.15;
      setTranslateY(deltaY * 0.15);
    }
  }

  function handleTouchEnd() {
    setIsDragging(false);
    // 80px以上下にドラッグした場合に閉じる
    if (currentTranslateY.current > 80) {
      setTranslateY(400); // 下にスムーズに退場
      setTimeout(() => {
        onClose();
        setTranslateY(0);
        currentTranslateY.current = 0;
      }, 180);
    } else {
      // 元の位置にスナップバック
      setTranslateY(0);
      currentTranslateY.current = 0;
    }
  }

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
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-2xl border-t sm:border border-paper-line bg-paper px-5 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] sm:p-6 shadow-2xl max-h-[92dvh] overflow-y-auto z-10 will-change-transform"
        style={{
          transform: translateY !== 0 ? `translateY(${Math.max(0, translateY)}px)` : undefined,
          transition: isDragging
            ? "none"
            : "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* スマホ用ドラッグハンドル領域（スワイプダウンで閉じるタッチ領域） */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="w-full py-2.5 -mt-1 mb-1 flex items-center justify-center cursor-grab active:cursor-grabbing sm:hidden touch-none select-none"
        >
          <div className="w-12 h-1.5 bg-ink/30 rounded-full transition-transform active:scale-110" />
        </div>

        {/* ヘッダー部（ここもスワイプダウン操作に対応） */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="flex items-center justify-between border-b border-paper-line pb-3 select-none touch-none"
        >
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
              className="w-full min-h-[46px] rounded-xl border border-paper-line bg-white px-3.5 py-2.5 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none shadow-2xs box-border"
            />
          </div>

          {/* 日程選択 */}
          <div>
            <label className="block text-xs font-semibold text-ink-text/70 mb-1">日程</label>
            <select
              value={dayNumber}
              onChange={(e) => setDayNumber(Number(e.target.value))}
              className="w-full min-h-[46px] rounded-xl border border-paper-line bg-white px-3.5 py-2.5 text-base sm:text-sm text-ink focus:border-teal focus:outline-none shadow-2xs box-border"
            >
              {dayNumbers.map((d) => (
                <option key={d} value={d}>
                  {d}日目
                </option>
              ))}
            </select>
          </div>

          {/* 開始・終了時間（iPhone等で横幅がはみ出ないよう min-w-0 / box-border を指定） */}
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-ink-text/70 mb-1">開始時間</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full min-w-0 min-h-[46px] rounded-xl border border-paper-line bg-white px-2.5 py-2 text-base sm:text-sm text-ink focus:border-teal focus:outline-none shadow-2xs box-border"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-ink-text/70 mb-1">終了時間</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full min-w-0 min-h-[46px] rounded-xl border border-paper-line bg-white px-2.5 py-2 text-base sm:text-sm text-ink focus:border-teal focus:outline-none shadow-2xs box-border"
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
              className="w-full min-h-[46px] rounded-xl border border-paper-line bg-white px-3.5 py-2.5 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none shadow-2xs box-border"
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
              className="w-full rounded-xl border border-paper-line bg-white px-3.5 py-2.5 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none shadow-2xs resize-none box-border"
            />
          </div>

          {locationNotice && <p className="text-xs text-amber-dark">{locationNotice}</p>}
          {locationInfo && (
            <p className="whitespace-pre-line text-xs text-teal">{locationInfo}</p>
          )}

          {/* 追加ボタン（iPhone下部セーフエリアと被らないよう余裕のある配置） */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={adding || !title.trim()}
              className="w-full min-h-[50px] rounded-xl bg-amber px-5 py-3 text-base font-bold text-ink transition hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-sm active:scale-98 flex items-center justify-center"
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

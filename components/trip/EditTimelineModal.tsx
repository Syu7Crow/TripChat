"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import type { LatLng } from "@/lib/geocode";
import { TIMELINE_ITEM_COLUMNS, type TimelineItem } from "@/lib/trip-utils";
import LocationPicker, { resolveLocation, type LocationValue, EMPTY_LOCATION } from "./LocationPicker";

type EditTimelineModalProps = {
  item: TimelineItem | null;
  dayNumbers: number[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedItem: TimelineItem) => void;
  /** 旅行中の他の予定の位置(場所検索で近くを優先するため) */
  near?: LatLng | null;
};

export default function EditTimelineModal({
  item,
  dayNumbers,
  isOpen,
  onClose,
  onSave,
  near,
}: EditTimelineModalProps) {
  const supabase = createClient();
  const [mounted, setMounted] = useState(false);

  const [title, setTitle] = useState("");
  const [dayNumber, setDayNumber] = useState(1);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocationState] = useState<LocationValue>(EMPTY_LOCATION);
  // 「見つからない」と警告されたあと、もう一度保存を押したら位置情報なしで保存する
  const [acceptNoLocation, setAcceptNoLocation] = useState(false);
  function setLocation(v: LocationValue) {
    setLocationState(v);
    setAcceptNoLocation(false);
  }
  const [note, setNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 下スワイプで閉じるドラッグジェスチャーの状態
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const currentTranslateY = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 編集対象のアイテムが変わるか、モーダルが開いたときにフォーム値を同期
  useEffect(() => {
    if (item && isOpen) {
      setTitle(item.title);
      setDayNumber(item.day_number);
      setStartTime(item.start_time ? item.start_time.slice(0, 5) : "");
      setEndTime(item.end_time ? item.end_time.slice(0, 5) : "");
      setLocationState({
        text: item.location_text ?? "",
        lat: item.lat,
        lng: item.lng,
        resolvedText: item.location_text ?? "",
        label: item.lat !== null && item.lng !== null ? "保存済みの位置" : null,
        how: item.lat !== null && item.lng !== null ? "saved" : null,
      });
      setNote(item.note ?? "");
      setAcceptNoLocation(false);
      setError(null);
      setTranslateY(0);
      currentTranslateY.current = 0;
      setIsDragging(false);
    }
  }, [item, isOpen]);

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
      currentTranslateY.current = deltaY;
      setTranslateY(deltaY);
    } else {
      currentTranslateY.current = deltaY * 0.15;
      setTranslateY(deltaY * 0.15);
    }
  }

  function handleTouchEnd() {
    setIsDragging(false);
    if (currentTranslateY.current > 80) {
      setTranslateY(400);
      setTimeout(() => {
        onClose();
        setTranslateY(0);
        currentTranslateY.current = 0;
      }, 180);
    } else {
      setTranslateY(0);
      currentTranslateY.current = 0;
    }
  }

  if (!mounted || !isOpen || !item) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    if (!title.trim()) {
      setError("予定名を入力してください。");
      return;
    }

    setSaving(true);
    setError(null);

    // 入力だけして候補を選んでいない場合は、ここで検索して一番上の候補を使う
    const resolved = await resolveLocation(location, near);
    let loc = resolved.value;

    if (resolved.status === "failed" || resolved.status === "error") {
      if (!acceptNoLocation) {
        setSaving(false);
        setAcceptNoLocation(true);
        setError(
          resolved.status === "error"
            ? "場所の検索に接続できませんでした。通信状況を確認してください。このまま保存する場合は、もう一度「保存」を押してください(位置は変更されません)。"
            : "場所が見つかりませんでした。「検索」で候補を選ぶか、地図でピンを置いてください。位置情報なしで保存する場合は、もう一度「保存」を押してください。"
        );
        return;
      }
      // 入力を変えたのに見つからない場合、古い位置は別の場所なので外す(通信エラー時は変更しない)
      if (resolved.status === "failed") {
        loc = { ...loc, lat: null, lng: null, resolvedText: null, label: null, how: null };
      }
    }

    const { data, error: updateError } = await supabase
      .from("timeline_items")
      .update({
        title: title.trim(),
        day_number: dayNumber,
        start_time: startTime || null,
        end_time: endTime || null,
        note: note.trim() || null,
        lat: loc.lat,
        lng: loc.lng,
        location_text: loc.text.trim() || null,
      })
      .eq("id", item.id)
      .select(TIMELINE_ITEM_COLUMNS)
      .single();

    setSaving(false);

    if (updateError || !data) {
      setError("予定の保存に失敗しました。少し時間をおいて再度お試しください。");
      return;
    }

    onSave(data as TimelineItem);
    onClose();
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
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
          <h2 id="edit-modal-title" className="font-display text-lg font-bold text-ink">
            予定を編集
          </h2>
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
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="予定名 (例: 浅草寺を観光)"
              className="w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none shadow-2xs"
            />
          </div>

          {/* 日程選択 */}
          <div>
            <label className="block text-xs font-semibold text-ink-text/70 mb-1">日程</label>
            <select
              value={dayNumber}
              onChange={(e) => setDayNumber(Number(e.target.value))}
              className="w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-base sm:text-sm text-ink focus:border-teal focus:outline-none shadow-2xs"
            >
              {dayNumbers.map((d) => (
                <option key={d} value={d}>
                  {d}日目
                </option>
              ))}
            </select>
          </div>

          {/* 開始・終了時間 */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-ink-text/70 mb-1">開始時間</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-paper-line bg-white min-h-[46px] px-2.5 py-1.5 text-base sm:text-sm text-ink focus:border-teal focus:outline-none shadow-2xs"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-ink-text/70 mb-1">終了時間</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-lg border border-paper-line bg-white min-h-[46px] px-2.5 py-1.5 text-base sm:text-sm text-ink focus:border-teal focus:outline-none shadow-2xs"
              />
            </div>
          </div>

          {/* 場所 */}
          <div>
            <label className="block text-xs font-semibold text-ink-text/70 mb-1">
              場所・住所 (地図・移動時間用)
            </label>
            <LocationPicker value={location} onChange={setLocation} near={near} />
          </div>

          {/* メモ */}
          <div>
            <label className="block text-xs font-semibold text-ink-text/70 mb-1">メモ</label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="持ち物、予約番号、見どころなど…"
              className="w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none shadow-2xs resize-none"
            />
          </div>

          {error && <p className="text-xs sm:text-sm text-red-600 font-medium">{error}</p>}

          {/* ボタン */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-paper-line">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-medium text-ink-text/70 transition hover:bg-paper-line/50 cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="min-h-[44px] rounded-xl bg-amber px-6 py-2.5 text-sm font-bold text-ink transition hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-xs active:scale-95"
            >
              {saving ? "保存中…" : "変更を保存"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}


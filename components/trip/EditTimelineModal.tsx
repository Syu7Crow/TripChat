"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { geocodeAddress } from "@/lib/geocode";
import type { TimelineItem } from "@/lib/trip-utils";

type EditTimelineModalProps = {
  item: TimelineItem | null;
  dayNumbers: number[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedItem: TimelineItem) => void;
};

export default function EditTimelineModal({
  item,
  dayNumbers,
  isOpen,
  onClose,
  onSave,
}: EditTimelineModalProps) {
  const supabase = createClient();
  const [mounted, setMounted] = useState(false);

  const [title, setTitle] = useState("");
  const [dayNumber, setDayNumber] = useState(1);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [clearLocation, setClearLocation] = useState(false);
  const [note, setNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setLocation("");
      setClearLocation(false);
      setNote(item.note ?? "");
      setLocationNotice(null);
      setError(null);
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
    setLocationNotice(null);

    let lat = item.lat;
    let lng = item.lng;

    // 位置情報のクリアまたは再検索
    if (clearLocation) {
      lat = null;
      lng = null;
    } else if (location.trim()) {
      try {
        const geo = await geocodeAddress(location.trim());
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;
        } else {
          setLocationNotice(`「${location}」の位置情報が見つかりませんでした。位置は変更されません。`);
        }
      } catch {
        setLocationNotice("位置情報の検索中にエラーが発生しました。");
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
        lat,
        lng,
      })
      .eq("id", item.id)
      .select("id, trip_id, day_number, position, start_time, end_time, title, note, lat, lng, travel_mode")
      .single();

    setSaving(false);

    if (updateError || !data) {
      setError("予定の保存に失敗しました。少し時間をおいて再度お試しください。");
      return;
    }

    onSave(data as TimelineItem);
    onClose();
  }

  const hasCoords = item.lat !== null && item.lng !== null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-ink/60 backdrop-blur-xs transition-opacity duration-200"
    >
      {/* 背景タップで閉じる */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* モーダル本体 */}
      <div
        className="relative w-full max-w-lg rounded-2xl border border-paper-line bg-paper p-5 sm:p-6 shadow-2xl max-h-[90dvh] overflow-y-auto z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-paper-line pb-3">
          <h2 id="edit-modal-title" className="font-display text-lg font-bold text-ink">
            予定を編集
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-text/50 hover:bg-paper-line/50 hover:text-ink cursor-pointer transition text-lg leading-none"
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
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-ink-text/70 mb-1">開始時間</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-paper-line bg-white px-2.5 py-1.5 text-base sm:text-sm text-ink focus:border-teal focus:outline-none shadow-2xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-text/70 mb-1">終了時間</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-lg border border-paper-line bg-white px-2.5 py-1.5 text-base sm:text-sm text-ink focus:border-teal focus:outline-none shadow-2xs"
              />
            </div>
          </div>

          {/* 場所 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-ink-text/70">
                場所・住所 (地図・移動時間用)
              </label>
              {hasCoords && !clearLocation && (
                <span className="text-[11px] text-teal font-medium">📍 位置情報登録済み</span>
              )}
              {(!hasCoords || clearLocation) && (
                <span className="text-[11px] text-ink-text/40">位置情報なし</span>
              )}
            </div>
            <input
              type="text"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                if (e.target.value) setClearLocation(false);
              }}
              placeholder={hasCoords && !clearLocation ? "場所を変更する場合は入力…" : "スポット名や住所を入力…"}
              className="w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none shadow-2xs"
            />
            {hasCoords && !clearLocation && (
              <label className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-text/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearLocation}
                  onChange={(e) => setClearLocation(e.target.checked)}
                  className="rounded border-paper-line accent-teal h-3.5 w-3.5 cursor-pointer"
                />
                <span>位置情報を削除する</span>
              </label>
            )}
            {locationNotice && <p className="mt-1 text-xs text-amber-dark">{locationNotice}</p>}
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
              className="rounded-lg px-4 py-2 text-sm font-medium text-ink-text/70 transition hover:bg-paper-line/50 cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="rounded-lg bg-amber px-5 py-2 text-sm font-medium text-ink transition hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-xs active:scale-95"
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


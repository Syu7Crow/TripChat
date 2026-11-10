"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TimelineItem, TravelMode } from "@/lib/trip-utils";
import {
  estimateTravel,
  formatDuration,
  haversineDistanceKm,
  planTransit,
  type TravelEstimate,
} from "@/lib/travel-estimate";
import { stationKey, type StationLookup } from "@/lib/stations";

type TravelModeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  fromItem: TimelineItem;
  toItem: TimelineItem;
  currentMode: TravelMode;
  stations: Record<string, StationLookup>;
  onSelectMode: (mode: TravelMode) => void;
};

// 2枚目の画像の選択肢（2列グリッド）
const MODE_OPTIONS: Array<{
  key: TravelMode;
  label: string;
  icon: string;
}> = [
  { key: "walking", label: "徒歩", icon: "👣" },
  { key: "transit", label: "電車", icon: "🚆" },
  { key: "bus", label: "バス", icon: "🚌" },
  { key: "taxi", label: "タクシー", icon: "🚕" },
  { key: "car", label: "自動車", icon: "🚗" },
  { key: "airplane", label: "飛行機", icon: "✈️" },
  { key: "ferry", label: "フェリー", icon: "⛴️" },
];

export default function TravelModeModal({
  isOpen,
  onClose,
  fromItem,
  toItem,
  currentMode,
  stations,
  onSelectMode,
}: TravelModeModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedMode, setSelectedMode] = useState<TravelMode>(currentMode);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSelectedMode(currentMode);
    }
  }, [isOpen, currentMode]);

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

  // 距離・所要時間・運賃の計算
  const hasRoute =
    fromItem.lat !== null &&
    fromItem.lng !== null &&
    toItem.lat !== null &&
    toItem.lng !== null;

  const distanceKm = hasRoute
    ? haversineDistanceKm(
        { lat: fromItem.lat as number, lng: fromItem.lng as number },
        { lat: toItem.lat as number, lng: toItem.lng as number }
      )
    : null;

  const transitPlan =
    hasRoute && distanceKm !== null
      ? planTransit(
          stations[stationKey(fromItem.lat as number, fromItem.lng as number)],
          stations[stationKey(toItem.lat as number, toItem.lng as number)],
          distanceKm
        )
      : null;

  let estimate: TravelEstimate | null = null;
  let detailNote = "";

  if (distanceKm !== null) {
    if (selectedMode === "transit") {
      if (transitPlan?.status === "ok") {
        estimate = transitPlan.estimate;
        detailNote = transitPlan.detail;
      } else {
        estimate = estimateTravel(distanceKm, "transit");
        detailNote = "最寄り駅情報を参照した目安";
      }
    } else {
      estimate = estimateTravel(distanceKm, selectedMode);
      detailNote = estimate.basis;
    }
  }

  function handleConfirm() {
    onSelectMode(selectedMode);
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

      {/* ボトムシート / モーダル本体（2枚目の画像仕様） */}
      <div
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-2xl border-t sm:border border-paper-line bg-white p-5 sm:p-6 shadow-2xl max-h-[92dvh] overflow-y-auto z-10 animate-in slide-in-from-bottom duration-200 text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        {/* スマホ用ドラッグバー */}
        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3" />

        {/* ヘッダー */}
        <div>
          <h2 className="text-base sm:text-lg font-bold text-gray-900">移動方法を選択</h2>
          <p className="mt-1 text-xs text-gray-500">
            {fromItem.title} → {toItem.title}
          </p>
        </div>

        {/* 移動手段グリッド（2列ボタン） */}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {MODE_OPTIONS.map((opt) => {
            const isSelected = selectedMode === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSelectedMode(opt.key)}
                className={`min-h-[48px] rounded-xl border px-3.5 py-3 text-left font-medium transition cursor-pointer active:scale-98 flex items-center gap-2 ${
                  isSelected
                    ? "border-teal bg-teal/10 text-teal-900 ring-2 ring-teal/30 shadow-xs"
                    : "border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <span className="text-lg leading-none">{opt.icon}</span>
                <span className="text-sm font-semibold">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* 検索結果セクション（2枚目画像仕様） */}
        <div className="mt-6 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-bold text-gray-900">検索結果</h3>

          <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700">おすすめルート</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                最短
              </span>
            </div>

            {/* 大きな所要時間 */}
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-gray-900 tracking-tight">
                {estimate ? formatDuration(estimate.minutes) : "--分"}
              </span>
            </div>

            {/* 料金・乗換案内 */}
            <p className="mt-1 text-xs font-semibold text-gray-700">
              {selectedMode === "transit" ? "乗換目安・" : ""}約
              {estimate ? estimate.fareYen.toLocaleString() : "0"}円
              {distanceKm !== null && (
                <span className="text-gray-500 font-normal ml-1.5">
                  (約{distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)}km)
                </span>
              )}
            </p>

            {/* 案内メッセージ */}
            <p className="mt-2 text-xs text-gray-500 leading-relaxed">
              {detailNote || "路線・乗換駅・出発時刻を確認できます。"}
            </p>
          </div>

          {/* 決定ボタン */}
          <div className="mt-4">
            <button
              type="button"
              onClick={handleConfirm}
              className="w-full min-h-[50px] rounded-xl bg-[#00b894] hover:bg-[#00a383] py-3.5 text-base font-bold text-white shadow-md transition active:scale-98 cursor-pointer flex items-center justify-center"
            >
              この経路に決定
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

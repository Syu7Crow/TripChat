"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  candidateLabel,
  searchLocations,
  type GeocodeCandidate,
  type LatLng,
} from "@/lib/geocode";

const LocationPickerMap = dynamic(() => import("./LocationPickerMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[210px] items-center justify-center rounded-xl border border-paper-line bg-white/60 text-xs text-ink-text/50">
      地図を読み込み中…
    </div>
  ),
});

/** 東京駅(ピンも他の予定もまだ無いときに地図を開く位置) */
const DEFAULT_CENTER: LatLng = { lat: 35.6812, lng: 139.7671 };

export type LocationValue = {
  /** 利用者が入力した場所の文字(予定に表示する) */
  text: string;
  lat: number | null;
  lng: number | null;
  /** 位置を決めたときの検索語。text と違えば「入力を変えたあと、まだ検索していない」 */
  resolvedText: string | null;
  /** どこが登録されるかの表示用(検索結果の名前・住所など) */
  label: string | null;
  how: "search" | "map" | "saved" | null;
};

export const EMPTY_LOCATION: LocationValue = {
  text: "",
  lat: null,
  lng: null,
  resolvedText: null,
  label: null,
  how: null,
};

export type ResolveStatus =
  | "none" // 場所の入力なし
  | "kept" // 選択済みの位置をそのまま使う
  | "auto" // 検索して、いちばん上の候補を自動で採用した
  | "failed" // 見つからなかった(位置情報なし/変更なし)
  | "error"; // 検索サービスに接続できなかった

/**
 * 保存の直前に呼ぶ。候補を選んでいればそのまま、入力だけして選んでいなければ
 * 検索して、いちばん上の候補を採用する(結果は呼び出し側が画面に知らせる)。
 */
export async function resolveLocation(
  value: LocationValue,
  near?: LatLng | null
): Promise<{ value: LocationValue; status: ResolveStatus }> {
  const text = value.text.trim();
  const hasPin = value.lat !== null && value.lng !== null;

  if (!text && !hasPin) return { value, status: "none" };
  if (hasPin && (value.how === "map" || !text || text === (value.resolvedText ?? "").trim())) {
    return { value, status: "kept" };
  }

  const list = await searchLocations(text, near);
  if (list === null) return { value, status: "error" };
  if (list.length === 0) return { value, status: "failed" };

  const top = list[0];
  return {
    value: {
      ...value,
      lat: top.lat,
      lng: top.lng,
      resolvedText: text,
      label: candidateLabel(top),
      how: "search",
    },
    status: "auto",
  };
}

export default function LocationPicker({
  value,
  onChange,
  near,
}: {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  /** 旅行中の他の予定の位置。近くの候補を優先するために使う */
  near?: LatLng | null;
}) {
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<{ type: "info" | "warn"; text: string } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [focusKey, setFocusKey] = useState(0);

  const hasPin = value.lat !== null && value.lng !== null;
  const text = value.text.trim();
  const dirty = hasPin && value.how !== "map" && !!text && text !== (value.resolvedText ?? "").trim();
  const showMap = hasPin || mapOpen;

  async function runSearch() {
    if (!text || searching) return;
    setSearching(true);
    setMessage(null);
    setCandidates([]);
    const list = await searchLocations(text, near);
    setSearching(false);

    if (list === null) {
      setMessage({
        type: "warn",
        text: "検索サービスに接続できませんでした。通信状況を確認して、もう一度お試しください。",
      });
      return;
    }
    if (list.length === 0) {
      setMessage({
        type: "warn",
        text:
          "見つかりませんでした。「都道府県+市区町村から」入力するか、建物名・階数を除いて試してください。" +
          "下の「地図で位置を指定」から、直接ピンを置くこともできます。",
      });
      return;
    }
    setCandidates(list);
  }

  function pickCandidate(c: GeocodeCandidate) {
    onChange({
      ...value,
      lat: c.lat,
      lng: c.lng,
      resolvedText: value.text,
      label: candidateLabel(c),
      how: "search",
    });
    setCandidates([]);
    setMessage(null);
    setFocusKey((k) => k + 1);
  }

  function pickOnMap(lat: number, lng: number) {
    onChange({
      ...value,
      lat,
      lng,
      resolvedText: value.text,
      label: "地図で指定した位置",
      how: "map",
    });
    setCandidates([]);
    setMessage(null);
  }

  function clearPin() {
    onChange({ ...value, lat: null, lng: null, resolvedText: null, label: null, how: null });
    setMapOpen(false);
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={value.text}
          enterKeyHint="search"
          onChange={(e) => {
            onChange({ ...value, text: e.target.value });
            setMessage(null);
          }}
          onKeyDown={(e) => {
            // フォーム全体が送信されないよう、Enterは「検索」として扱う
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              runSearch();
            }
          }}
          placeholder="住所やスポット名 (任意)"
          className="min-h-[46px] min-w-0 flex-1 rounded-xl border border-paper-line bg-white px-3.5 py-2.5 text-base sm:text-sm text-ink placeholder:text-ink-text/40 focus:border-teal focus:outline-none shadow-2xs box-border"
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={!text || searching}
          className="min-h-[46px] shrink-0 rounded-xl bg-teal px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 cursor-pointer active:scale-95"
        >
          {searching ? "検索中…" : "検索"}
        </button>
      </div>

      {/* 検索結果の候補 */}
      {candidates.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-xs font-semibold text-ink-text/70">
            {candidates.length}件見つかりました。合っている場所を選んでください
          </p>
          <ul className="max-h-56 space-y-1.5 overflow-y-auto">
            {candidates.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => pickCandidate(c)}
                  className="block w-full rounded-xl border border-paper-line bg-white px-3 py-2 text-left transition hover:border-teal active:scale-[0.99] cursor-pointer"
                >
                  <span className="block text-sm font-semibold text-ink-text">📍 {c.name}</span>
                  {c.address && c.address !== c.name && (
                    <span className="mt-0.5 block text-xs text-ink-text/60">{c.address}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {message && (
        <p className={`mt-2 text-xs ${message.type === "warn" ? "text-amber-dark" : "text-teal"}`}>
          {message.text}
        </p>
      )}

      {/* いま登録される場所の状態 */}
      {hasPin ? (
        <p className="mt-2 text-xs font-medium text-teal">
          📍 登録される場所: {value.label ?? "登録済みの位置"}
        </p>
      ) : (
        text && (
          <p className="mt-2 text-xs text-ink-text/50">
            位置情報なし(地図・移動時間には使われません)
          </p>
        )
      )}
      {dirty && (
        <p className="mt-1 text-xs text-amber-dark">
          入力を変えました。「検索」で場所を選び直してください(そのまま保存すると、自動で再検索します)。
        </p>
      )}

      {/* 地図で位置を確認・微調整 */}
      {showMap ? (
        <div className="mt-2">
          <LocationPickerMap
            lat={value.lat}
            lng={value.lng}
            fallbackCenter={near ?? DEFAULT_CENTER}
            focusKey={focusKey}
            onPick={pickOnMap}
          />
          <p className="mt-1 text-[11px] text-ink-text/50">
            ピンをドラッグするか、地図をタップすると位置を微調整できます。
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          className="mt-2 text-xs font-semibold text-teal underline cursor-pointer"
        >
          🗺 地図で位置を指定
        </button>
      )}

      {hasPin && (
        <button
          type="button"
          onClick={clearPin}
          className="mt-1 text-xs text-ink-text/60 underline cursor-pointer"
        >
          位置情報を外す
        </button>
      )}
    </div>
  );
}

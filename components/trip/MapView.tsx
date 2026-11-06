"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  searchNearbyPlaces,
  searchPlacesByKeyword,
  PRESET_CATEGORIES,
  getCategoryLabel,
  type DiscoveredPlace,
  type PlaceCategory,
} from "@/lib/overpass";

type Spot = {
  id: string;
  title: string;
  lat: number;
  lng: number;
};

function numberedIcon(index: number) {
  return L.divIcon({
    className: "",
    html: `<div style="background:#4c9a90;color:#fff;width:28px;height:28px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35)">${
      index + 1
    }</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const CATEGORY_COLORS: Record<string, string> = {
  cafe: "#9c6038", // ブラウン
  hotel: "#3b5998", // 紺・ブルー
  restaurant: "#d9534f", // レッド・オレンジ
  sightseeing: "#2e7d32", // グリーン
  onsen: "#0288d1", // 水色
  convenience: "#00897b", // ティール
  all: "#e69a35", // アンバー
};

function categoryIcon(category: string, iconChar: string) {
  const bg = CATEGORY_COLORS[category] ?? "#e69a35";
  return L.divIcon({
    className: "",
    html: `<div style="background:${bg};color:#fff;width:26px;height:26px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35)">${iconChar}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function FitBounds({ spots }: { spots: Spot[] }) {
  const map = useMap();
  useEffect(() => {
    if (spots.length === 0) return;
    if (spots.length === 1) {
      map.setView([spots[0].lat, spots[0].lng], 15);
      return;
    }
    const bounds = L.latLngBounds(spots.map((s) => [s.lat, s.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [32, 32] });
  }, [spots, map]);
  return null;
}

function InvalidateSizeOnMount() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

/**
 * 地図上部に配置する周辺検索コントロール（キーワード検索 ＋ カフェ・ホテル・旅館等のカテゴリボタン）
 */
function SearchControlPanel({
  onResults,
  onClear,
  resultCount,
  searching,
  setSearching,
}: {
  onResults: (places: DiscoveredPlace[]) => void;
  onClear: () => void;
  resultCount: number;
  searching: boolean;
  setSearching: (v: boolean) => void;
}) {
  const map = useMap();
  const [keyword, setKeyword] = useState("");
  const [activeCategory, setActiveCategory] = useState<PlaceCategory | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);

  // カテゴリーボタンをクリックした時
  async function handleCategorySelect(cat: PlaceCategory) {
    setActiveCategory(cat);
    setSearching(true);
    setSearchNotice(null);

    try {
      const b = map.getBounds();
      const bounds = {
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      };
      const places = await searchNearbyPlaces(bounds, cat);
      onResults(places);
      if (places.length === 0) {
        setSearchNotice("この範囲に該当するスポットは見つかりませんでした");
      }
    } catch {
      onResults([]);
      setSearchNotice("スポットの検索中にエラーが発生しました");
    } finally {
      setSearching(false);
    }
  }

  // キーワード入力で検索した時
  async function handleKeywordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;

    setActiveCategory(null);
    setSearching(true);
    setSearchNotice(null);

    try {
      const b = map.getBounds();
      const bounds = {
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      };
      const places = await searchPlacesByKeyword(bounds, keyword.trim());
      onResults(places);
      if (places.length === 0) {
        setSearchNotice(`「${keyword}」は見つかりませんでした`);
      }
    } catch {
      onResults([]);
      setSearchNotice("検索中にエラーが発生しました");
    } finally {
      setSearching(false);
    }
  }

  function handleClearResults() {
    onClear();
    setKeyword("");
    setActiveCategory(null);
    setSearchNotice(null);
  }

  return (
    <div
      style={{ position: "absolute", top: 10, left: 10, right: 10, zIndex: 1000 }}
      className="pointer-events-none flex flex-col items-center gap-1.5"
    >
      <div className="pointer-events-auto w-full max-w-lg space-y-1.5">
        {/* 検索入力バー */}
        <form
          onSubmit={handleKeywordSubmit}
          className="flex items-center gap-1.5 rounded-xl border border-paper-line bg-white/95 backdrop-blur-md p-1.5 shadow-md"
        >
          <span className="pl-2 text-ink-text/50 text-xs sm:text-sm">🔍</span>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="周辺を検索 (カフェ、ホテル、旅館、ラーメンなど)…"
            className="min-w-0 flex-1 bg-transparent px-1 py-1 text-base sm:text-xs text-ink placeholder:text-ink-text/40 focus:outline-none"
          />
          {keyword && (
            <button
              type="button"
              onClick={() => setKeyword("")}
              className="p-1 text-ink-text/40 hover:text-ink text-xs cursor-pointer"
            >
              ×
            </button>
          )}
          <button
            type="submit"
            disabled={searching || !keyword.trim()}
            className="shrink-0 rounded-lg bg-teal px-3 py-1.5 text-xs font-medium text-white shadow-xs transition hover:opacity-90 disabled:opacity-50 cursor-pointer active:scale-95"
          >
            {searching ? "検索中…" : "検索"}
          </button>
        </form>

        {/* カテゴリーチップ（横スクロール） */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          {PRESET_CATEGORIES.map((cat) => {
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategorySelect(cat.id)}
                disabled={searching}
                className={`shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition shadow-xs cursor-pointer active:scale-95 whitespace-nowrap ${
                  isSelected
                    ? "bg-ink text-paper"
                    : "bg-white/90 backdrop-blur-md text-ink-text/80 hover:bg-white border border-paper-line/70"
                } disabled:opacity-50`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* 検索結果・クリアバー */}
        {(resultCount > 0 || searchNotice) && (
          <div className="flex items-center justify-between rounded-lg bg-ink/80 backdrop-blur-md px-3 py-1.5 text-[11px] text-paper shadow-sm animate-in fade-in">
            <span>
              {searching
                ? "探しています…"
                : searchNotice || `周辺に ${resultCount} 件のスポットを発見しました`}
            </span>
            {resultCount > 0 && (
              <button
                type="button"
                onClick={handleClearResults}
                className="underline opacity-80 hover:opacity-100 cursor-pointer ml-2 shrink-0"
              >
                ピンを消す
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MapView({
  spots,
  onAddSpot,
}: {
  spots: Spot[];
  onAddSpot?: (name: string, lat: number, lng: number) => void;
}) {
  const [discovered, setDiscovered] = useState<DiscoveredPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const center: [number, number] =
    spots.length > 0 ? [spots[0].lat, spots[0].lng] : [35.681236, 139.767125]; // 東京駅

  function handleAdd(place: DiscoveredPlace) {
    onAddSpot?.(place.name, place.lat, place.lng);
    setAddedIds((prev) => new Set(prev).add(place.id));
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom
        className="h-full w-full rounded-none md:rounded-2xl"
        style={{ height: "100%", width: "100%" }}
      >
        <InvalidateSizeOnMount />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* タイムラインに登録済みのスポット（緑の番号ピン） */}
        {spots.map((spot, index) => (
          <Marker key={spot.id} position={[spot.lat, spot.lng]} icon={numberedIcon(index)}>
            <Popup>
              <p className="font-semibold text-sm text-ink">{spot.title}</p>
              <p className="text-xs text-teal font-medium mt-0.5">登録済みの予定 ({index + 1}番目)</p>
            </Popup>
          </Marker>
        ))}

        {/* スポット同士を結ぶルート線 */}
        {spots.length > 1 && (
          <Polyline
            positions={spots.map((s) => [s.lat, s.lng] as [number, number])}
            pathOptions={{ color: "#4c9a90", dashArray: "6 6" }}
          />
        )}

        {/* 周辺検索で見つかったスポット（カテゴリー色と絵文字のピン） */}
        {discovered.map((place) => {
          const { icon, label } = getCategoryLabel(place.category);
          return (
            <Marker
              key={place.id}
              position={[place.lat, place.lng]}
              icon={categoryIcon(place.category, icon)}
            >
              <Popup>
                <div className="p-0.5">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-ink-text/60 mb-0.5">
                    <span>{icon}</span>
                    <span>{place.categoryLabel || label}</span>
                  </div>
                  <p className="font-bold text-sm text-ink">{place.name}</p>
                  {onAddSpot && (
                    <button
                      type="button"
                      onClick={() => handleAdd(place)}
                      disabled={addedIds.has(place.id)}
                      className={`mt-2.5 w-full rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer active:scale-95 shadow-2xs ${
                        addedIds.has(place.id)
                          ? "bg-teal/20 text-teal cursor-default"
                          : "bg-amber text-ink hover:opacity-90"
                      }`}
                    >
                      {addedIds.has(place.id) ? "✅ 予定に追加済み" : "＋ この日の予定に追加"}
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        <FitBounds spots={spots} />

        {/* 検索パネル（入力欄 ＋ カフェ・ホテル・旅館などのカテゴリボタン） */}
        {onAddSpot && (
          <SearchControlPanel
            onResults={setDiscovered}
            onClear={() => setDiscovered([])}
            resultCount={discovered.length}
            searching={searching}
            setSearching={setSearching}
          />
        )}
      </MapContainer>
    </div>
  );
}

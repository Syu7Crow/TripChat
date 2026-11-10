"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const MAPTILER_ATTRIBUTION =
  '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noreferrer">&copy; MapTiler</a> ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">&copy; OpenStreetMap contributors</a>';

// 画像ファイルに頼らない自前のピン(デフォルトアイコンの画像パス問題を避ける)
const pinIcon = L.divIcon({
  className: "",
  html: `<div style="width:30px;height:30px;transform:translate(-15px,-30px)">
    <svg viewBox="0 0 24 24" width="30" height="30" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))">
      <path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" fill="#e69a35" stroke="#fff" stroke-width="1.5"/>
      <circle cx="12" cy="10" r="2.6" fill="#fff"/>
    </svg></div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

/** focusKey が変わったとき(検索結果を選んだとき)だけ、その位置へ地図を動かす */
function Recenter({ lat, lng, focusKey }: { lat: number; lng: number; focusKey: number }) {
  const map = useMap();
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (last.current === focusKey) return;
    last.current = focusKey;
    map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
  }, [lat, lng, focusKey, map]);
  return null;
}

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** 地図が表示された直後にサイズを測り直す(モーダル内で灰色になるのを防ぐ) */
function FixSize() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

export default function LocationPickerMap({
  lat,
  lng,
  fallbackCenter,
  focusKey,
  onPick,
}: {
  lat: number | null;
  lng: number | null;
  /** ピンがまだ無いときに地図を開く位置 */
  fallbackCenter: { lat: number; lng: number };
  focusKey: number;
  onPick: (lat: number, lng: number) => void;
}) {
  const hasPin = lat !== null && lng !== null;
  const center = hasPin ? { lat: lat as number, lng: lng as number } : fallbackCenter;

  // MapContainer の初期位置は最初の1回だけ使われる
  const initial = useMemo(() => center, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative isolate z-0 h-[210px] overflow-hidden rounded-xl border border-paper-line">
      <MapContainer
        center={[initial.lat, initial.lng]}
        zoom={hasPin ? 16 : 12}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        {MAPTILER_KEY ? (
          <TileLayer
            attribution={MAPTILER_ATTRIBUTION}
            url={`https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`}
            tileSize={512}
            zoomOffset={-1}
            minZoom={1}
            crossOrigin={true}
          />
        ) : (
          <TileLayer attribution={OSM_ATTRIBUTION} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        )}
        <FixSize />
        <ClickToPlace onPick={onPick} />
        {hasPin && (
          <>
            <Recenter lat={lat as number} lng={lng as number} focusKey={focusKey} />
            <Marker
              position={[lat as number, lng as number]}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend(e) {
                  const p = (e.target as L.Marker).getLatLng();
                  onPick(p.lat, p.lng);
                },
              }}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}

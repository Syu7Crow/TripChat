"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { searchNearbyPlaces, type DiscoveredPlace } from "@/lib/overpass";

type Spot = {
  id: string;
  title: string;
  lat: number;
  lng: number;
};

function numberedIcon(index: number) {
  return L.divIcon({
    className: "",
    html: `<div style="background:#4c9a90;color:#fff;width:28px;height:28px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)">${
      index + 1
    }</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const discoverIcon = L.divIcon({
  className: "",
  html: `<div style="background:#e69a35;color:#fff;width:22px;height:22px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)">?</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

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

function DiscoverControl({
  onResults,
  searching,
  setSearching,
}: {
  onResults: (places: DiscoveredPlace[]) => void;
  searching: boolean;
  setSearching: (v: boolean) => void;
}) {
  const map = useMap();

  async function handleClick() {
    setSearching(true);
    try {
      const b = map.getBounds();
      const places = await searchNearbyPlaces({
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      });
      onResults(places);
    } catch {
      onResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={searching}
      style={{ position: "absolute", top: 10, right: 10, zIndex: 1000 }}
      className="rounded-lg bg-ink px-3 py-2 text-xs font-medium text-paper shadow disabled:opacity-60"
    >
      {searching ? "探しています…" : "この範囲でスポットを探す"}
    </button>
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
    <div style={{ position: "relative" }}>
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom
        style={{ height: "420px", width: "100%", borderRadius: "1rem" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {spots.map((spot, index) => (
          <Marker key={spot.id} position={[spot.lat, spot.lng]} icon={numberedIcon(index)}>
            <Popup>{spot.title}</Popup>
          </Marker>
        ))}
        {spots.length > 1 && (
          <Polyline
            positions={spots.map((s) => [s.lat, s.lng] as [number, number])}
            pathOptions={{ color: "#4c9a90", dashArray: "6 6" }}
          />
        )}
        {discovered.map((place) => (
          <Marker key={place.id} position={[place.lat, place.lng]} icon={discoverIcon}>
            <Popup>
              <p className="font-medium">{place.name}</p>
              {onAddSpot && (
                <button
                  onClick={() => handleAdd(place)}
                  disabled={addedIds.has(place.id)}
                  className="mt-2 rounded-lg bg-amber px-3 py-1 text-xs font-medium text-ink disabled:opacity-50"
                >
                  {addedIds.has(place.id) ? "追加済み" : "この日の予定に追加"}
                </button>
              )}
            </Popup>
          </Marker>
        ))}
        <FitBounds spots={spots} />
        {onAddSpot && (
          <DiscoverControl onResults={setDiscovered} searching={searching} setSearching={setSearching} />
        )}
      </MapContainer>
    </div>
  );
}

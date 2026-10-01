"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

export default function MapView({ spots }: { spots: Spot[] }) {
  const center: [number, number] =
    spots.length > 0 ? [spots[0].lat, spots[0].lng] : [35.681236, 139.767125]; // 東京駅

  return (
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
      <FitBounds spots={spots} />
    </MapContainer>
  );
}

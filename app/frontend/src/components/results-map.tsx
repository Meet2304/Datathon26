import * as React from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet"

import type { Brief, Resolved, Result } from "@/lib/api"

function pin(html: string, size: number) {
  return L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}

const HOME = pin(
  `<div style="width:18px;height:18px;border-radius:9999px;background:#fff;border:2px solid #171717;box-shadow:0 0 0 4px rgba(23,23,23,.12)"></div>`,
  18
)

function numbered(n: number | string, active: boolean) {
  const bg = active ? "#171717" : "#404040"
  const ring = active ? "0 0 0 4px rgba(23,23,23,.18)" : "0 1px 2px rgba(0,0,0,.25)"
  return pin(
    `<div style="width:26px;height:26px;border-radius:9999px;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font:600 12px Geist Variable,system-ui;border:2px solid #fff;box-shadow:${ring}">${n}</div>`,
    26
  )
}

const DOT = pin(
  `<div style="width:9px;height:9px;border-radius:9999px;background:#a3a3a3;border:1.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15)"></div>`,
  9
)

function FitBounds({ points, zoomOne }: { points: [number, number][]; zoomOne: number }) {
  const map = useMap()
  const key = points.map((p) => p.join(",")).join("|")
  React.useEffect(() => {
    if (points.length === 1) map.setView(points[0], zoomOne)
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 13 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

export function ResultsMap({
  origin,
  results,
  others,
  radiusKm,
  highlighted,
  onSelect,
}: {
  origin: Resolved | null
  results: Result[]
  others: Brief[]
  radiusKm: number | null
  highlighted: string | null
  onSelect: (id: string) => void
}) {
  const points: [number, number][] = origin ? [[origin.lat, origin.lon], ...results.map((r) => [r.lat, r.lon] as [number, number])] : []
  return (
    <MapContainer
      center={origin ? [origin.lat, origin.lon] : [22.5, 79.5]}
      zoom={origin ? 11 : 4.5}
      zoomSnap={0.5}
      scrollWheelZoom={false}
      className="h-full min-h-[320px] w-full rounded-lg"
      attributionControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {origin && radiusKm != null && (
        <Circle
          center={[origin.lat, origin.lon]}
          radius={(radiusKm / 1.4) * 1000}
          pathOptions={{ color: "#737373", weight: 1, dashArray: "4 4", fillOpacity: 0.03 }}
        />
      )}
      {others.map((o) => (
        <Marker key={`o-${o.unique_id}`} position={[o.lat, o.lon]} icon={DOT}>
          <Tooltip direction="top" offset={[0, -4]}>
            <span className="text-xs">
              <b>{o.name}</b> · not recommended
            </span>
          </Tooltip>
        </Marker>
      ))}
      {results.map((r, i) => (
        <Marker
          key={r.unique_id}
          position={[r.lat, r.lon]}
          icon={numbered(r.rank ?? "•", highlighted === r.unique_id)}
          zIndexOffset={1000 - i}
          eventHandlers={{ click: () => onSelect(r.unique_id) }}
        >
          <Tooltip direction="top" offset={[0, -12]}>
            <span className="text-xs">
              <b>
                {r.rank}. {r.name}
              </b>
              <br />~{Math.round(r.distance_km)} km
            </span>
          </Tooltip>
        </Marker>
      ))}
      {origin && (
        <Marker position={[origin.lat, origin.lon]} icon={HOME} zIndexOffset={2000}>
          <Tooltip direction="top" offset={[0, -8]} permanent>
            <span className="text-xs font-medium">Patient</span>
          </Tooltip>
        </Marker>
      )}
      <FitBounds points={points.length ? points : [[22.5, 79.5]]} zoomOne={origin ? 11 : 4.5} />
    </MapContainer>
  )
}

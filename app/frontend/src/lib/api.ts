export type Quote = { field: string; quote: string }

export type Result = {
  rank: number | null
  unique_id: string
  name: string
  facility_type: string | null
  distance_km: number
  distance_uncertainty_km: number
  evidence_label: string
  confidence: "High" | "Medium" | "Low"
  rank_score: number | null
  E: number | null
  D: number | null
  A: number | null
  why: Quote[]
  caveats: string[]
  not_reported: string[]
  contact: { official_phone: string | null; references: string[] }
  lat: number
  lon: number
  record_checks: string[]
  place: string
}

export type Brief = {
  unique_id: string
  name: string
  distance_km: number
  evidence_label: string
  reason: string
  kind: string
  rank_score: number | null
  quote: Quote | null
  lat: number
  lon: number
}

export type NotRecommended = {
  radius_km: number
  groups: { kind: string; title: string; count: number; items: Brief[] }[]
  no_mention_count: number
  considered_count: number
}

export type Resolved = { lat: number; lon: number; method: string; label: string }

export type SearchResponse = {
  query: {
    service: string
    service_name?: string
    location_input: string
    resolved_location: Resolved | null
    radius_km_used: number | null
  }
  how_ranked: string | null
  results: Result[]
  extra_rows: {
    stronger_evidence?: { message: string; result: Result }
    unconfirmed_options?: { message: string; results: Result[] }
  } | null
  fallback: string | null
  not_recommended: NotRecommended | null
  clarification?: { message: string; options: { label: string; state: string; kind: string }[] }
  error?: string
  specialty_mode?: boolean
  elapsed_ms?: number
}

export type Service = {
  id: string
  name: string
  hint: string
  time_critical: boolean
  gate_min_label: string
  weights: { evidence: number; capability: number; closeness: number }
  half_distance_km: number
  max_radius_km: number
  how_ranked: string
}

export type Meta = {
  services: Service[]
  specialties: { code: string; name: string; facilities: number }[]
  n_facilities: number
  loaded_at: string
}

export type Coverage = {
  n_facilities: number
  services: {
    service: string
    name: string
    strong: number
    moderate: number
    weak: number
    possible: number
    not_offered: number
    recommendable: number
  }[]
}

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const qs = params ? "?" + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])) : ""
  const res = await fetch(`api/${path}${qs}`)
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.detail) msg = String(body.detail)
    } catch {
      /* not JSON */
    }
    throw new Error(msg)
  }
  return (await res.json()) as T
}

export const api = {
  health: () => get<{ ready: boolean; error: string | null; n_facilities: number | null }>("health"),
  meta: () => get<Meta>("meta"),
  coverage: () => get<Coverage>("coverage"),
  search: (service: string, location: string, k: number) => get<SearchResponse>("search", { service, location, k }),
}

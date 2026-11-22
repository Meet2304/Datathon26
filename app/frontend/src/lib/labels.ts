// Plain-language wording for the method's labels. One place, so every screen says the same thing.

export const EVIDENCE: Record<string, { text: string; tone: string; dot: string; explain: string }> = {
  Strong: {
    text: "Strong evidence",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-600",
    explain: "The facility's own record clearly says it provides this, and the supporting equipment or emergency cover is listed too.",
  },
  Moderate: {
    text: "Some evidence",
    tone: "border-sky-200 bg-sky-50 text-sky-800",
    dot: "bg-sky-600",
    explain: "The record says it provides this, but some supporting details (equipment, emergency cover) are missing.",
  },
  Weak: {
    text: "Weak evidence",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    explain: "The service is mentioned only in passing or in general wording.",
  },
  Possible: {
    text: "Unconfirmed",
    tone: "border-zinc-200 bg-zinc-50 text-zinc-700",
    dot: "bg-zinc-400",
    explain: "The record lists a related specialty or equipment but never says it provides this service. Call first.",
  },
  "Listed specialty": {
    text: "Listed specialty",
    tone: "border-zinc-200 bg-zinc-50 text-zinc-700",
    dot: "bg-zinc-400",
    explain: "The facility lists this specialty. That's all the record tells us; call to confirm what it offers.",
  },
  "Not offered": {
    text: "Says not offered",
    tone: "border-red-200 bg-red-50 text-red-800",
    dot: "bg-red-500",
    explain: "The facility's own record says it does not offer this.",
  },
  "No evidence": {
    text: "No mention",
    tone: "border-zinc-200 bg-zinc-50 text-zinc-600",
    dot: "bg-zinc-300",
    explain: "The record never mentions this service.",
  },
}

export const CONFIDENCE: Record<string, { text: string; explain: string; bars: number }> = {
  High: { text: "High confidence", bars: 3, explain: "Strong evidence and a detailed, consistent record." },
  Medium: { text: "Medium confidence", bars: 2, explain: "Good evidence, but the record is missing some details." },
  Low: {
    text: "Low confidence",
    bars: 1,
    explain: "The record is thin, approximate, or has data-quality warnings. Call to confirm before travelling.",
  },
}

export const FIELD: Record<string, string> = {
  procedure: "its procedures list",
  equipment: "its equipment list",
  capability: "its capabilities",
  description: "its description",
  specialties: "its specialties",
}

export function km(d: number) {
  return d < 10 ? d.toFixed(1) : Math.round(d).toString()
}

export function prettyField(f: string) {
  return FIELD[f] ?? f
}

/** Re-word the pipeline's technical warnings in everyday language. Unknown warnings pass through unchanged. */
const PLAIN: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  [/^Some lists in this record were cut off.*/i, "Part of this facility's record was cut short, so some details may be missing."],
  [/^Location is approximate.*about (\d+) km/i, (m) => `We only know the area this place is in, not its exact address, so the distance could be off by about ${m[1]} km.`],
  [/^Emergency readiness not confirmed/i, "Its record doesn't say it handles emergencies around the clock. Please check when you call."],
  [/^The claim appears only in the description or capability text/i, "It mentions this care only in its general description, not in its list of services."],
  [/^The record also lists clinic hours.*/i, "Its record lists clinic opening hours, so check that it can take emergencies at any time."],
  [/^Limited information.*/i, "There isn't much information about this place. Please call to confirm before travelling."],
]

export function plainCaveat(c: string) {
  for (const [rx, out] of PLAIN) {
    const m = c.match(rx)
    if (m) return typeof out === "string" ? out : out(m)
  }
  return /[.!?]$/.test(c) ? c : `${c}.`
}

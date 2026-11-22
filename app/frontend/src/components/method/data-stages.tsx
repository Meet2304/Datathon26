// Stages 01–03 of "How it works": clean the records, place them on the map, read the text.
import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowDownIcon, ArrowRightIcon, CheckIcon, CircleSlashIcon, MinusIcon, XIcon } from "lucide-react"
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, XAxis, YAxis } from "recharts"

import { cn } from "@/lib/utils"
import type { Meta } from "@/lib/api"
import { CITY, CLAIMS, CLEANING, DATA, FEATURES, LOCATION } from "@/lib/method-facts"
import { serviceIcon } from "@/lib/services"
import { C, Chips, CountUp, fmt, GrowBar, Legend, LiveBar, Panel, PanelTitle, pct, Reveal, Section, Stat } from "./kit"

/* ================================================================== 01 · CLEAN */

const LAYERS = [
  { tone: "#b08d57", name: "Raw records", tag: "bronze", n: DATA.bronzeRows, unit: "rows", body: "Facility pages as scraped from the web, one row per page." },
  {
    tone: "#a1a1aa",
    name: "Team-cleaned",
    tag: "silver",
    n: DATA.facilities,
    unit: "facilities",
    body: `${DATA.silverColumns} columns. Lists parsed, duplicates merged, specialties mapped to standard codes, doubtful values flagged.`,
  },
  { tone: "#2a78d6", name: "Our clean view", tag: "silver", n: DATA.facilities, unit: "facilities", body: "Doubtful values marked as missing, city names fixed, each location graded." },
  { tone: "#d4a017", name: "Scores", tag: "gold", n: DATA.cells, unit: "facility × care pairs", body: "Every facility scored for each of the 9 kinds of care, with its quotes." },
]

function LayerFlow() {
  const reduce = useReducedMotion()
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-stretch">
      {LAYERS.map((l, i) => (
        <React.Fragment key={l.name}>
          <Reveal delay={i * 0.1} className="relative flex flex-col gap-2 overflow-hidden rounded-2xl border bg-card p-4 shadow-xs">
            <span className="absolute inset-x-0 top-0 h-1" style={{ background: l.tone }} />
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{l.name}</span>
              <span className="rounded-full border px-2 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">{l.tag}</span>
            </div>
            <div className="text-2xl font-semibold tracking-tight tabular-nums">
              <CountUp to={l.n} />
            </div>
            <div className="-mt-1 text-xs text-muted-foreground">{l.unit}</div>
            <p className="text-sm text-muted-foreground">{l.body}</p>
          </Reveal>
          {i < LAYERS.length - 1 && (
            <div className="flex items-center justify-center text-muted-foreground" aria-hidden>
              <motion.span
                animate={reduce ? undefined : { x: [0, 4, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}
                className="rotate-90 md:rotate-0"
              >
                <ArrowRightIcon className="size-4" />
              </motion.span>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

function CutList() {
  // 50 small squares; the last few fade out to show the list was cut, not finished.
  return (
    <div className="flex flex-wrap gap-[3px]" aria-hidden>
      {Array.from({ length: 50 }).map((_, i) => (
        <motion.span
          key={i}
          className="size-2 rounded-[2px]"
          style={{ background: C.blue, opacity: i < 42 ? 0.8 : 0.8 - (i - 41) * 0.09 }}
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.012 }}
        />
      ))}
      <span className="ml-1 text-[10px] leading-2 text-muted-foreground">50 · cut</span>
    </div>
  )
}

function FarPin() {
  const reduce = useReducedMotion()
  return (
    <svg viewBox="0 0 120 44" className="h-11 w-28" aria-hidden>
      <circle cx={84} cy={22} r={18} fill={C.blue} fillOpacity={0.12} stroke={C.blue} strokeOpacity={0.4} strokeDasharray="3 3" />
      <circle cx={84} cy={22} r={2} fill={C.blue} />
      <motion.circle
        r={4}
        fill={C.orange}
        initial={{ cx: 12, cy: 30 }}
        whileInView={reduce ? { cx: 84, cy: 22 } : { cx: [12, 12, 84], cy: [30, 30, 22] }}
        viewport={{ once: true }}
        transition={{ duration: 1.6, times: [0, 0.4, 1], ease: "easeInOut" }}
      />
    </svg>
  )
}

function MissingRules() {
  const rules = [
    {
      title: "Empty stays empty",
      visual: (
        <div className="flex items-center gap-2 text-sm">
          <code className="rounded-md border bg-muted/60 px-2 py-0.5 font-mono">[ ]</code>
          <ArrowRightIcon className="size-3.5 text-muted-foreground" />
          <span className="rounded-md border border-dashed px-2 py-0.5 text-muted-foreground">not reported</span>
        </div>
      ),
      body: "An empty field is shown as “not reported”. It lowers our confidence, but it never pushes a place down the list.",
    },
    {
      title: "A cut-off list is unknown, not absent",
      visual: <CutList />,
      body: `${fmt(CLEANING.truncated)} records (${pct(CLEANING.truncated, DATA.facilities)}) have a list that stops at exactly 50 items, so the scraper probably cut it off. A detail we can't find there counts as unknown (half credit), not as missing.`,
    },
    {
      title: "Far-off coordinates fall back to the PIN area",
      visual: <FarPin />,
      body: `${fmt(CLEANING.coordsFar)} facilities have coordinates more than 50 km from their own PIN code. We use the centre of the PIN area instead and call the location approximate.`,
    },
    {
      title: "Impossible numbers become unknown",
      visual: (
        <div className="flex items-center gap-2 text-sm">
          <code className="rounded-md border bg-muted/60 px-2 py-0.5 font-mono line-through decoration-red-500">doctors: 9,000</code>
          <ArrowRightIcon className="size-3.5 text-muted-foreground" />
          <span className="rounded-md border border-dashed px-2 py-0.5 text-muted-foreground">unknown</span>
        </div>
      ),
      body: `${fmt(CLEANING.doctorsImplausible)} doctor counts that the team's checks flag as implausible are treated as unknown. We never replace a value with a guess.`,
    },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {rules.map((r, i) => (
        <Reveal key={r.title} delay={i * 0.07} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs">
          <div className="flex h-12 items-center">{r.visual}</div>
          <div className="font-medium">{r.title}</div>
          <p className="text-sm text-muted-foreground">{r.body}</p>
        </Reveal>
      ))}
    </div>
  )
}

function CityCleaner() {
  const reduce = useReducedMotion()
  const examples = [
    ...CITY.fixes.map((f) => ({ from: f.example[0], to: f.example[1], rule: f.rule, bad: false })),
    { from: CITY.junkExample[0], to: "missing", rule: "Not a place name", bad: true },
  ]
  const [i, setI] = React.useState(0)
  React.useEffect(() => {
    if (reduce) return
    const t = setInterval(() => setI((x) => (x + 1) % examples.length), 2200)
    return () => clearInterval(t)
  }, [reduce, examples.length])
  const ex = examples[i]
  const bars = [...CITY.fixes.map((f) => ({ label: f.rule, n: f.n, color: C.blue })), { label: "Not a place name → missing", n: CITY.junk, color: C.greyDark }, { label: "Wrong state for that city → not used to place it", n: CITY.strays, color: C.orange }]
  const max = Math.max(...bars.map((b) => b.n))
  return (
    <Panel>
      <PanelTitle
        title="City names, made consistent"
        sub="The raw city field mixes old names, neighbourhoods and typos. We built a second clean table so that a typed city finds every facility in it."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-4">
          <div className="flex gap-6">
            <Stat value={CITY.rawSpellings} label="raw spellings" />
            <Stat value={CITY.cities} label="clean cities" />
            <Stat value={CITY.fixes.reduce((a, f) => a + f.n, 0)} label="records fixed" />
          </div>
          <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-xl border bg-muted/40 px-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={ex.from}
                className="flex flex-col items-center gap-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                  <span className="rounded-md border bg-background px-2 py-1 font-mono text-muted-foreground line-through decoration-muted-foreground/60">
                    {ex.from}
                  </span>
                  <ArrowRightIcon className="size-4 text-muted-foreground" />
                  <span className={cn("rounded-md px-2 py-1 font-mono", ex.bad ? "border border-dashed text-muted-foreground" : "bg-primary text-primary-foreground")}>
                    {ex.to}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{ex.rule}</span>
              </motion.div>
            </AnimatePresence>
          </div>
          <p className="text-sm text-muted-foreground">
            The rules run in a fixed order, and every rule that fires is recorded on the row. Typed names go through the same
            letters-only comparison, so “Dehra Dun”, “dehradun” and “DEHRADUN” all match.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {bars.map((b, j) => (
            <div key={b.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_3rem] items-center gap-3">
              <span className="truncate text-sm text-muted-foreground" title={b.label}>
                {b.label}
              </span>
              <div className="h-4">
                <GrowBar value={b.n} max={max} color={b.color} delay={j * 0.05} />
              </div>
              <span className="text-right text-sm font-medium tabular-nums">{fmt(b.n)}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}

export function CleanStage() {
  return (
    <Section
      id="clean"
      n="01"
      eyebrow="Clean"
      title="We never fix a value by guessing"
      lede="The records were scraped from facility websites, so some values are empty, cut off or plainly wrong. Every value is either kept exactly as written or marked as missing. Missing information lowers how sure we are, but it never lowers a facility's place in the list, so small rural clinics with thin records are not pushed aside."
      tables={["bronze_facilities", "silver_facilities", "silver_facility_clean", "silver_facilities_v2", "ref_city_alias"]}
    >
      <LayerFlow />
      <MissingRules />
      <Reveal>
        <CityCleaner />
      </Reveal>
    </Section>
  )
}

/* ================================================================== 02 · LOCATE */

function FacilityLocations() {
  const total = LOCATION.exact + LOCATION.approximate + LOCATION.unknown
  const parts = [
    { label: "Exact coordinates", n: LOCATION.exact, color: C.blue, body: "Distance is measured from the facility's own point." },
    {
      label: "PIN area only",
      n: LOCATION.approximate,
      color: C.blueLight,
      body: `We use the centre of its PIN area and add that area's size (typically ${LOCATION.medianPinRadiusKm} km) to the distance before scoring closeness.`,
    },
    { label: "Unknown", n: LOCATION.unknown, color: C.grey, body: "Can't be placed on a map, so it is left out of distance searches." },
  ]
  return (
    <Panel>
      <PanelTitle title="Where each facility is" sub="Every facility gets one location and a grade for how precise it is." />
      <div className="flex h-9 w-full gap-[3px] overflow-hidden rounded-lg">
        {parts.map((p, i) => (
          <GrowBar key={p.label} value={p.n} max={total} color={p.color} delay={i * 0.15} className="rounded-none" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {parts.map((p) => (
          <div key={p.label} className="flex flex-col gap-1">
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className="size-2.5 rounded-[3px]" style={{ background: p.color }} />
              {p.label}
              <span className="ml-auto tabular-nums">
                {fmt(p.n)} <span className="font-normal text-muted-foreground">({pct(p.n, total)})</span>
              </span>
            </span>
            <p className="text-sm text-muted-foreground">{p.body}</p>
          </div>
        ))}
      </div>
    </Panel>
  )
}

type Resolve = { id: string; input: string; steps: string[]; outcome: { ask: boolean; text: string } }
const RESOLVE: Resolve[] = [
  {
    id: "pin",
    input: "492001",
    steps: ["Six digits, so we read it as a PIN code", "Found in the PIN directory (wrong PIN points removed, see right)", "Centre of the PIN area: Raipur, Chhattisgarh"],
    outcome: { ask: false, text: "Search from the PIN area centre" },
  },
  {
    id: "latlon",
    input: "26.85, 80.95",
    steps: ["Two numbers, so we read them as latitude and longitude", "Used exactly as given (central Lucknow)"],
    outcome: { ask: false, text: "Search from that exact point" },
  },
  {
    id: "alias",
    input: "Bangalore",
    steps: ["Letters, so we read it as a place name", "Old name found in the alias table: Bengaluru", "A city in one state, Karnataka", "Centre = the median of its facilities' exact locations"],
    outcome: { ask: false, text: "Search from the city centre" },
  },
  {
    id: "city",
    input: "Patna",
    steps: ["A place name", "A city in one state, Bihar, with 129 listed facilities", "Centre = the median of those facilities' locations"],
    outcome: { ask: false, text: "Search from the city centre" },
  },
  {
    id: "district",
    input: "Barmer",
    steps: ["A place name", "Not a city with enough facilities, but a district of Rajasthan", "Centre = the median of its 28 PIN areas"],
    outcome: { ask: false, text: "Search from the district centre" },
  },
  {
    id: "ambiguous",
    input: "Aurangabad",
    steps: ["A place name", "Found in two states: Bihar and Maharashtra"],
    outcome: { ask: true, text: "We ask which one you mean, instead of guessing" },
  },
  {
    id: "typo",
    input: "Bengalru",
    steps: ["A place name", "No exact match in any city, district or alias"],
    outcome: { ask: true, text: "We suggest the closest spellings, such as Bengaluru" },
  },
]

function Resolver() {
  const [id, setId] = React.useState("pin")
  const r = RESOLVE.find((x) => x.id === id)!
  return (
    <Panel>
      <PanelTitle title="Where the patient is" sub="Pick an example input to see how we turn it into a point on the map." />
      <Chips options={RESOLVE.map((x) => ({ id: x.id, label: x.input }))} value={id} onChange={setId} />
      <ol className="flex flex-col">
        <AnimatePresence mode="popLayout">
          {[...r.steps, r.outcome.text].map((s, i, all) => {
            const last = i === all.length - 1
            return (
              <motion.li
                key={`${id}-${i}`}
                className="relative flex gap-3 pb-4 last:pb-0"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: i * 0.18, duration: 0.25 }}
              >
                {!last && <span className="absolute top-6 bottom-0 left-[11px] w-px bg-border" aria-hidden />}
                <span
                  className={cn(
                    "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                    last ? (r.outcome.ask ? "border-amber-300 bg-amber-50 text-amber-800" : "border-primary bg-primary text-primary-foreground") : "bg-background"
                  )}
                >
                  {last ? r.outcome.ask ? "?" : <CheckIcon className="size-3" /> : i + 1}
                </span>
                <span className={cn("pt-0.5 text-sm", last && "font-medium")}>{s}</span>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ol>
      <p className="mt-auto border-t pt-4 text-sm text-muted-foreground">
        A city only counts as being in a state if that state holds at least 2 of its facilities and at least 5% of them. That stops
        one mislabelled record from making a whole city look ambiguous.
      </p>
    </Panel>
  )
}

function PinGuard() {
  const reduce = useReducedMotion()
  const M = { x: 262, y: 66 }
  const cluster = [
    [-14, -8], [10, -14], [18, 6], [-6, 14], [4, 2], [-20, 8], [12, 18], [-10, -18], [24, -4], [0, -24],
  ]
  const far = [[58, 168], [68, 176], [52, 180], [64, 186]]
  return (
    <Panel>
      <PanelTitle title="Catching wrong PIN points" sub="We found PIN codes placed in the wrong state, and route around them." />
      <svg viewBox="0 0 340 210" className="w-full" role="img" aria-label="PIN points far from their group's centre are flagged as wrong">
        <motion.circle
          cx={M.x}
          cy={M.y}
          r={63}
          fill={C.blue}
          fillOpacity={0.06}
          stroke={C.blue}
          strokeOpacity={0.5}
          strokeDasharray="4 4"
          initial={reduce ? false : { scale: 0.2, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          style={{ transformOrigin: `${M.x}px ${M.y}px` }}
        />
        <text x={M.x} y={M.y + 78} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          300 km
        </text>
        {cluster.map(([dx, dy], i) => (
          <motion.circle
            key={i}
            cx={M.x + dx}
            cy={M.y + dy}
            r={3}
            fill={C.blue}
            initial={reduce ? false : { opacity: 0 }}
            whileInView={{ opacity: 0.85 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.04 }}
          />
        ))}
        <path d={`M ${M.x - 6} ${M.y - 6} l 12 12 m 0 -12 l -12 12`} stroke="#171717" strokeWidth={1.5} />
        <motion.line
          x1={M.x}
          y1={M.y}
          x2={70}
          y2={170}
          stroke={C.red}
          strokeWidth={1.2}
          strokeDasharray="3 4"
          initial={reduce ? false : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.9, duration: 0.8 }}
        />
        <text x={150} y={128} className="fill-red-600 text-[10px]" transform="rotate(-27 150 128)">
          ≈ 1,000 km
        </text>
        {far.map(([x, y], i) => (
          <motion.circle
            key={i}
            cx={x}
            cy={y}
            r={3.5}
            initial={reduce ? false : { fill: C.blue }}
            whileInView={{ fill: C.red }}
            viewport={{ once: true }}
            transition={{ delay: 1.5 + i * 0.08 }}
          />
        ))}
        <text x={M.x + 30} y={M.y - 36} className="fill-foreground text-[10px] font-medium">
          PIN codes 824… (Bihar)
        </text>
        <text x={44} y={202} className="fill-red-600 text-[10px] font-medium">
          Aurangabad, Bihar PINs placed in Maharashtra
        </text>
      </svg>
      <p className="text-sm text-muted-foreground">
        In the PIN directory, 19 of the 25 points for Aurangabad, Bihar sit in Aurangabad, Maharashtra, about 1,000 km away, so a
        Bihar search returned Maharashtra hospitals. Any PIN point more than 300 km from the median of its 3-digit group is now
        treated as wrong: {fmt(DATA.pinOutliers)} of {fmt(DATA.pinPoints)} points. The team's table itself is left untouched.
      </p>
    </Panel>
  )
}

function AccessCurve({ meta }: { meta: Meta | null }) {
  const [svc, setSvc] = React.useState("dialysis")
  const services = meta?.services ?? []
  const s = services.find((x) => x.id === svc)
  const half = s?.half_distance_km ?? 15
  const max = s?.max_radius_km ?? 150
  const data = React.useMemo(() => {
    const rows = []
    for (let km = 0; km <= 200; km += 2) rows.push({ km, A: 100 * Math.pow(0.5, km / half) })
    return rows
  }, [half])
  const steps = [...[25, 50, 100, 250].filter((x) => x < max), max]
  return (
    <Panel>
      <PanelTitle
        title="From distance to a closeness score"
        sub="Closeness starts at 100 next door and halves every “half distance”. Urgent care halves quickly; planned care slowly, because a longer trip is worth it."
      />
      <Chips options={services.map((x) => ({ id: x.id, label: x.name, icon: serviceIcon(x.id) }))} value={svc} onChange={setSvc} />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
              <CartesianGrid stroke="#e5e5e5" vertical={false} />
              <XAxis dataKey="km" type="number" domain={[0, 200]} ticks={[0, 25, 50, 100, 150, 200]} tick={{ fontSize: 11, fill: "#737373" }} tickLine={false} axisLine={{ stroke: "#e5e5e5" }} unit=" km" />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fill: "#737373" }} tickLine={false} axisLine={false} />
              <Line type="monotone" dataKey="A" stroke={C.orange} strokeWidth={2.5} dot={false} isAnimationActive animationDuration={600} />
              <ReferenceDot x={half} y={50} r={5} fill={C.orange} stroke="#fff" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-muted/50 p-4 font-mono text-sm">
            closeness = 100 × ½<sup>(km ÷ {half})</sup>
            <div className="mt-1 text-xs text-muted-foreground">road km ≈ 1.4 × straight-line km</div>
          </div>
          <p className="text-sm">
            For {s?.name.toLowerCase() ?? "this care"}, a place {half} km away scores 50 for closeness, and one {half * 2} km away
            scores 25.
          </p>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">Search radius, widened only when needed</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {steps.map((r, i) => (
                <React.Fragment key={`${svc}-${r}`}>
                  <motion.span
                    className="rounded-md border bg-background px-2 py-1 text-sm tabular-nums"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.12 }}
                  >
                    {r} km
                  </motion.span>
                  {i < steps.length - 1 && <ArrowRightIcon className="size-3 text-muted-foreground" />}
                </React.Fragment>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">We stop at the first radius that holds enough places that pass the bar.</p>
          </div>
        </div>
      </div>
    </Panel>
  )
}

export function LocateStage({ meta }: { meta: Meta | null }) {
  return (
    <Section
      id="locate"
      n="02"
      eyebrow="Locate"
      title="Distance is measured honestly, uncertainty included"
      lede="We place every facility and the patient on the map, grade how precise each point is, and turn distance into a closeness score. When we only know a facility's PIN area, we add that area's size to the distance, so an uncertain location never looks closer than it might be."
      tables={["silver_facility_location", "silver_pincode_directory", "bronze_pincode_directory"]}
    >
      <Reveal>
        <FacilityLocations />
      </Reveal>
      <div className="grid gap-4 lg:grid-cols-2">
        <Reveal>
          <Resolver />
        </Reveal>
        <Reveal delay={0.1}>
          <PinGuard />
        </Reveal>
      </div>
      <Reveal>
        <AccessCurve meta={meta} />
      </Reveal>
    </Section>
  )
}

/* ================================================================== 03 · READ */

type Tag = { t: string; s: "yes" | "no" | "neg"; why?: string }
const READS: { text: string; tags: Tag[] }[] = [
  { text: "Dialysis treatment is provided using 25 dialysis machines.", tags: [{ t: "Dialysis claim", s: "yes" }, { t: "Dialysis machines · 25", s: "yes" }] },
  { text: "24-hour dialysis services with 10 units", tags: [{ t: "Dialysis claim", s: "yes" }, { t: "Dialysis machines · 10", s: "yes" }] },
  { text: "Performs cardiac bypass surgery in the Cardiac Cath Lab", tags: [{ t: "Heart surgery claim", s: "yes" }] },
  { text: "Laparoscopic gastric bypass surgery", tags: [{ t: "Heart surgery", s: "no", why: "“gastric” rules it out" }] },
  { text: "Offers 24/7 emergency care", tags: [{ t: "24/7 emergency", s: "yes" }] },
  { text: "24x7 Pharmacy", tags: [{ t: "24/7 emergency", s: "no", why: "an open pharmacy isn't emergency cover" }] },
  { text: "Intensive Critical Care Unit (ICCU)", tags: [{ t: "Intensive care", s: "yes" }, { t: "Coronary care", s: "no", why: "spelled out as general intensive care" }] },
  { text: "Non-NABH accreditation", tags: [{ t: "Accreditation", s: "neg", why: "“non-” cancels it" }] },
  { text: "Dialysis not available", tags: [{ t: "Dialysis", s: "neg", why: "says it is not offered" }] },
]

function TagChip({ tag, delay }: { tag: Tag; delay: number }) {
  const style =
    tag.s === "yes"
      ? "border-[#2a78d6]/30 bg-[#2a78d6]/10 text-[#1c5aa6]"
      : tag.s === "neg"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-zinc-200 bg-zinc-50 text-zinc-500"
  const icon = tag.s === "yes" ? <CheckIcon /> : tag.s === "neg" ? <CircleSlashIcon /> : <XIcon />
  return (
    <motion.span
      className="flex flex-col items-start gap-0.5"
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ delay }}
    >
      <span className={cn("flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium [&>svg]:size-3", style, tag.s === "no" && "line-through")}>
        {icon}
        {tag.t}
      </span>
      {tag.why && <span className="pl-1 text-[11px] text-muted-foreground">{tag.why}</span>}
    </motion.span>
  )
}

function ClauseSplit() {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-muted/40 p-4">
      <span className="text-xs font-medium text-muted-foreground uppercase">One list item</span>
      <code className="w-fit rounded-md border bg-background px-2 py-1 font-mono text-sm">ICU, NICU and dialysis available; MRI outsourced</code>
      <ArrowDownIcon className="size-4 text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground uppercase">Two clauses, each read on its own</span>
      <div className="flex flex-wrap gap-2">
        <motion.code
          className="rounded-md border border-[#2a78d6]/30 bg-[#2a78d6]/10 px-2 py-1 font-mono text-sm text-[#1c5aa6]"
          initial={{ opacity: 0, x: 10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          ICU, NICU and dialysis available
        </motion.code>
        <motion.code
          className="rounded-md border border-red-200 bg-red-50 px-2 py-1 font-mono text-sm text-red-700"
          initial={{ opacity: 0, x: 10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
        >
          MRI outsourced <span className="font-sans text-xs">· negated</span>
        </motion.code>
      </div>
      <p className="text-sm text-muted-foreground">
        Words like “not available”, “outsourced”, “referred to”, “upcoming” or “under construction” cancel only the clause they sit in,
        never the whole record.
      </p>
    </div>
  )
}

function ClauseReader() {
  return (
    <Panel>
      <PanelTitle
        title="Reading the text, one clause at a time"
        sub="Each list item and description is split into clauses. Every clause is matched against a dictionary of patterns for each kind of care and each supporting detail."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div className="flex flex-col gap-4">
          <div className="flex gap-6">
            <Stat value={CLAIMS.total} label="clauses read" />
            <Stat value={CLAIMS.negated} label="negated clauses" />
          </div>
          <div className="flex flex-col gap-1.5">
            {CLAIMS.byField.map((f, i) => (
              <div key={f.field} className="grid grid-cols-[6.5rem_1fr_4.5rem] items-center gap-2 text-sm">
                <span className="text-muted-foreground">{f.field}</span>
                <div className="h-3">
                  <GrowBar value={f.n} max={CLAIMS.byField[0].n} color={C.blue} delay={i * 0.06} />
                </div>
                <span className="text-right tabular-nums">{fmt(f.n)}</span>
              </div>
            ))}
          </div>
          <ClauseSplit />
        </div>
        <div className="flex flex-col">
          <span className="mb-2 text-xs font-medium text-muted-foreground uppercase">What the patterns find</span>
          <ul className="flex flex-col divide-y">
            {READS.map((r, i) => (
              <li key={r.text} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <span className="text-sm">“{r.text}”</span>
                <span className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
                  {r.tags.map((t, j) => (
                    <TagChip key={t.t} tag={t} delay={0.1 + i * 0.05 + j * 0.05} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
            These sentences are part of 12 regression tests taken from real records. The build stops if any of them fails. All 12 pass.
          </p>
        </div>
      </div>
    </Panel>
  )
}

function FeatureBars() {
  const groups = [
    { kind: "general" as const, title: "General details (G1–G14)", sub: "Used for every kind of care" },
    { kind: "care" as const, title: "Care-specific details (S1–S12)", sub: "Equipment and units that one kind of care needs" },
  ]
  return (
    <Panel>
      <PanelTitle
        title="From text to features"
        sub={`Each facility gets one value per feature: found (with its quote), not mentioned, or unknown because its list was cut off. Bars are out of all ${fmt(DATA.facilities)} facilities.`}
      />
      <Legend
        items={[
          { label: "Found in the record", color: C.blue },
          { label: "Unknown (list cut off)", color: C.grey },
        ]}
      />
      <div className="grid gap-8 lg:grid-cols-2">
        {groups.map((g) => (
          <div key={g.kind} className="flex flex-col gap-2">
            <div>
              <div className="text-sm font-medium">{g.title}</div>
              <div className="text-xs text-muted-foreground">{g.sub}</div>
            </div>
            {FEATURES.filter((f) => f.kind === g.kind).map((f, i) => (
              <div key={f.code} className="grid grid-cols-[minmax(0,11rem)_1fr_3.5rem] items-center gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <code className="w-7 shrink-0 font-mono text-[10px] text-muted-foreground">{f.code}</code>
                  <span className="truncate" title={f.name}>
                    {f.name}
                  </span>
                </span>
                <div className="flex h-3 gap-px">
                  <GrowBar value={f.found} max={DATA.facilities} color={C.blue} delay={i * 0.03} className="rounded-r-none" />
                  {f.cut > 0 && <GrowBar value={f.cut} max={DATA.facilities} color={C.grey} delay={0.2 + i * 0.03} className="rounded-l-none" />}
                </div>
                <span className="text-right tabular-nums">{fmt(f.found)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="grid gap-3 border-t pt-4 text-sm text-muted-foreground sm:grid-cols-3">
        <p>
          <b className="font-medium text-foreground">Numbers must be plausible.</b> ICU beds count only between 1 and 200, an MRI only
          between 0.2 and 7 tesla.
        </p>
        <p>
          <b className="font-medium text-foreground">Context matters.</b> Newborn equipment counts only next to a newborn word, and
          equipment phrases aren't counted twice as service claims.
        </p>
        <p>
          <b className="font-medium text-foreground">Specialty tags are hints.</b> A tag like “nephrology” says a department exists, not
          that dialysis is offered, so it counts as weak support only.
        </p>
      </div>
    </Panel>
  )
}

export function ReadStage() {
  return (
    <Section
      id="read"
      n="03"
      eyebrow="Read"
      title="Every claim comes from the facility's own words"
      lede="We use fixed, testable text patterns rather than an AI model to read the records. The same record always gives the same answer, every quote is copied word for word, and the whole country is read in under three minutes. We checked this choice against an AI reader on a pilot city first, then fixed each pattern it missed."
      tables={["silver_claims", "ref_feature_terms", "silver_feature_hits", "gold_facility_features", "ref_regression_fixtures"]}
    >
      <Reveal>
        <ClauseReader />
      </Reveal>
      <Reveal>
        <FeatureBars />
      </Reveal>
    </Section>
  )
}

export { MinusIcon }

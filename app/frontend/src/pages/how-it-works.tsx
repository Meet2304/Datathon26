import * as React from "react"
import { animate, motion, useInView, useReducedMotion } from "motion/react"
import {
  CheckIcon,
  CircleHelpIcon,
  FileSearchIcon,
  ListChecksIcon,
  MapPinIcon,
  MessageSquareQuoteIcon,
  PhoneCallIcon,
  SearchIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { api, type Coverage, type Meta } from "@/lib/api"
import { ConfidenceBadge, EvidenceBadge } from "@/components/result-card"
import { GROUP } from "@/components/not-recommended"
import { CONFIDENCE } from "@/lib/labels"
import { FACTORS, PRIORITY, serviceIcon } from "@/lib/services"

/* ------------------------------------------------------------------ small motion helpers */

function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  )
}

function CountUp({ to, suffix = "", decimals = 0 }: { to: number; suffix?: string; decimals?: number }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  React.useEffect(() => {
    if (!inView || !ref.current) return
    const el = ref.current
    if (reduce) {
      el.textContent = to.toLocaleString(undefined, { maximumFractionDigits: decimals }) + suffix
      return
    }
    const c = animate(0, to, {
      duration: 1.1,
      ease: "easeOut",
      onUpdate: (v) => (el.textContent = v.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) + suffix),
    })
    return () => c.stop()
  }, [inView, to, suffix, decimals, reduce])
  return <span ref={ref}>0{suffix}</span>
}

function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</span>
      <h3 className="text-2xl font-semibold tracking-tight">{title}</h3>
      {children && <p className="text-muted-foreground">{children}</p>}
    </div>
  )
}

function ServiceChips({ meta, value, onChange }: { meta: Meta | null; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(meta?.services ?? []).map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors [&>svg]:size-3.5",
            value === s.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
          )}
        >
          {serviceIcon(s.id)}
          {s.name}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ 1. the journey */

function Journey() {
  const reduce = useReducedMotion()
  const steps = [
    { icon: <SearchIcon />, title: "You tell us two things", body: "The care the patient needs, and where the patient is." },
    { icon: <FileSearchIcon />, title: "We read every record", body: "We check what each facility says about itself, word by word." },
    { icon: <ListChecksIcon />, title: "You get a short list", body: "The best few places nearby, each with its reasons." },
  ]
  return (
    <div className="relative grid gap-6 md:grid-cols-3 md:gap-4">
      <div className="absolute top-7 right-[16%] left-[16%] hidden h-px border-t border-dashed md:block" aria-hidden />
      {!reduce && (
        <motion.span
          className="absolute top-[25px] hidden size-1.5 rounded-full bg-primary md:block"
          initial={{ left: "16%" }}
          animate={{ left: ["16%", "84%"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.6 }}
          aria-hidden
        />
      )}
      {steps.map((s, i) => (
        <Reveal key={s.title} delay={i * 0.12} className="relative flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl border bg-background shadow-xs [&>svg]:size-6">{s.icon}</span>
          <div>
            <div className="font-medium">{s.title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
          </div>
        </Reveal>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ 2. the funnel */

function Funnel({ meta, coverage }: { meta: Meta | null; coverage: Coverage | null }) {
  const [svc, setSvc] = React.useState("dialysis")
  const row = coverage?.services.find((s) => s.service === svc)
  const name = meta?.services.find((s) => s.id === svc)?.name ?? ""
  const total = coverage?.n_facilities ?? 0
  const mention = row ? row.strong + row.moderate + row.weak + row.possible + row.not_offered : 0
  const clear = row?.recommendable ?? 0
  const bars = [
    { label: "Facilities in the data", n: total, shade: "#d4d4d4" },
    { label: `Mention ${name.toLowerCase()}`, n: mention, shade: "#93b9ea" },
    { label: "Clearly say they provide it", n: clear, shade: "#2a78d6" },
  ]
  return (
    <div className="flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-xs md:p-6">
      <ServiceChips meta={meta} value={svc} onChange={setSvc} />
      <div className="flex flex-col gap-3">
        {bars.map((b) => (
          <div key={b.label} className="grid grid-cols-[minmax(0,180px)_1fr] items-center gap-3 md:grid-cols-[220px_1fr]">
            <span className="text-sm text-muted-foreground">{b.label}</span>
            <div className="flex items-center gap-3">
              <motion.div
                className="h-7 rounded-r-md rounded-l-[4px]"
                style={{ background: b.shade }}
                initial={false}
                animate={{ width: total ? `${Math.max(1.5, (b.n / total) * 100) * 0.85}%` : "0%" }}
                transition={{ type: "spring", stiffness: 90, damping: 20 }}
              />
              <span className="text-sm font-semibold tabular-nums">{b.n.toLocaleString()}</span>
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[minmax(0,180px)_1fr] items-center gap-3 md:grid-cols-[220px_1fr]">
          <span className="text-sm font-medium">Shown to you</span>
          <div className="flex items-center gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <motion.span
                key={`${svc}-${i}`}
                className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15 + i * 0.06, type: "spring", stiffness: 300, damping: 18 }}
              >
                {i + 1}
              </motion.span>
            ))}
            <span className="ml-1 text-sm text-muted-foreground">the best few near the patient</span>
          </div>
        </div>
      </div>
      {row && (
        <p className="border-t pt-4 text-sm">
          Out of {total.toLocaleString()} facilities, {mention.toLocaleString()} mention {name.toLowerCase()}, but only{" "}
          <b className="font-semibold">{clear.toLocaleString()}</b> say clearly that they provide it. We only recommend from those{" "}
          {clear.toLocaleString()}, and then pick the best few near your patient.
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ 3. the three things */

function ThreeThings() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Reveal className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs">
        <Factor i={0} />
        <div className="relative rounded-xl rounded-bl-sm bg-muted/60 px-4 py-3 text-sm">
          <MessageSquareQuoteIcon className="mb-1 size-4 text-[#2a78d6]" />
          “Dialysis treatment is provided using 25 dialysis machines.”
          <div className="mt-1 text-xs text-muted-foreground">From a hospital's own list of procedures</div>
        </div>
        <p className="text-sm text-muted-foreground">We only count what a facility says in its own words, and we always show you those words.</p>
      </Reveal>
      <Reveal delay={0.1} className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs">
        <Factor i={1} />
        <ul className="flex flex-col gap-2 text-sm">
          {[
            ["Dialysis machines", true],
            ["Intensive care unit", true],
            ["Kidney specialist", true],
            ["Quality accreditation", false],
          ].map(([t, ok], i) => (
            <motion.li
              key={String(t)}
              className="flex items-center gap-2"
              initial={{ opacity: 0, x: -6 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 + i * 0.1 }}
            >
              {ok ? (
                <span className="flex size-5 items-center justify-center rounded-full bg-[#1baf7a]/15 text-[#12805a]">
                  <CheckIcon className="size-3" />
                </span>
              ) : (
                <span className="flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <CircleHelpIcon className="size-3" />
                </span>
              )}
              <span className={cn(!ok && "text-muted-foreground")}>
                {String(t)}
                {!ok && " (not mentioned)"}
              </span>
            </motion.li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">A missing detail never pushes a place down the list. We simply suggest you ask about it.</p>
      </Reveal>
      <Reveal delay={0.2} className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs">
        <Factor i={2} />
        <Rings />
        <p className="text-sm text-muted-foreground">
          For dialysis, a place 15 km away counts half as much for closeness as one next door, and a place 30 km away counts a quarter.
        </p>
      </Reveal>
    </div>
  )
}

function Factor({ i }: { i: number }) {
  const f = FACTORS[i]
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-2 font-semibold">
        <span className="size-2.5 rounded-full" style={{ background: f.color }} />
        {f.name}
      </span>
      <span className="text-sm text-muted-foreground">{f.question}</span>
    </div>
  )
}

function Rings() {
  const rings = [
    { r: 70, label: "30 km away", pct: 25, op: 0.1 },
    { r: 46, label: "15 km away", pct: 50, op: 0.22 },
    { r: 22, label: "Next door", pct: 100, op: 0.4 },
  ]
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 150 150" className="size-36 shrink-0" role="img" aria-label="Closeness halves every 15 kilometres for dialysis">
        {rings.map((g, i) => (
          <motion.circle
            key={g.r}
            cx={75}
            cy={75}
            r={g.r}
            fill="#eb6834"
            fillOpacity={g.op}
            stroke="#eb6834"
            strokeOpacity={0.45}
            initial={{ scale: 0.6, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 + i * 0.12, duration: 0.5 }}
            style={{ transformOrigin: "75px 75px" }}
          />
        ))}
        <circle cx={75} cy={75} r={4} fill="#171717" />
      </svg>
      <ul className="flex flex-col gap-2 text-sm">
        {rings
          .slice()
          .reverse()
          .map((g) => (
            <li key={g.label} className="flex items-center gap-2">
              <span className="size-3 rounded-full border border-[#eb6834]/50" style={{ background: `rgba(235,104,52,${g.op + 0.1})` }} />
              <span className="w-8 font-semibold tabular-nums">{g.pct}</span>
              <span className="text-muted-foreground">{g.label}</span>
            </li>
          ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ 4. priorities per service */

function Priorities({ meta }: { meta: Meta | null }) {
  const [svc, setSvc] = React.useState("dialysis")
  const s = meta?.services.find((x) => x.id === svc)
  return (
    <div className="flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-xs md:p-6">
      <ServiceChips meta={meta} value={svc} onChange={setSvc} />
      {s && (
        <>
          <div className="flex h-12 w-full gap-[3px] overflow-hidden rounded-xl">
            {FACTORS.map((f) => (
              <motion.div
                key={f.key}
                className="flex min-w-0 items-center justify-center text-sm font-medium"
                style={{ background: f.color, color: f.ink }}
                initial={false}
                animate={{ width: `${s.weights[f.key] * 100}%` }}
                transition={{ type: "spring", stiffness: 110, damping: 20 }}
              >
                <span className="truncate px-2">
                  {f.name} {Math.round(s.weights[f.key] * 100)}%
                </span>
              </motion.div>
            ))}
          </div>
          <div className="-mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {FACTORS.map((f) => (
              <span key={f.key} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: f.color }} />
                {f.name}
              </span>
            ))}
          </div>
          <motion.p key={svc} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-base">
            {PRIORITY[svc]}
          </motion.p>
          <p className="text-sm text-muted-foreground">
            We first look within 25 km of the patient. If we can't find enough good options, we widen the search step by step, up to{" "}
            {s.max_radius_km} km for {s.name.toLowerCase()}.
          </p>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ 5. labels */

const LABEL_EXAMPLES: [string, string][] = [
  ["Strong", "“Performs Caesarean Section” and “Offers 24/7 emergency care”."],
  ["Moderate", "“Dialysis”, listed among its procedures, with no machines mentioned."],
  ["Weak", "The care appears once, inside a long general list of services."],
  ["Possible", "It lists “nephrology” as a specialty, but never says it offers dialysis."],
]

function Labels() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Reveal className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs">
        <div>
          <div className="font-semibold">How strong is the proof?</div>
          <p className="text-sm text-muted-foreground">This label is about the facility's own words.</p>
        </div>
        {LABEL_EXAMPLES.map(([k, ex]) => (
          <div key={k} className="flex flex-col gap-1.5">
            <EvidenceBadge label={k} />
            <p className="text-sm text-muted-foreground">{ex}</p>
          </div>
        ))}
      </Reveal>
      <Reveal delay={0.1} className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs">
        <div>
          <div className="font-semibold">How much can we trust the record?</div>
          <p className="text-sm text-muted-foreground">This label is about the record as a whole.</p>
        </div>
        {["High", "Medium", "Low"].map((k) => (
          <div key={k} className="flex flex-col gap-1.5">
            <ConfidenceBadge level={k} />
            <p className="text-sm text-muted-foreground">{CONFIDENCE[k].explain}</p>
          </div>
        ))}
        <div className="mt-auto rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          A place can have strong proof and still get low confidence, for example when its record seems to mix up two facilities.
        </div>
      </Reveal>
    </div>
  )
}

/* ------------------------------------------------------------------ 6. left out */

function LeftOut() {
  const kinds = ["ranked_lower", "facility_type", "thin_evidence", "hint_only", "not_offered"]
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {kinds.map((k, i) => (
        <Reveal key={k} delay={i * 0.06} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs">
          <span className="flex size-9 items-center justify-center rounded-xl border text-muted-foreground [&>svg]:size-4">{GROUP[k].icon}</span>
          <div className="font-medium">{GROUP[k].title}</div>
          <p className="text-sm text-muted-foreground">{GROUP[k].plain}</p>
        </Reveal>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ 7. does it work */

function Results() {
  const distance = [
    { name: "Our first choice", km: 61, ours: true },
    { name: "Most mentions of the care", km: 116 },
    { name: "Biggest hospital nearby", km: 114 },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { v: 100, suf: "%", text: "of our first choices are backed by the facility's own words about that care." },
          { v: 0, suf: "", text: "unconfirmed places suggested when the need is urgent. The “biggest hospital” approach did this every time." },
          { v: 100, suf: "%", text: "of the quotes we show appear word for word in the facility's record." },
        ].map((s, i) => (
          <Reveal key={i} delay={i * 0.08} className="flex flex-col gap-2 rounded-2xl border bg-gradient-to-t from-primary/[0.04] to-card p-5 shadow-xs">
            <span className="text-4xl font-semibold tracking-tight tabular-nums">
              <CountUp to={s.v} suffix={s.suf} />
            </span>
            <p className="text-sm text-muted-foreground">{s.text}</p>
          </Reveal>
        ))}
      </div>
      <Reveal className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs md:p-6">
        <div>
          <div className="font-semibold">Our first choice is usually much closer</div>
          <p className="text-sm text-muted-foreground">The typical distance from the patient to the place ranked first, across 83 test searches.</p>
        </div>
        {distance.map((d, i) => (
          <div key={d.name} className="grid grid-cols-[minmax(0,190px)_1fr] items-center gap-3">
            <span className={cn("text-sm", d.ours ? "font-medium" : "text-muted-foreground")}>{d.name}</span>
            <div className="flex items-center gap-3">
              <motion.div
                className="h-6 rounded-r-md rounded-l-[4px]"
                style={{ background: d.ours ? "#2a78d6" : "#d4d4d4" }}
                initial={{ width: 0 }}
                whileInView={{ width: `${(d.km / 130) * 85}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.1 + i * 0.1, ease: "easeOut" }}
              />
              <span className="text-sm font-semibold tabular-nums">{d.km} km</span>
            </div>
          </div>
        ))}
        <p className="border-t pt-4 text-sm text-muted-foreground">
          How we tested it: we ran 83 searches across all nine kinds of care. Three AI reviewers then graded 1,422 facility records against
          a fixed checklist, without knowing which method had chosen them, and they agreed with each other closely. A ranking that only
          counts mentions puts well-documented hospitals far away at the top. We chose to favour good options that are closer.
        </p>
      </Reveal>
    </div>
  )
}

/* ------------------------------------------------------------------ page */

export function HowItWorks({ meta }: { meta: Meta | null }) {
  const [coverage, setCoverage] = React.useState<Coverage | null>(null)
  React.useEffect(() => {
    api.coverage().then(setCoverage).catch(() => setCoverage(null))
  }, [])
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-8 md:py-12 lg:px-6">
      <Reveal className="flex flex-col items-center gap-4 text-center">
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">How it works</span>
        <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-balance md:text-4xl">
          We help you find a place that can really provide the care, and we show you why.
        </h2>
        <p className="max-w-2xl text-muted-foreground text-balance">
          A facility saying it offers something isn't proof that it does. So we read what each one says about itself, check it, and
          tell you honestly how sure we are.
        </p>
      </Reveal>

      <Journey />

      <section className="flex flex-col gap-6">
        <Reveal>
          <SectionTitle eyebrow="Step 1" title="From thousands of records to a few good options">
            Pick a kind of care to see how many places make it through each check.
          </SectionTitle>
        </Reveal>
        <Reveal>
          <Funnel meta={meta} coverage={coverage} />
        </Reveal>
      </section>

      <section className="flex flex-col gap-6">
        <Reveal>
          <SectionTitle eyebrow="Step 2" title="We look at three things">
            Every place on your list is scored on proof, support and closeness. Each one counts from 0 to 100.
          </SectionTitle>
        </Reveal>
        <ThreeThings />
      </section>

      <section className="flex flex-col gap-6">
        <Reveal>
          <SectionTitle eyebrow="Step 3" title="Different care, different priorities">
            Distance matters more in an emergency, and equipment matters more for a planned operation. Choose a kind of care to see the
            balance we use.
          </SectionTitle>
        </Reveal>
        <Reveal>
          <Priorities meta={meta} />
        </Reveal>
      </section>

      <section className="flex flex-col gap-6">
        <Reveal>
          <SectionTitle eyebrow="Reading the results" title="What the labels tell you" />
        </Reveal>
        <Labels />
      </section>

      <section className="flex flex-col gap-6">
        <Reveal>
          <SectionTitle eyebrow="Being open" title="When we leave a place out, we tell you why">
            Every search also lists the nearby places we decided not to recommend, sorted into five simple reasons.
          </SectionTitle>
        </Reveal>
        <LeftOut />
      </section>

      <section className="flex flex-col gap-6">
        <Reveal>
          <SectionTitle eyebrow="Does it work?" title="We tested it against simpler approaches" />
        </Reveal>
        <Results />
      </section>

      <Reveal className="flex flex-col items-center gap-3 rounded-2xl border bg-muted/40 px-6 py-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-full border bg-background">
          <PhoneCallIcon className="size-5" />
        </span>
        <div className="text-lg font-semibold">Please call before you travel</div>
        <p className="max-w-xl text-sm text-muted-foreground">
          We can only be as good as the records, and a record can be out of date. Our list tells you where to start, and a quick phone
          call tells you whether the care is available today.
        </p>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPinIcon className="size-3.5" /> Data from the Virtue Foundation's records of about 10,000 facilities across India.
        </span>
      </Reveal>
    </div>
  )
}

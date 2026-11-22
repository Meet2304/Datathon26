import * as React from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowRightIcon, CircleAlertIcon, LoaderCircleIcon, LocateFixedIcon, MapPinIcon, MapPinnedIcon, SearchIcon, SignpostIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CarePicker, careName } from "@/components/care-picker"
import { NotRecommended, leftOutCount } from "@/components/not-recommended"
import { ProgressTracker } from "@/components/progress-tracker"
import { ResultItem, ResultSheet } from "@/components/result-card"
import { ResultsMap } from "@/components/results-map"
import { api, type Meta, type Result, type SearchResponse } from "@/lib/api"
import { km } from "@/lib/labels"
import { FACTORS, PRIORITY } from "@/lib/services"

type Query = { service: string; location: string; k: number }

const EXAMPLES = ["492001", "Patna", "Chennai", "Bangalore", "Aurangabad"]
const STARTERS: { label: string; q: Query }[] = [
  { label: "Dialysis near Raipur", q: { service: "dialysis", location: "492001", k: 5 } },
  { label: "Emergency delivery in Patna", q: { service: "emergency_csection", location: "Patna", k: 5 } },
  { label: "Newborn intensive care in New Delhi", q: { service: "nicu", location: "110001", k: 5 } },
]

const fade = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.25 } }

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col rounded-lg border bg-gradient-to-t from-primary/[0.04] to-card px-3 py-2">
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

export function FindCare({ meta, metaError }: { meta: Meta | null; metaError: string | null }) {
  const [q, setQ] = React.useState<Query>({ service: "", location: "", k: 5 })
  const [resp, setResp] = React.useState<SearchResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [hover, setHover] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<Result | null>(null)
  const [tab, setTab] = React.useState("recommended")
  const [locating, setLocating] = React.useState(false)

  const searched = resp && resp.query.resolved_location ? resp : null
  const ready = q.service !== "" && q.location.trim() !== ""
  const current = searched ? 2 : q.service ? 1 : 0
  const results = searched?.results ?? []
  const extras: Result[] = [
    ...(searched?.extra_rows?.stronger_evidence ? [searched.extra_rows.stronger_evidence.result] : []),
    ...(searched?.extra_rows?.unconfirmed_options?.results ?? []),
  ]
  const others = (searched?.not_recommended?.groups ?? []).flatMap((g) => g.items)
  const leftOut = leftOutCount(searched?.not_recommended ?? null)
  const resultService = meta?.services.find((s) => s.id === searched?.query.service)

  async function run(next?: Query) {
    const query = next ?? q
    if (next) setQ(next)
    if (!query.service || !query.location.trim()) return
    setLoading(true)
    setError(null)
    setTab("recommended")
    try {
      setResp(await api.search(query.service, query.location.trim(), query.k))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResp(null)
    } finally {
      setLoading(false)
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setError("Your browser can't share its location. Please type a PIN code or a city.")
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const next = { ...q, location: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}` }
        setQ(next)
        if (next.service) run(next)
      },
      () => {
        setLocating(false)
        setError("We couldn't get your location. Please type a PIN code or a city.")
      },
      { timeout: 10000 }
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6 @5xl/main:h-[calc(100svh-var(--header-height)-1rem)]">
      {/* ---------- controls + progress ---------- */}
      <section className="flex shrink-0 flex-col gap-5 rounded-xl border bg-card p-4 shadow-xs lg:p-5">
        <ProgressTracker
          current={current}
          steps={[
            { title: "Care needed", hint: "What does the patient need?", value: careName(meta, q.service) },
            {
              title: "Patient location",
              hint: "Where is the patient now?",
              value: searched?.query.resolved_location?.label.split(" (")[0],
            },
            {
              title: "Compare and call",
              hint: "Pick a place, then call ahead",
              value: searched ? `${results.length} option${results.length === 1 ? "" : "s"} found` : undefined,
            },
          ]}
        />
        <form
          className="grid grid-cols-1 gap-2 @3xl/main:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            if (ready) run()
          }}
        >
          <CarePicker meta={meta} value={q.service} onChange={(id) => setQ({ ...q, service: id })} className="w-full" />
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MapPinIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Patient location"
                  value={q.location}
                  onChange={(e) => setQ({ ...q, location: e.target.value })}
                  placeholder="PIN code, city, district or coordinates"
                  className="h-10 pl-9"
                />
              </div>
              <Button type="button" variant="outline" size="icon" className="size-10" onClick={useMyLocation} disabled={locating} aria-label="Use my location" title="Use my location">
                {locating ? <LoaderCircleIcon className="animate-spin" /> : <LocateFixedIcon />}
              </Button>
            </div>
          </div>
          <Select value={String(q.k)} onValueChange={(v) => setQ({ ...q, k: Number(v) })}>
            <SelectTrigger className="h-10! w-full @3xl/main:w-28" aria-label="How many options">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[3, 5, 10].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} options
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" className="h-10 px-5" disabled={!ready || loading}>
            {loading ? <LoaderCircleIcon className="animate-spin" /> : <SearchIcon />}
            Search
          </Button>
        </form>
        {!searched && (
          <div className="-mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>Places you can try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setQ({ ...q, location: ex })}
                className="rounded-md border bg-background px-2 py-0.5 text-foreground transition-colors hover:bg-muted"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ---------- results + map ---------- */}
      <div className="grid min-h-0 flex-1 gap-4 @5xl/main:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-3">
          <AnimatePresence mode="wait">
            {metaError && (
              <motion.div key="meta" {...fade}>
                <Alert variant="destructive">
                  <CircleAlertIcon />
                  <AlertTitle>The facility data is still loading</AlertTitle>
                  <AlertDescription>{metaError}</AlertDescription>
                </Alert>
              </motion.div>
            )}
            {loading ? (
              <motion.div key="loading" {...fade} className="flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-36 rounded-xl" />
                ))}
              </motion.div>
            ) : error ? (
              <motion.div key="error" {...fade}>
                <Alert variant="destructive">
                  <CircleAlertIcon />
                  <AlertTitle>Something went wrong</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </motion.div>
            ) : resp?.clarification ? (
              <motion.div key="clar" {...fade} className="rounded-xl border bg-card p-5 shadow-xs">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <SignpostIcon className="size-4" /> One quick question
                </div>
                <p className="mb-4 text-sm text-muted-foreground">{resp.clarification.message}</p>
                <div className="flex flex-wrap gap-2">
                  {resp.clarification.options.map((o) => (
                    <Button key={o.label} variant="outline" onClick={() => run({ ...q, location: o.label })}>
                      <MapPinnedIcon /> {o.label}
                    </Button>
                  ))}
                </div>
              </motion.div>
            ) : resp?.error ? (
              <motion.div key="rerr" {...fade}>
                <Alert>
                  <CircleAlertIcon />
                  <AlertTitle>We couldn't find that place</AlertTitle>
                  <AlertDescription>{resp.error}</AlertDescription>
                </Alert>
              </motion.div>
            ) : searched ? (
              <motion.div key={`res-${searched.query.service}-${searched.query.location_input}`} {...fade} className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="grid shrink-0 grid-cols-3 gap-2">
                  <Stat value={results.length} label="recommended" />
                  <Stat value={results.length ? `${km(Math.min(...results.map((r) => r.distance_km)))} km` : "—"} label="to the nearest" />
                  <Stat value={(searched.not_recommended?.considered_count ?? 0).toLocaleString()} label="places checked" />
                </div>
                {resultService && (
                  <div className="flex shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
                    <p className="text-sm">
                      <span className="font-medium">Why this order? </span>
                      <span className="text-muted-foreground">{PRIORITY[resultService.id]}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex h-1.5 flex-1 gap-[2px] overflow-hidden rounded-full">
                        {FACTORS.map((f) => (
                          <motion.div
                            key={f.key}
                            initial={{ width: 0 }}
                            animate={{ width: `${resultService.weights[f.key] * 100}%` }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                            style={{ background: f.color }}
                          />
                        ))}
                      </div>
                      <div className="flex gap-3 text-[11px] text-muted-foreground">
                        {FACTORS.map((f) => (
                          <span key={f.key} className="flex items-center gap-1">
                            <span className="size-1.5 rounded-full" style={{ background: f.color }} />
                            {f.name} {Math.round(resultService.weights[f.key] * 100)}%
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {searched.specialty_mode && (
                  <Alert className="shrink-0">
                    <CircleAlertIcon />
                    <AlertTitle>Based on listed specialties only</AlertTitle>
                    <AlertDescription>
                      We don't check {careName(meta, searched.query.service).toLowerCase()} in depth. These places list it as a specialty,
                      so please call to confirm the treatment you need.
                    </AlertDescription>
                  </Alert>
                )}
                {searched.fallback && (
                  <Alert className="shrink-0 border-amber-200 bg-amber-50 text-amber-950">
                    <CircleAlertIcon />
                    <AlertTitle>No well-documented option close by</AlertTitle>
                    <AlertDescription className="text-amber-900/90">{searched.fallback}</AlertDescription>
                  </Alert>
                )}
                <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
                  <TabsList className="w-full shrink-0">
                    <TabsTrigger value="recommended">Recommended ({results.length + extras.length})</TabsTrigger>
                    <TabsTrigger value="left">Left out ({leftOut})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="recommended" className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
                    <div className="flex flex-col gap-2.5 pt-1">
                      {results.map((r, i) => (
                        <motion.div key={r.unique_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                          <ResultItem r={r} service={resultService} active={hover === r.unique_id} onHover={setHover} onOpen={() => setOpen(r)} />
                        </motion.div>
                      ))}
                      {searched.extra_rows?.stronger_evidence && (
                        <div className="flex flex-col gap-2 pt-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Worth knowing: a place with stronger proof, {searched.extra_rows.stronger_evidence.message.split(", ").pop()}
                          </p>
                          <ResultItem
                            r={searched.extra_rows.stronger_evidence.result}
                            service={resultService}
                            active={hover === searched.extra_rows.stronger_evidence.result.unique_id}
                            onHover={setHover}
                            onOpen={() => setOpen(searched.extra_rows!.stronger_evidence!.result)}
                          />
                        </div>
                      )}
                      {searched.extra_rows?.unconfirmed_options && (
                        <div className="flex flex-col gap-2 pt-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Unconfirmed: these places only hint at this care. Call before going.
                          </p>
                          {searched.extra_rows.unconfirmed_options.results.map((r) => (
                            <ResultItem key={r.unique_id} r={r} service={resultService} onHover={setHover} onOpen={() => setOpen(r)} />
                          ))}
                        </div>
                      )}
                      {results.length === 0 && !searched.extra_rows && (
                        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                          Nothing nearby has a clear enough record. The “Left out” tab shows what we found and why we didn't suggest it.
                        </p>
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="left" className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
                    {searched.not_recommended && <NotRecommended data={searched.not_recommended} />}
                  </TabsContent>
                </Tabs>
              </motion.div>
            ) : (
              <motion.div key="welcome" {...fade} className="flex flex-1 flex-col justify-center gap-5 rounded-xl border border-dashed p-6">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Where should this patient go?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Choose the care the patient needs and tell us where they are. We'll show the nearby places whose own records say they
                    provide it, and explain each choice.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Or start with an example</span>
                  {STARTERS.map((s) => (
                    <Button key={s.label} variant="outline" className="justify-between" onClick={() => run(s.q)} disabled={!meta}>
                      {s.label}
                      <ArrowRightIcon />
                    </Button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex min-h-[340px] flex-col overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="relative isolate z-0 min-h-0 flex-1">
            <ResultsMap
              origin={searched?.query.resolved_location ?? null}
              results={[...results, ...extras]}
              others={others}
              radiusKm={searched?.query.radius_km_used ?? null}
              highlighted={hover}
              onSelect={(id) => {
                const r = [...results, ...extras].find((x) => x.unique_id === id)
                if (r) setOpen(r)
              }}
            />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full border-2 border-foreground bg-background" /> Patient
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-neutral-700" /> Recommended
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-neutral-400" /> Left out
            </span>
            <span className="ml-auto">Distances are estimates. Always call ahead.</span>
          </div>
        </div>
      </div>

      <ResultSheet r={open} service={resultService} onClose={() => setOpen(null)} />
    </div>
  )
}

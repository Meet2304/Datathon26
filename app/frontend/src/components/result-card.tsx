import { ChevronRightIcon, ExternalLinkIcon, PhoneIcon, QuoteIcon, TriangleAlertIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { Result, Service } from "@/lib/api"
import { CONFIDENCE, EVIDENCE, km, plainCaveat, prettyField } from "@/lib/labels"
import { FACTORS } from "@/lib/services"

export function EvidenceBadge({ label, className }: { label: string; className?: string }) {
  const e = EVIDENCE[label] ?? EVIDENCE["Possible"]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex h-6 w-fit items-center gap-1.5 rounded-md border px-2 text-xs font-medium whitespace-nowrap", e.tone, className)}>
          <span className={cn("size-1.5 rounded-full", e.dot)} />
          {e.text}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{e.explain}</TooltipContent>
    </Tooltip>
  )
}

export function ConfidenceBadge({ level }: { level: string }) {
  const c = CONFIDENCE[level] ?? CONFIDENCE.Low
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex h-6 w-fit items-center gap-1.5 rounded-md border px-2 text-xs font-medium whitespace-nowrap text-foreground">
          <span className="flex items-end gap-[2px]" aria-hidden>
            {[1, 2, 3].map((i) => (
              <span key={i} className={cn("w-[3px] rounded-sm", i <= c.bars ? "bg-foreground" : "bg-border")} style={{ height: 4 + i * 3 }} />
            ))}
          </span>
          {c.text}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{c.explain}</TooltipContent>
    </Tooltip>
  )
}

/** One bar, three coloured parts: how much proof, support and closeness each added to the match score. */
export function ScoreBar({ r, service, showLegend }: { r: Result; service?: Service; showLegend?: boolean }) {
  if (r.rank_score == null || r.E == null || r.D == null || r.A == null || !service) return null
  const w = service.weights
  const parts = [
    { ...FACTORS[0], v: w.evidence * r.E, raw: r.E, w: w.evidence },
    { ...FACTORS[1], v: w.capability * r.D, raw: r.D, w: w.capability },
    { ...FACTORS[2], v: w.closeness * r.A, raw: r.A, w: w.closeness },
  ]
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <div className="flex h-2 flex-1 gap-[2px] overflow-hidden rounded-full bg-muted" role="img" aria-label={`Match ${Math.round(r.rank_score)} out of 100`}>
          {parts.map((p) => (
            <Tooltip key={p.key}>
              <TooltipTrigger asChild>
                <div className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${p.v}%`, background: p.color }} />
              </TooltipTrigger>
              <TooltipContent>
                {p.name}: {Math.round(p.raw)} out of 100, counted at {Math.round(p.w * 100)}% → adds {p.v.toFixed(1)}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        <span className="w-12 text-right text-sm font-semibold tabular-nums">{Math.round(r.rank_score)}</span>
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {parts.map((p) => (
            <span key={p.key} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              {p.name} {Math.round(p.raw)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Compact row in the results list. Click opens the full explanation. */
export function ResultItem({
  r,
  service,
  active,
  onHover,
  onOpen,
}: {
  r: Result
  service?: Service
  active?: boolean
  onHover?: (id: string | null) => void
  onOpen: () => void
}) {
  const q = r.why?.[0]
  return (
    <div
      id={`result-${r.unique_id}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      onMouseEnter={() => onHover?.(r.unique_id)}
      onMouseLeave={() => onHover?.(null)}
      className={cn(
        "group flex cursor-pointer flex-col gap-2.5 rounded-xl border bg-card p-4 shadow-xs transition-all outline-none hover:border-foreground/20 focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active && "border-foreground/30 ring-2 ring-primary/15"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
            r.rank != null ? "bg-primary text-primary-foreground" : "border text-muted-foreground"
          )}
        >
          {r.rank ?? "•"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-1 font-medium">{r.name}</div>
          <div className="line-clamp-1 text-xs text-muted-foreground">{r.place || r.facility_type}</div>
        </div>
        <div className="text-right">
          <div className="font-semibold tabular-nums">~{km(r.distance_km)} km</div>
          <div className="text-[11px] text-muted-foreground">by road</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-10">
        <EvidenceBadge label={r.evidence_label} />
        <ConfidenceBadge level={r.confidence} />
        {r.caveats.length > 0 && (
          <span className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-amber-700">
            <TriangleAlertIcon className="size-3.5" /> {r.caveats.length} to check
          </span>
        )}
      </div>
      {q && (
        <p className="line-clamp-2 pl-10 text-sm text-muted-foreground">
          <QuoteIcon className="mr-1 inline size-3 -translate-y-0.5" />
          <span className="text-foreground">{q.quote}</span>
        </p>
      )}
      <div className="flex items-center gap-3 pl-10">
        <div className="flex-1">
          <ScoreBar r={r} service={service} />
        </div>
        <span className="flex items-center text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          Why <ChevronRightIcon className="size-3.5" />
        </span>
      </div>
    </div>
  )
}

/** Side panel with the full explanation of one facility. */
export function ResultSheet({ r, service, onClose }: { r: Result | null; service?: Service; onClose: () => void }) {
  return (
    <Sheet open={!!r} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {r && (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="pr-6 text-lg leading-snug">{r.name}</SheetTitle>
              <SheetDescription>
                {[r.place, `about ${km(r.distance_km)} km by road`].filter(Boolean).join(" · ")}
                {r.distance_uncertainty_km ? ` (could be off by ${Math.round(r.distance_uncertainty_km)} km)` : ""}
              </SheetDescription>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <EvidenceBadge label={r.evidence_label} />
                <ConfidenceBadge level={r.confidence} />
              </div>
            </SheetHeader>
            <div className="flex flex-col gap-6 p-4">
              <section className="flex flex-col gap-2">
                <h4 className="text-sm font-semibold">What the facility says about itself</h4>
                {r.why.length === 0 && <p className="text-sm text-muted-foreground">The record has no direct statement about this care.</p>}
                {r.why.map((q, i) => (
                  <figure key={i} className="rounded-lg border-l-2 border-[#2a78d6]/50 bg-muted/40 px-3 py-2">
                    <blockquote className="text-sm leading-relaxed">“{q.quote}”</blockquote>
                    <figcaption className="mt-1 text-xs text-muted-foreground">Taken word for word from {prettyField(q.field)}</figcaption>
                  </figure>
                ))}
              </section>

              {r.rank_score != null && service && (
                <section className="flex flex-col gap-3">
                  <h4 className="text-sm font-semibold">How it earned a match of {Math.round(r.rank_score)} out of 100</h4>
                  <ScoreBar r={r} service={service} showLegend />
                  <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                    <li>
                      <b className="font-medium text-foreground">Proof ({Math.round(r.E ?? 0)}).</b> How clearly the facility's own words say it
                      provides this care.
                    </li>
                    <li>
                      <b className="font-medium text-foreground">Support ({Math.round(r.D ?? 0)}).</b> How much of what this care needs is listed,
                      such as machines, an intensive care unit or a blood bank.
                    </li>
                    <li>
                      <b className="font-medium text-foreground">Closeness ({Math.round(r.A ?? 0)}).</b> A place next door scores 100, and the score
                      halves every {service.half_distance_km} km of travel.
                    </li>
                  </ul>
                </section>
              )}

              {r.caveats.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h4 className="text-sm font-semibold">Check these before you go</h4>
                  <ul className="flex flex-col gap-2">
                    {r.caveats.map((c, i) => (
                      <li key={i} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-950">
                        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
                        <span>{plainCaveat(c)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {r.not_reported.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h4 className="text-sm font-semibold">Not mentioned in its record</h4>
                  <p className="text-xs text-muted-foreground">Missing details don't lower its place in the list. It's worth asking about them when you call.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {r.not_reported.map((x, i) => (
                      <Badge key={i} variant="secondary" className="font-normal">
                        {x}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}

              <section className="flex flex-col gap-2 border-t pt-4">
                <h4 className="text-sm font-semibold">Contact</h4>
                <div className="flex flex-wrap gap-2">
                  {r.contact.official_phone ? (
                    <Button asChild>
                      <a href={`tel:${r.contact.official_phone.replace(/[^\d+]/g, "")}`}>
                        <PhoneIcon /> Call {r.contact.official_phone}
                      </a>
                    </Button>
                  ) : (
                    <span className="text-sm text-muted-foreground">No phone number in the record.</span>
                  )}
                  {r.contact.references.slice(0, 2).map((u) => (
                    <Button key={u} asChild variant="outline">
                      <a href={u} target="_blank" rel="noreferrer">
                        <ExternalLinkIcon /> {u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                      </a>
                    </Button>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

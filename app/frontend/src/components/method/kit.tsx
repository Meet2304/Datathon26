// Small building blocks shared by the "How it works" sections.
import * as React from "react"
import { animate, motion, useInView, useReducedMotion } from "motion/react"
import { DatabaseIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export const fmt = (n: number, d = 0) => n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d })
export const pct = (n: number, of: number) => `${Math.round((n / of) * 100)}%`

export const C = {
  blue: "#2a78d6",
  blueLight: "#93b9ea",
  aqua: "#1baf7a",
  orange: "#eb6834",
  grey: "#d4d4d4",
  greyDark: "#a3a3a3",
  red: "#dc2626",
}

export function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  )
}

export function CountUp({ to, suffix = "", decimals = 0 }: { to: number; suffix?: string; decimals?: number }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  React.useEffect(() => {
    if (!inView || !ref.current) return
    const el = ref.current
    if (reduce) {
      el.textContent = fmt(to, decimals) + suffix
      return
    }
    const c = animate(0, to, { duration: 1.1, ease: "easeOut", onUpdate: (v) => (el.textContent = fmt(v, decimals) + suffix) })
    return () => c.stop()
  }, [inView, to, suffix, decimals, reduce])
  return <span ref={ref}>{fmt(0, decimals) + suffix}</span>
}

/** A bar that grows to `value / max` when scrolled into view. */
export function GrowBar({
  value,
  max,
  color,
  className,
  delay = 0,
  children,
}: {
  value: number
  max: number
  color: string
  className?: string
  delay?: number
  children?: React.ReactNode
}) {
  const reduce = useReducedMotion()
  const w = `${Math.max(0.6, (value / max) * 100)}%`
  return (
    <motion.div
      className={cn("h-full rounded-[3px]", className)}
      style={{ background: color }}
      initial={reduce ? { width: w } : { width: 0 }}
      whileInView={{ width: w }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  )
}

/** Same as GrowBar, but animates on every value change (for interactive charts). */
export function LiveBar({ value, max, color, className }: { value: number; max: number; color: string; className?: string }) {
  return (
    <motion.div
      className={cn("h-full rounded-[3px]", className)}
      style={{ background: color }}
      initial={false}
      animate={{ width: `${Math.max(0.6, (value / max) * 100)}%` }}
      transition={{ type: "spring", stiffness: 110, damping: 20 }}
    />
  )
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs md:p-6", className)}>{children}</div>
}

export function PanelTitle({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="font-semibold">{title}</div>
      {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

export function Stat({ value, label, suffix, decimals }: { value: number; label: string; suffix?: string; decimals?: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-2xl font-semibold tracking-tight tabular-nums">
        <CountUp to={value} suffix={suffix} decimals={decimals} />
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}

export function Tables({ names }: { names: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <DatabaseIcon className="size-3.5" />
      <span>Tables:</span>
      {names.map((n) => (
        <code key={n} className="rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">
          {n}
        </code>
      ))}
    </div>
  )
}

export function Section({
  id,
  n,
  eyebrow,
  title,
  lede,
  tables,
  children,
}: {
  id: string
  n: string
  eyebrow: string
  title: string
  lede: React.ReactNode
  tables?: string[]
  children: React.ReactNode
}) {
  return (
    <section id={id} data-stage={id} className="flex scroll-mt-16 flex-col gap-6">
      <Reveal className="flex max-w-3xl flex-col gap-2">
        <span className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <span className="rounded-md bg-primary px-1.5 py-0.5 font-mono text-[11px] text-primary-foreground">{n}</span>
          {eyebrow}
        </span>
        <h3 className="text-2xl font-semibold tracking-tight text-balance">{title}</h3>
        <p className="text-muted-foreground">{lede}</p>
      </Reveal>
      {children}
      {tables && <Tables names={tables} />}
    </section>
  )
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; icon?: React.ReactNode }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors [&>svg]:size-3.5",
            value === o.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

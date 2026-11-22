import { CheckIcon } from "lucide-react"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"

export type TrackerStep = { title: string; value?: string; hint: string }

/** Three-step progress: done steps get a check and show what was chosen; the current step is ringed. */
export function ProgressTracker({ steps, current }: { steps: TrackerStep[]; current: number }) {
  const pct = Math.min(1, current / (steps.length - 1))
  return (
    <div className="relative">
      <div className="absolute top-4 right-[16.6%] left-[16.6%] h-0.5 rounded-full bg-border" aria-hidden />
      <motion.div
        className="absolute top-4 left-[16.6%] h-0.5 rounded-full bg-primary"
        initial={false}
        animate={{ width: `${pct * 66.8}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 22 }}
        aria-hidden
      />
      <ol className="relative grid grid-cols-3">
        {steps.map((s, i) => {
          const done = i < current
          const active = i === current
          return (
            <li key={s.title} className="flex flex-col items-center gap-1.5 px-1 text-center">
              <motion.span
                initial={false}
                animate={{ scale: active ? 1.06 : 1 }}
                className={cn(
                  "z-10 flex size-8 items-center justify-center rounded-full border-2 bg-background text-sm font-semibold tabular-nums transition-colors",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-foreground ring-4 ring-primary/10",
                  !done && !active && "border-border text-muted-foreground"
                )}
              >
                {done ? <CheckIcon className="size-4" /> : i + 1}
              </motion.span>
              <span className={cn("text-sm font-medium", !done && !active && "text-muted-foreground")}>{s.title}</span>
              <span className="line-clamp-1 max-w-full text-xs text-muted-foreground">{done && s.value ? s.value : s.hint}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

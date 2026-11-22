import * as React from "react"
import { ArrowDownWideNarrowIcon, BanIcon, EyeOffIcon, FileQuestionIcon, ScaleIcon, ShieldXIcon } from "lucide-react"

import type { NotRecommended as NR } from "@/lib/api"
import { km } from "@/lib/labels"
import { EvidenceBadge } from "@/components/result-card"

export const GROUP: Record<string, { icon: React.ReactNode; title: string; plain: string }> = {
  ranked_lower: {
    icon: <ArrowDownWideNarrowIcon />,
    title: "Good, but not in the top few",
    plain: "These places do say they provide this care. Others scored higher on proof, support or closeness.",
  },
  facility_type: {
    icon: <ShieldXIcon />,
    title: "The type of place doesn't fit",
    plain: "For example, an eye hospital that claims a newborn unit. Records like this usually mix up two facilities.",
  },
  thin_evidence: {
    icon: <ScaleIcon />,
    title: "Too little proof",
    plain: "The care is only mentioned in passing, which isn't enough to recommend them.",
  },
  hint_only: {
    icon: <FileQuestionIcon />,
    title: "Only a hint",
    plain: "They list a related specialty or piece of equipment, but never say they provide this care.",
  },
  not_offered: {
    icon: <BanIcon />,
    title: "They say they don't offer it",
    plain: "Their own record says this care isn't available there.",
  },
}

export function leftOutCount(data: NR | null) {
  return data ? data.groups.reduce((s, g) => s + g.count, 0) : 0
}

export function NotRecommended({ data }: { data: NR }) {
  const left = leftOutCount(data)
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        We looked at all {data.considered_count.toLocaleString()} facilities within {data.radius_km} km. {left > 0 ? `${left} of them mention this care but aren't on your list, for the reasons below. ` : ""}
        {data.no_mention_count > 0 ? `The other ${data.no_mention_count.toLocaleString()} never mention it.` : ""}
      </p>
      {data.groups.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          <EyeOffIcon className="size-4" /> No other facility nearby mentions this care.
        </div>
      )}
      {data.groups.map((g) => {
        const meta = GROUP[g.kind] ?? { icon: <BanIcon />, title: g.title, plain: "" }
        return (
          <section key={g.kind} className="rounded-xl border bg-card shadow-xs">
            <header className="flex items-start gap-3 border-b px-4 py-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground [&>svg]:size-3.5">
                {meta.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {meta.title}
                  <span className="rounded-md bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{g.count}</span>
                </div>
                <p className="text-xs text-muted-foreground">{meta.plain}</p>
              </div>
            </header>
            <ul className="divide-y">
              {g.items.map((it) => (
                <li key={it.unique_id} className="flex flex-col gap-1 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="line-clamp-1 flex-1 text-sm">{it.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">~{km(it.distance_km)} km</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <EvidenceBadge label={it.evidence_label} className="h-5 text-[11px]" />
                    <span className="text-xs text-muted-foreground">{it.reason}</span>
                  </div>
                </li>
              ))}
              {g.count > g.items.length && (
                <li className="px-4 py-2 text-xs text-muted-foreground">…and {g.count - g.items.length} more, further away.</li>
              )}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

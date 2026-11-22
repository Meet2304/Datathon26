import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon, StethoscopeIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { Meta } from "@/lib/api"
import { serviceIcon } from "@/lib/services"

export function careName(meta: Meta | null, id: string) {
  if (!meta || !id) return ""
  return meta.services.find((s) => s.id === id)?.name ?? meta.specialties.find((s) => `specialty:${s.code}` === id)?.name ?? id
}

export function CarePicker({
  meta,
  value,
  onChange,
  className,
}: {
  meta: Meta | null
  value: string
  onChange: (id: string) => void
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const name = careName(meta, value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Care needed"
          disabled={!meta}
          className={cn("h-10 justify-between gap-2 px-3 font-normal", !value && "text-muted-foreground", className)}
        >
          <span className="flex min-w-0 items-center gap-2 [&>svg]:size-4 [&>svg]:shrink-0">
            {value ? (value.startsWith("specialty:") ? <StethoscopeIcon /> : serviceIcon(value)) : <StethoscopeIcon />}
            <span className="truncate">{value ? name : meta ? "Search for the care needed…" : "Loading services…"}</span>
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Type to search, e.g. dialysis, heart, newborn…" autoFocus />
          <CommandList className="max-h-[min(420px,60svh)]">
            <CommandEmpty>Nothing matches. Try a simpler word, like “heart” or “kidney”.</CommandEmpty>
            <CommandGroup heading="Checked in depth">
              {(meta?.services ?? []).map((s) => (
                <CommandItem
                  key={s.id}
                  value={`${s.name} ${s.hint}`}
                  onSelect={() => {
                    onChange(s.id)
                    setOpen(false)
                  }}
                  className="gap-3 py-2"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground [&>svg]:size-3.5">
                    {serviceIcon(s.id)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2">
                      {s.name}
                      {s.time_critical && <span className="rounded border px-1 text-[10px] text-muted-foreground">Urgent</span>}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{s.hint}</span>
                  </span>
                  <CheckIcon className={cn("size-4", value === s.id ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Other specialties (listed by facilities, not checked in depth)">
              {(meta?.specialties ?? []).map((sp) => {
                const id = `specialty:${sp.code}`
                return (
                  <CommandItem
                    key={sp.code}
                    value={sp.name}
                    onSelect={() => {
                      onChange(id)
                      setOpen(false)
                    }}
                  >
                    <span className="flex-1">{sp.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{sp.facilities.toLocaleString()} places</span>
                    <CheckIcon className={cn("size-4", value === id ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

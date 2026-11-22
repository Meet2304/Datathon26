import * as React from "react"

import { AppSidebar, type Page } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { api, type Meta } from "@/lib/api"
import { Coverage } from "@/pages/coverage"
import { FindCare } from "@/pages/find-care"
import { HowItWorks } from "@/pages/how-it-works"

const TITLES: Record<Page, { title: string; subtitle: string }> = {
  find: { title: "Find care", subtitle: "Evidence-based facility recommendations across India" },
  how: { title: "How it works", subtitle: "Why each facility is chosen, and how sure we are" },
  coverage: { title: "Coverage", subtitle: "Documented care by service" },
}

function pageFromHash(): Page {
  const h = window.location.hash.replace("#", "")
  return h === "how" || h === "coverage" ? h : "find"
}

export default function App() {
  const [page, setPage] = React.useState<Page>(pageFromHash)
  const [meta, setMeta] = React.useState<Meta | null>(null)
  const [metaError, setMetaError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  // The server loads the facility tables at start-up (about 15 s); retry until they're ready.
  React.useEffect(() => {
    let stop = false
    let tries = 0
    async function load() {
      try {
        const m = await api.meta()
        if (!stop) {
          setMeta(m)
          setMetaError(null)
        }
      } catch (e) {
        tries += 1
        if (!stop && tries > 3) setMetaError(`${e instanceof Error ? e.message : e}. Retrying…`)
        if (!stop) setTimeout(load, 3000)
      }
    }
    load()
    return () => {
      stop = true
    }
  }, [])

  function navigate(p: Page) {
    window.location.hash = p === "find" ? "" : p
    setPage(p)
    window.scrollTo({ top: 0 })
  }

  return (
    <TooltipProvider delayDuration={200}>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 64)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" page={page} onNavigate={navigate} nFacilities={meta?.n_facilities} />
        <SidebarInset>
          <SiteHeader title={TITLES[page].title} subtitle={TITLES[page].subtitle} />
          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col">
              {page === "find" && <FindCare meta={meta} metaError={metaError} />}
              {page === "how" && <HowItWorks meta={meta} />}
              {page === "coverage" && <Coverage />}
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}

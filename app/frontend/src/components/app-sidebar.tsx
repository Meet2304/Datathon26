import * as React from "react"
import { BookOpenIcon, ChartColumnIcon, HeartPulseIcon, SearchIcon, ShieldCheckIcon } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export type Page = "find" | "how" | "coverage"

const NAV: { id: Page; title: string; hint: string; icon: React.ReactNode }[] = [
  { id: "find", title: "Find care", hint: "Search for a facility", icon: <SearchIcon /> },
  { id: "how", title: "How it works", hint: "How we choose and rank", icon: <BookOpenIcon /> },
  { id: "coverage", title: "Coverage", hint: "What the data covers", icon: <ChartColumnIcon /> },
]

export function AppSidebar({
  page,
  onNavigate,
  nFacilities,
  ...props
}: React.ComponentProps<typeof Sidebar> & { page: Page; onNavigate: (p: Page) => void; nFacilities?: number }) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="data-[slot=sidebar-menu-button]:p-1.5!" onClick={() => onNavigate("find")}>
              <HeartPulseIcon className="size-5!" />
              <span className="text-base font-semibold">Find the Right Care</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((n) => (
                <SidebarMenuItem key={n.id}>
                  <SidebarMenuButton tooltip={n.hint} isActive={page === n.id} onClick={() => onNavigate(n.id)}>
                    {n.icon}
                    <span>{n.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>Before you travel</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="mx-2 rounded-lg border bg-background p-3 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheckIcon className="mb-1.5 size-4 text-foreground" />
              Results are based on what facilities say about themselves. They are not a guarantee that a service is
              available today. <span className="font-medium text-foreground">Always call ahead.</span>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 pb-1 text-xs text-muted-foreground">
          Data: Virtue Foundation facility dataset
          {nFacilities ? ` · ${nFacilities.toLocaleString()} located facilities` : ""}
          <br />
          Runs on Databricks Free Edition
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

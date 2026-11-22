import * as React from "react"
import { CircleAlertIcon } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, type Coverage as CoverageT } from "@/lib/api"

const chartConfig = {
  strong: { label: "Strong evidence", color: "#059669" },
  moderate: { label: "Some evidence", color: "#7dd3fc" },
} satisfies ChartConfig

export function Coverage() {
  const [data, setData] = React.useState<CoverageT | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    api.coverage().then(setData).catch((e) => setError(String(e?.message ?? e)))
  }, [])
  const rows = data ? [...data.services].sort((a, b) => b.strong + b.moderate - (a.strong + a.moderate)) : []
  const fewest = rows.length ? rows[rows.length - 1] : null

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
      <div className="flex max-w-3xl flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">What the data covers</h2>
        <p className="text-muted-foreground">
          How many facilities across India have records that support each service. Planners can use this to see where
          documented care is thin.
        </p>
      </div>
      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Couldn't load coverage</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle>
            {fewest
              ? `${fewest.name} has the thinnest documented coverage: ${fewest.strong} facilities with strong evidence nationally`
              : "Facilities with evidence, by service"}
          </CardTitle>
          <CardDescription>
            Facilities whose own record supports each service · {data ? `${data.n_facilities.toLocaleString()} located facilities` : "loading"} ·
            Virtue Foundation dataset
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ChartContainer config={chartConfig} className="aspect-auto h-[320px] w-full">
              <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} />
                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={150} />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="strong" stackId="a" fill="var(--color-strong)" radius={[4, 0, 0, 4]} isAnimationActive={false} />
                <Bar dataKey="moderate" stackId="a" fill="var(--color-moderate)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="text-base">All labels</CardTitle>
          <CardDescription>“Recommendable” means the record passes the minimum evidence bar for that service.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Service</TableHead>
                <TableHead className="text-right">Strong</TableHead>
                <TableHead className="text-right">Some</TableHead>
                <TableHead className="text-right">Weak</TableHead>
                <TableHead className="text-right">Unconfirmed</TableHead>
                <TableHead className="text-right">Says not offered</TableHead>
                <TableHead className="pr-6 text-right">Recommendable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.service}>
                  <TableCell className="pl-6 font-medium">{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.strong.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.moderate.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.weak.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.possible.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.not_offered.toLocaleString()}</TableCell>
                  <TableCell className="pr-6 text-right font-medium tabular-nums">{r.recommendable.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

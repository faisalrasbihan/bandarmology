"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import { toast } from "sonner"
import { z } from "zod"

import { useIsMobile } from "@/hooks/use-mobile"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { CircleCheckIcon, EllipsisVerticalIcon, Columns3Icon, ChevronDownIcon, ChevronsLeftIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsRightIcon, ArrowUpIcon, ArrowRightIcon } from "lucide-react"

export const schema = z.object({
  id: z.number(),
  client: z.string(),
  sector: z.string(),
  jurisdiction: z.string(),
  relationship: z.string(),
  severity: z.string(),
  originalRisk: z.string(),
  currentRisk: z.string(),
  riskScore: z.number(),
  riskDelta: z.number(),
  signal: z.string(),
  trigger: z.string(),
  sources: z.number(),
  detected: z.string(),
  status: z.string(),
  baseline: z.string(),
  observed: z.string(),
  reasoning: z.string(),
  confidence: z.number(),
  tier: z.string(),
  action: z.string(),
  riskBreakdown: z.array(
    z.object({
      type: z.string(),
      status: z.string(),
      reason: z.string(),
    })
  ),
  citations: z.array(
    z.object({
      source: z.string(),
      date: z.string(),
      headline: z.string(),
    })
  ),
})

type Alert = z.infer<typeof schema>

// Tab value -> the status it filters the worklist to.
const STATUS_BY_TAB: Record<string, string> = {
  "needs-action": "New",
  "in-review": "In Review",
  escalated: "Escalated",
  cleared: "Cleared",
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "Critical") {
    return <Badge variant="destructive">Critical</Badge>
  }
  if (severity === "High") {
    return (
      <Badge variant="outline" className="border-amber-600/40 text-amber-600 dark:text-amber-500">
        High
      </Badge>
    )
  }
  if (severity === "Medium") {
    return <Badge variant="secondary">Medium</Badge>
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Low
    </Badge>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Escalated") {
    return (
      <Badge variant="outline" className="border-amber-600/40 text-amber-600 dark:text-amber-500">
        Escalated
      </Badge>
    )
  }
  if (status === "In Review") {
    return <Badge variant="secondary">In Review</Badge>
  }
  if (status === "Cleared") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <CircleCheckIcon className="fill-green-500 dark:fill-green-400" />
        Cleared
      </Badge>
    )
  }
  return <Badge variant="outline">New</Badge>
}

const RISK_RATING_CLASS: Record<string, string> = {
  High: "text-red-600 dark:text-red-500",
  Medium: "text-amber-600 dark:text-amber-500",
  Low: "text-muted-foreground",
}

function RiskRating({ rating }: { rating: string }) {
  return (
    <span className={`font-medium ${RISK_RATING_CLASS[rating] ?? ""}`}>{rating}</span>
  )
}

function RiskDrift({ from, to }: { from: string; to: string }) {
  const escalated = from !== to
  return (
    <div className="flex items-center gap-1.5 text-sm whitespace-nowrap">
      <span className="text-muted-foreground">{from}</span>
      <ArrowRightIcon className="size-3 text-muted-foreground" />
      <RiskRating rating={to} />
      {escalated && <ArrowUpIcon className="size-3 text-red-600 dark:text-red-500" />}
    </div>
  )
}

const RISK_STATUS_CLASS: Record<string, string> = {
  High: "border-red-600/40 text-red-600 dark:text-red-500",
  Medium: "border-amber-600/40 text-amber-600 dark:text-amber-500",
  Low: "text-muted-foreground",
  "Not Applicable": "text-muted-foreground/70 border-dashed",
}

function RiskStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={RISK_STATUS_CLASS[status] ?? ""}>
      {status}
    </Badge>
  )
}

const columns: ColumnDef<Alert>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={
            table.getIsSomePageRowsSelected() &&
            !table.getIsAllPageRowsSelected()
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div
        className="flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "client",
    header: "Client",
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground">{row.original.client}</span>
        <span className="text-xs text-muted-foreground">
          {row.original.sector} · {row.original.jurisdiction}
        </span>
      </div>
    ),
    enableHiding: false,
  },
  {
    accessorKey: "relationship",
    header: "Relationship",
    cell: ({ row }) => (
      <Badge variant="secondary" className="font-normal">
        {row.original.relationship}
      </Badge>
    ),
  },
  {
    accessorKey: "currentRisk",
    header: "Risk Drift",
    cell: ({ row }) => (
      <RiskDrift from={row.original.originalRisk} to={row.original.currentRisk} />
    ),
  },
  {
    accessorKey: "severity",
    header: "Priority",
    cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
  },
  {
    accessorKey: "trigger",
    header: "Main Drift",
    cell: ({ row }) => (
      <div className="flex max-w-80 flex-col gap-1">
        <Badge variant="outline" className="w-fit px-1.5 text-muted-foreground">
          {row.original.signal}
        </Badge>
        <span className="truncate text-muted-foreground" title={row.original.trigger}>
          {row.original.trigger}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="flex size-8 text-muted-foreground data-open:bg-muted"
              size="icon"
            />
          }
        >
          <EllipsisVerticalIcon />
          <span className="sr-only">Open menu</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => toast.success(`Escalated ${row.original.client}`)}>
            Escalate to compliance
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toast(`Marked ${row.original.client} in review`)}>
            Mark in review
          </DropdownMenuItem>
          <DropdownMenuItem>Assign analyst</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => toast(`Dismissed alert for ${row.original.client}`)}
          >
            Dismiss alert
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    ),
  },
]

export function DataTable({ data }: { data: Alert[] }) {
  const [activeTab, setActiveTab] = React.useState("all")
  const [selected, setSelected] = React.useState<Alert | null>(null)
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  })

  const counts = React.useMemo(() => {
    const by = (status: string) =>
      data.filter((d) => d.status === status).length
    return {
      all: data.length,
      "needs-action": by("New"),
      "in-review": by("In Review"),
      escalated: by("Escalated"),
      cleared: by("Cleared"),
    }
  }, [data])

  const filteredData = React.useMemo(() => {
    if (activeTab === "all") return data
    return data.filter((d) => d.status === STATUS_BY_TAB[activeTab])
  }, [activeTab, data])

  function changeTab(value: string) {
    setActiveTab(value)
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination,
    },
    getRowId: (row) => row.id.toString(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  return (
    <Tabs
      value={activeTab}
      onValueChange={changeTab}
      className="w-full flex-col justify-start gap-6"
    >
      <div className="flex items-center justify-between px-4 lg:px-6">
        <Label htmlFor="view-selector" className="sr-only">
          View
        </Label>
        <Select value={activeTab} onValueChange={(value) => value && changeTab(value)}>
          <SelectTrigger
            className="flex w-fit @4xl/main:hidden"
            size="sm"
            id="view-selector"
          >
            <SelectValue placeholder="Select a view" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All Flagged</SelectItem>
              <SelectItem value="needs-action">Needs Action</SelectItem>
              <SelectItem value="in-review">In Review</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
              <SelectItem value="cleared">Cleared</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <TabsList className="hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:bg-muted-foreground/30 **:data-[slot=badge]:px-1 @4xl/main:flex">
          <TabsTrigger value="all">
            All Flagged <Badge variant="secondary">{counts.all}</Badge>
          </TabsTrigger>
          <TabsTrigger value="needs-action">
            Needs Action <Badge variant="secondary">{counts["needs-action"]}</Badge>
          </TabsTrigger>
          <TabsTrigger value="in-review">
            In Review <Badge variant="secondary">{counts["in-review"]}</Badge>
          </TabsTrigger>
          <TabsTrigger value="escalated">
            Escalated <Badge variant="secondary">{counts.escalated}</Badge>
          </TabsTrigger>
          <TabsTrigger value="cleared">
            Cleared <Badge variant="secondary">{counts.cleared}</Badge>
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <Columns3Icon data-icon="inline-start" />
              <span className="hidden lg:inline">Columns</span>
              <ChevronDownIcon data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== "undefined" &&
                    column.getCanHide()
                )
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id} colSpan={header.colSpan}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    onClick={() => setSelected(row.original)}
                    className="cursor-pointer"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No alerts in this view.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between px-4">
          <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
            {table.getFilteredSelectedRowModel().rows.length} of{" "}
            {table.getFilteredRowModel().rows.length} alert(s) selected.
          </div>
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor="rows-per-page" className="text-sm font-medium">
                Rows per page
              </Label>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value))
                }}
              >
                <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                  <SelectValue
                    placeholder={table.getState().pagination.pageSize}
                  />
                </SelectTrigger>
                <SelectContent side="top">
                  <SelectGroup>
                    {[10, 20, 30, 40, 50].map((pageSize) => (
                      <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to first page</span>
                <ChevronsLeftIcon />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to previous page</span>
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to next page</span>
                <ChevronRightIcon />
              </Button>
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to last page</span>
                <ChevronsRightIcon />
              </Button>
            </div>
          </div>
        </div>
      </div>
      <AlertDetailDrawer
        item={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      />
    </Tabs>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <div className="text-sm">{children}</div>
    </div>
  )
}

function AlertDetailDrawer({
  item,
  onOpenChange,
}: {
  item: Alert | null
  onOpenChange: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  if (!item) return null
  return (
    <Drawer
      open={!!item}
      onOpenChange={onOpenChange}
      direction={isMobile ? "bottom" : "right"}
    >
      <DrawerContent>
        <DrawerHeader className="gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={item.severity} />
            <StatusBadge status={item.status} />
            <Badge variant="secondary" className="font-normal">
              {item.relationship}
            </Badge>
          </div>
          <DrawerTitle>{item.client}</DrawerTitle>
          <DrawerDescription>
            {item.sector} · {item.jurisdiction}
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-4 text-sm">
          <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                KYC drift detected
              </span>
              <Badge variant="outline" className="text-muted-foreground">
                {item.signal}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <DetailRow label="Risk drift">
                <div className="flex items-center gap-2">
                  <RiskDrift from={item.originalRisk} to={item.currentRisk} />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    ({item.riskScore}/100)
                  </span>
                </div>
              </DetailRow>
              <DetailRow label="Confidence">
                <span className="tabular-nums">{Math.round(item.confidence * 100)}%</span>
              </DetailRow>
              <DetailRow label="Pipeline tier">
                <Badge variant="outline" className="text-muted-foreground">
                  {item.tier}
                </Badge>
              </DetailRow>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Recommended action
              </span>
              <p className="rounded-md border-l-2 border-amber-600/60 bg-background px-3 py-2">
                {item.action}
              </p>
            </div>
          </div>

          <DetailRow label="Risk breakdown">
            <div className="grid gap-2">
              {item.riskBreakdown.map((r, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">{r.type}</span>
                    <span className="text-xs text-muted-foreground">{r.reason}</span>
                  </div>
                  <RiskStatusBadge status={r.status} />
                </div>
              ))}
            </div>
          </DetailRow>

          <div className="grid grid-cols-1 gap-4 rounded-lg border p-3 sm:grid-cols-2">
            <DetailRow label="KYC baseline (Layer 2)">
              <p className="text-muted-foreground">{item.baseline}</p>
            </DetailRow>
            <DetailRow label="Detected signal (Layer 1)">
              <p>{item.observed}</p>
            </DetailRow>
          </div>

          <DetailRow label="Why this fired">
            <p className="text-muted-foreground">{item.reasoning}</p>
          </DetailRow>

          <Separator />

          <DetailRow label={`Source citations (${item.sources})`}>
            <ul className="flex flex-col gap-2">
              {item.citations.map((c, i) => (
                <li key={i} className="flex flex-col">
                  <span>{c.headline}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.source} · {c.date}
                  </span>
                </li>
              ))}
            </ul>
          </DetailRow>
        </div>
        <DrawerFooter>
          <Button onClick={() => toast.success(`Escalated ${item.client} to compliance`)}>
            Escalate to compliance
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => toast(`Marked ${item.client} in review`)}
            >
              Mark in review
            </Button>
            <Button
              variant="outline"
              onClick={() => toast(`Dismissed alert for ${item.client}`)}
            >
              Dismiss
            </Button>
          </div>
          <DrawerClose asChild>
            <Button variant="ghost">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

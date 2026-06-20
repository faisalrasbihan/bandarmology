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
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import { toast } from "sonner"
import { z } from "zod"

import { useIsMobile } from "@/hooks/use-mobile"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { EscalateDialog } from "@/components/escalate-dialog"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { exposureAtRisk, formatMoney } from "@/lib/format"
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
import Link from "next/link"
import { EllipsisVerticalIcon, Columns3Icon, ChevronDownIcon, ChevronUpIcon, ChevronsUpDownIcon, ChevronsLeftIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsRightIcon, SearchIcon, XIcon } from "lucide-react"

import {
  initials,
  RiskDrift,
  RiskStatusBadge,
  SeverityBadge,
  StatusBadge,
} from "@/components/risk-badges"

export const schema = z.object({
  id: z.number(),
  client: z.string(),
  sector: z.string(),
  jurisdiction: z.string(),
  relationship: z.string(),
  flagged: z.boolean(),
  exposureUsd: z.number(),
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

export type Alert = z.infer<typeof schema>

// Tab value -> the status it filters the worklist to.
const STATUS_BY_TAB: Record<string, string> = {
  "needs-action": "New",
  "in-review": "In Review",
  escalated: "Escalated",
  cleared: "Cleared",
}

const SEVERITY_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 }
const STATUS_RANK: Record<string, number> = { New: 4, Escalated: 3, "In Review": 2, Cleared: 1 }

function SortHeader({ column, label }: { column: Column<Alert, unknown>; label: string }) {
  const sorted = column.getIsSorted()
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-7 px-2 text-muted-foreground hover:text-foreground"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {label}
      {sorted === "asc" ? (
        <ChevronUpIcon className="size-3.5" />
      ) : sorted === "desc" ? (
        <ChevronDownIcon className="size-3.5" />
      ) : (
        <ChevronsUpDownIcon className="size-3.5 opacity-50" />
      )}
    </Button>
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
    header: ({ column }) => <SortHeader column={column} label="Client" />,
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
    filterFn: "equalsString",
    cell: ({ row }) => (
      <Badge variant="secondary" className="font-normal">
        {row.original.relationship}
      </Badge>
    ),
  },
  {
    accessorKey: "exposureUsd",
    header: ({ column }) => <SortHeader column={column} label="Exposure" />,
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5 tabular-nums">
        <span className="font-medium">{formatMoney(row.original.exposureUsd)}</span>
        <span className="text-xs text-muted-foreground">
          {formatMoney(exposureAtRisk(row.original.exposureUsd, row.original.riskScore))} at risk
        </span>
      </div>
    ),
  },
  {
    accessorKey: "currentRisk",
    header: ({ column }) => <SortHeader column={column} label="Risk Drift" />,
    sortingFn: (a, b) => a.original.riskScore - b.original.riskScore,
    cell: ({ row }) => (
      <RiskDrift from={row.original.originalRisk} to={row.original.currentRisk} />
    ),
  },
  {
    accessorKey: "severity",
    header: ({ column }) => <SortHeader column={column} label="Priority" />,
    filterFn: "equalsString",
    sortingFn: (a, b) =>
      (SEVERITY_RANK[a.original.severity] ?? 0) - (SEVERITY_RANK[b.original.severity] ?? 0),
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
    header: ({ column }) => <SortHeader column={column} label="Status" />,
    sortingFn: (a, b) =>
      (STATUS_RANK[a.original.status] ?? 0) - (STATUS_RANK[b.original.status] ?? 0),
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
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => toast.success(`Escalated ${row.original.client}`)}>
            Escalate
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => toast.success(`Added ${row.original.client} to watchlist`)}
          >
            Put on watchlist
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => toast(`Dismissed alert for ${row.original.client}`)}
          >
            Dismiss
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

  const selectedCount = Object.keys(rowSelection).length

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
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search client…"
              value={(table.getColumn("client")?.getFilterValue() as string) ?? ""}
              onChange={(e) =>
                table.getColumn("client")?.setFilterValue(e.target.value)
              }
              className="h-8 w-44 pl-7"
            />
          </div>
          <Select
            value={(table.getColumn("severity")?.getFilterValue() as string) ?? "all"}
            onValueChange={(v) =>
              table.getColumn("severity")?.setFilterValue(!v || v === "all" ? undefined : v)
            }
          >
            <SelectTrigger size="sm" className="w-[140px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="Critical">Critical</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={(table.getColumn("relationship")?.getFilterValue() as string) ?? "all"}
            onValueChange={(v) =>
              table.getColumn("relationship")?.setFilterValue(!v || v === "all" ? undefined : v)
            }
          >
            <SelectTrigger size="sm" className="w-[150px]">
              <SelectValue placeholder="Relationship" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All relationships</SelectItem>
                <SelectItem value="Payments">Payments</SelectItem>
                <SelectItem value="Custody">Custody</SelectItem>
                <SelectItem value="Lending">Lending</SelectItem>
                <SelectItem value="Trading">Trading</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          {columnFilters.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setColumnFilters([])}>
              Clear
              <XIcon data-icon="inline-end" />
            </Button>
          )}
        </div>
        {selectedCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <span className="text-sm font-medium">{selectedCount} selected</span>
            <Separator orientation="vertical" className="h-4" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                toast.success(`Escalated ${selectedCount} alert(s)`)
                table.resetRowSelection()
              }}
            >
              Escalate
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                toast.success(`Added ${selectedCount} client(s) to watchlist`)
                table.resetRowSelection()
              }}
            >
              Put on watchlist
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                toast(`Dismissed ${selectedCount} alert(s)`)
                table.resetRowSelection()
              }}
            >
              Dismiss
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => table.resetRowSelection()}
            >
              Clear selection
            </Button>
          </div>
        )}
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
      <DrawerContent className="sm:max-w-2xl">
        <DrawerHeader className="gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="size-12 shrink-0">
              <AvatarFallback className="bg-primary/10 text-sm font-semibold text-foreground">
                {initials(item.client)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={item.severity} />
                <StatusBadge status={item.status} />
                <Badge variant="secondary" className="font-normal">
                  {item.relationship}
                </Badge>
              </div>
              <DrawerTitle>{item.client}</DrawerTitle>
            </div>
          </div>
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
              <DetailRow label="Exposure">
                <span className="tabular-nums">{formatMoney(item.exposureUsd)}</span>
              </DetailRow>
              <DetailRow label="At risk">
                <span className="tabular-nums">
                  {formatMoney(exposureAtRisk(item.exposureUsd, item.riskScore))}
                </span>
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
          <Button nativeButton={false} render={<Link href={`/clients/${item.id}`} />}>
            View full profile
          </Button>
          <div className="grid grid-cols-3 gap-2">
            <EscalateDialog
              client={item.client}
              defaultAction={item.action}
              trigger={<Button variant="outline" className="w-full">Escalate</Button>}
            />
            <Button
              variant="outline"
              onClick={() => toast.success(`Added ${item.client} to watchlist`)}
            >
              Watchlist
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

"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronRightIcon, SearchIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { initials, RiskDrift, StatusBadge } from "@/components/risk-badges"
import type { ClientRecord } from "@/components/client-profile"

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border px-4 py-3">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

export function ClientsTable({ clients }: { clients: ClientRecord[] }) {
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [relationship, setRelationship] = React.useState("all")
  const [book, setBook] = React.useState("all")

  const filtered = clients.filter((c) => {
    const q = query.toLowerCase()
    const matchesQuery =
      c.client.toLowerCase().includes(q) || c.sector.toLowerCase().includes(q)
    const matchesRel = relationship === "all" || c.relationship === relationship
    const matchesBook =
      book === "all" || (book === "flagged" ? c.flagged : !c.flagged)
    return matchesQuery && matchesRel && matchesBook
  })

  return (
    <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Clients</h1>
        <p className="text-sm text-muted-foreground">
          All onboarded AMINA clients — select one to open its full risk profile.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:max-w-md">
        <Stat label="Total clients" value={clients.length} />
        <Stat label="Flagged" value={clients.filter((c) => c.flagged).length} />
        <Stat label="Monitored" value={clients.filter((c) => !c.flagged).length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search client or sector…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-56 pl-7"
          />
        </div>
        <Select value={relationship} onValueChange={(v) => v && setRelationship(v)}>
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
        <Select value={book} onValueChange={(v) => v && setBook(v)}>
          <SelectTrigger size="sm" className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All clients</SelectItem>
              <SelectItem value="flagged">Flagged</SelectItem>
              <SelectItem value="monitored">Monitored</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} of {clients.length}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Relationship</TableHead>
              <TableHead>Jurisdiction</TableHead>
              <TableHead>Onboarded</TableHead>
              <TableHead>Risk Drift</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? (
              filtered.map((c) => (
                <TableRow
                  key={c.id}
                  onClick={() => router.push(`/clients/${c.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-foreground">
                          {initials(c.client)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground">{c.client}</span>
                        <span className="text-xs text-muted-foreground">{c.sector}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {c.relationship}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.jurisdiction}</TableCell>
                  <TableCell className="text-muted-foreground">{c.kyc.onboarded}</TableCell>
                  <TableCell>
                    <RiskDrift from={c.originalRisk} to={c.currentRisk} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell>
                    <ChevronRightIcon className="size-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No clients match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { logAudit } from "@/lib/audit-log"

const ESCALATION_TYPES = [
  "AML investigation",
  "Sanctions review",
  "Compliance review",
  "Enhanced due diligence",
  "Re-KYC refresh",
]

const ROUTES = ["Compliance team", "AML / Financial Crime", "Sanctions desk", "MLRO"]

const URGENCIES = ["Immediate", "Within 24 hours", "This week"]

export function EscalateDialog({
  client,
  clientId,
  severity,
  defaultAction,
  source,
  trigger,
  onEscalated,
}: {
  client: string
  clientId?: number
  severity?: string
  defaultAction: string
  source?: string
  trigger: React.ReactElement
  onEscalated?: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [type, setType] = React.useState(ESCALATION_TYPES[0])
  const [route, setRoute] = React.useState(ROUTES[0])
  const [urgency, setUrgency] = React.useState(URGENCIES[0])

  function submit() {
    setOpen(false)
    logAudit({
      action: "Escalated",
      entity: client,
      clientId,
      severity,
      detail: `${type} → ${route} · ${urgency}`,
      source,
    })
    toast.success(`Escalation routed to ${route}`, {
      description: `${type} · ${urgency} · ${client}`,
    })
    onEscalated?.()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escalate {client}</DialogTitle>
          <DialogDescription>
            Route this alert to the right team with the context they need to act.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="esc-type">Escalation type</Label>
            <Select value={type} onValueChange={(v) => v && setType(v)}>
              <SelectTrigger id="esc-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ESCALATION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="esc-route">Route to</Label>
              <Select value={route} onValueChange={(v) => v && setRoute(v)}>
                <SelectTrigger id="esc-route" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ROUTES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="esc-urgency">Urgency</Label>
              <Select value={urgency} onValueChange={(v) => v && setUrgency(v)}>
                <SelectTrigger id="esc-urgency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {URGENCIES.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="esc-info">New information for reviewers</Label>
            <Textarea
              id="esc-info"
              placeholder="Anything not already in the alert — calls, documents, related accounts…"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="esc-action">Recommended action for higher-ups</Label>
            <Textarea id="esc-action" defaultValue={defaultAction} className="min-h-20" />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={submit}>Submit escalation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

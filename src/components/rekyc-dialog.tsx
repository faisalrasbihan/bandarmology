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

const SCOPES = [
  "Full refresh",
  "Beneficial ownership only",
  "Source of funds / wealth",
  "Sanctions & PEP rescreen",
]

const URGENCIES = ["Immediate", "Within 30 days", "Next periodic review"]

export function RekycDialog({ client }: { client: string }) {
  const [open, setOpen] = React.useState(false)
  const [scope, setScope] = React.useState(SCOPES[0])
  const [urgency, setUrgency] = React.useState(URGENCIES[0])
  const [submittedAt, setSubmittedAt] = React.useState<Date | null>(null)

  function submit() {
    setOpen(false)
    setSubmittedAt(new Date())
    toast.success(`Re-KYC initiated for ${client}`, {
      description: `${scope} · ${urgency}`,
    })
  }

  // Once requested, the button is disabled and the submission time is shown
  // below it.
  if (submittedAt) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button variant="outline" disabled className="text-muted-foreground">
          Re-KYC in progress
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          Requested{" "}
          {submittedAt.toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Trigger Re-KYC</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Trigger Re-KYC for {client}</DialogTitle>
          <DialogDescription>
            Request a refreshed KYC review. This proposes the refresh to the onboarding
            team — it does not change the client&apos;s rating on its own.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rekyc-scope">Refresh scope</Label>
              <Select value={scope} onValueChange={(v) => v && setScope(v)}>
                <SelectTrigger id="rekyc-scope" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {SCOPES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rekyc-urgency">Urgency</Label>
              <Select value={urgency} onValueChange={(v) => v && setUrgency(v)}>
                <SelectTrigger id="rekyc-urgency" className="w-full">
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
            <Label htmlFor="rekyc-note">Reason for refresh</Label>
            <Textarea
              id="rekyc-note"
              placeholder="What triggered this — the detected signals, drift, or new information…"
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={submit}>Confirm Re-KYC</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

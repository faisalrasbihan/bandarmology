"use client"

import { PanelLeftCloseIcon, PanelLeftIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"

/**
 * Explicit hide/show control for the sidebar (which starts hidden so content
 * gets full width). Lives in the header; the Bandarmology branding stays in the
 * sidebar itself so it isn't shown twice.
 */
export function SidebarToggle() {
  const { open, toggleSidebar } = useSidebar()
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleSidebar}
      aria-label={open ? "Hide menu" : "Show menu"}
      aria-pressed={open}
      className="-ml-1 gap-2 text-muted-foreground"
    >
      {open ? <PanelLeftCloseIcon className="size-4" /> : <PanelLeftIcon className="size-4" />}
      <span className="text-sm font-medium">Menu</span>
    </Button>
  )
}

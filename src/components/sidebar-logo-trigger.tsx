"use client"

import { useSidebar } from "@/components/ui/sidebar"

/**
 * The Bandarmology logo in the header doubles as the sidebar control: the
 * sidebar is hidden by default so the content gets full width, and clicking the
 * logo reveals it (it then auto-hides — see app-sidebar.tsx). Hovering the left
 * edge of the screen reveals it too.
 */
export function SidebarLogoTrigger() {
  const { toggleSidebar } = useSidebar()
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label="Toggle navigation"
      title="Menu"
      className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <img src="/bandar2.svg" alt="Bandarmology" className="size-5" />
      <span className="text-base font-semibold">Bandarmology</span>
    </button>
  )
}

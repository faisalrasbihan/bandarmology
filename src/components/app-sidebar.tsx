"use client"

import * as React from "react"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

// How long the sidebar stays open after the pointer leaves it before it
// auto-hides, giving the content area back its full width.
const AUTO_HIDE_MS = 2500
import { LayoutDashboardIcon, UsersIcon, BellIcon, FolderSearchIcon, ShieldAlertIcon, ScrollTextIcon, Settings2Icon, CircleHelpIcon } from "lucide-react"

const data = {
  user: {
    name: "Hans Muller",
    email: "hans.muller@amina.example",
    avatar: "/avatars/analyst.jpg",
  },
  navMain: [
    {
      title: "Risk Dashboard",
      url: "/",
      icon: <LayoutDashboardIcon />,
    },
    {
      title: "Clients",
      url: "/clients",
      icon: <UsersIcon />,
    },
    {
      title: "Alerts",
      url: "/alerts",
      icon: <BellIcon />,
    },
    {
      title: "Investigations",
      url: "/investigation",
      icon: <FolderSearchIcon />,
    },
    {
      title: "Watchlists",
      url: "/watchlist",
      icon: <ShieldAlertIcon />,
    },
    {
      title: "Audit Log",
      url: "/audit-log",
      icon: <ScrollTextIcon />,
    },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "#",
      icon: <Settings2Icon />,
    },
    {
      title: "Get Help",
      url: "#",
      icon: <CircleHelpIcon />,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { open, setOpen, isMobile } = useSidebar()
  const [hovered, setHovered] = React.useState(false)

  // Seamless auto-hide: once open and not being hovered, collapse after a
  // short delay. Hovering cancels it (the effect re-runs and clears the timer);
  // leaving restarts it. Disabled on mobile, where the sidebar is a sheet.
  React.useEffect(() => {
    if (isMobile || !open || hovered) return
    const t = window.setTimeout(() => setOpen(false), AUTO_HIDE_MS)
    return () => window.clearTimeout(t)
  }, [open, hovered, isMobile, setOpen])

  return (
    <>
      {/* Thin left-edge hover zone — reveals the sidebar without a click. */}
      {!isMobile && (
        <div
          aria-hidden
          onMouseEnter={() => setOpen(true)}
          className={`fixed inset-y-0 left-0 z-30 hidden w-2.5 md:block ${open ? "pointer-events-none" : ""}`}
        />
      )}
      <Sidebar
        collapsible="offcanvas"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        {...props}
      >
        <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<a href="/" />}
            >
              <img src="/bandar2.svg" alt="Bandarmology" className="size-5!" />
              <span className="text-base font-semibold">Bandarmology</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      </Sidebar>
    </>
  )
}

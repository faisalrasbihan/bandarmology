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
} from "@/components/ui/sidebar"
import { LayoutDashboardIcon, UsersIcon, BellIcon, FolderSearchIcon, ShieldAlertIcon, ScrollTextIcon, Settings2Icon, CircleHelpIcon, ShieldIcon } from "lucide-react"

const data = {
  user: {
    name: "Risk Analyst",
    email: "risk@amina.example",
    avatar: "/avatars/analyst.jpg",
  },
  navMain: [
    {
      title: "Risk Dashboard",
      url: "#",
      icon: <LayoutDashboardIcon />,
    },
    {
      title: "Clients",
      url: "#",
      icon: <UsersIcon />,
    },
    {
      title: "Alerts",
      url: "#",
      icon: <BellIcon />,
    },
    {
      title: "Investigations",
      url: "#",
      icon: <FolderSearchIcon />,
    },
    {
      title: "Watchlists",
      url: "#",
      icon: <ShieldAlertIcon />,
    },
    {
      title: "Audit Log",
      url: "#",
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
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<a href="#" />}
            >
              <ShieldIcon className="size-5!" />
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
  )
}

"use client";

import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>BM</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              bandarmology
            </h1>
            <p className="text-sm text-muted-foreground">
              Next.js + shadcn/ui starter
            </p>
          </div>
        </div>
        <Badge variant="secondary">v0.1.0</Badge>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Components are wired up</CardTitle>
          <CardDescription>
            A few shadcn/ui primitives to confirm everything works.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Type something…" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => toast.success("It works! 🎉")}>
              Show toast
            </Button>

            <Dialog>
              <DialogTrigger render={<Button variant="outline" />}>
                Open dialog
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Hello from a dialog</DialogTitle>
                  <DialogDescription>
                    This is a shadcn/ui Dialog component.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button>Got it</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" />}>
                Menu
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Profile</DropdownMenuItem>
                <DropdownMenuItem>Settings</DropdownMenuItem>
                <DropdownMenuItem variant="destructive">
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            Edit{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              src/app/page.tsx
            </code>{" "}
            to get started.
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}

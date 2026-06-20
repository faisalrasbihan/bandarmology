import { writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { buildClientRecords } from "@/server/dashboard";

// POST /api/dashboard/snapshot — rebuild the client book from the DB and write
// it to src/app/data.json, the static file the (unchanged) frontend imports.
// This is the connect-backend-to-frontend seam: the UI keeps importing a JSON
// file; this endpoint makes that file reflect real backend state on demand.
export async function POST() {
  const clients = await buildClientRecords();
  const target = path.join(process.cwd(), "src", "app", "data.json");
  await writeFile(target, JSON.stringify(clients, null, 2) + "\n", "utf8");
  return NextResponse.json({
    written: target,
    clients: clients.length,
    flagged: clients.filter((c) => c.flagged).length,
  });
}

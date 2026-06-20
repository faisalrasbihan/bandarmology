import { writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { buildClientRecords } from "@/server/dashboard";
import { buildInvestigation, type InvestigationView } from "@/server/investigation";

// POST /api/dashboard/snapshot — rebuild the client book AND the per-client
// investigation views from the DB and write them to static JSON files
// (src/app/data.json and src/app/investigations.json) that the frontend imports.
// This is the connect-backend-to-frontend seam: the UI reads JSON, this endpoint
// makes that JSON reflect real backend state on demand. Snapshotting the
// investigation views (rather than fetching them live per page view) means the
// Investigations page works in any deployment without a live DB connection —
// the same build-time-snapshot model every other page already uses.
export async function POST() {
  const clients = await buildClientRecords();
  const dataTarget = path.join(process.cwd(), "src", "app", "data.json");
  await writeFile(dataTarget, JSON.stringify(clients, null, 2) + "\n", "utf8");

  // One investigation view per client, keyed by entity name (sequential to stay
  // under the DB pool limit).
  const investigations: Record<string, InvestigationView> = {};
  for (const c of clients) {
    investigations[c.client] = await buildInvestigation(c.client);
  }
  const invTarget = path.join(process.cwd(), "src", "app", "investigations.json");
  await writeFile(invTarget, JSON.stringify(investigations, null, 2) + "\n", "utf8");

  return NextResponse.json({
    written: [dataTarget, invTarget],
    clients: clients.length,
    flagged: clients.filter((c) => c.flagged).length,
    investigations: Object.keys(investigations).length,
    withActivity: Object.values(investigations).filter((v) => v.hasActivity).length,
  });
}

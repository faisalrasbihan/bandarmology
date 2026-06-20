import { NextRequest, NextResponse } from "next/server";
import { getExposureEdges, PUBLIC_TAG_TYPES, type PublicTagType } from "@/server/exposure";

// GET /api/exposures[?entityName=Name][&tagType=director] — list the public
// exposure graph edges (Layer 1). Ownership/UBO is NOT here by design — that's
// Layer 2 (KYC baseline).
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const entityName = sp.get("entityName") ?? undefined;
  const tagTypeRaw = sp.get("tagType");
  if (tagTypeRaw && !PUBLIC_TAG_TYPES.includes(tagTypeRaw as PublicTagType)) {
    return NextResponse.json({ error: `tagType must be one of: ${PUBLIC_TAG_TYPES.join(", ")}` }, { status: 400 });
  }
  const edges = await getExposureEdges({ entityName, tagType: (tagTypeRaw as PublicTagType) ?? undefined });
  return NextResponse.json({ edges });
}

import { NextResponse } from "next/server";

import { getAdminAnalytics } from "@/lib/admin/analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const analytics = await getAdminAnalytics();
    return NextResponse.json(analytics, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

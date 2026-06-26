import { NextRequest, NextResponse } from "next/server";
import { processAlerts } from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scheduled by vercel.json. Vercel injects `Authorization: Bearer <CRON_SECRET>`
// when CRON_SECRET is set; we verify it so the endpoint isn't publicly runnable.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Forbidden", { status: 401 });
  }
  const result = await processAlerts();
  return NextResponse.json({ ok: true, ...result });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifySignature,
  extractTextMessages,
  parseMessage,
  ingestParsedMessage,
} from "@/lib/whatsapp";

export const runtime = "nodejs";

// Webhook verification (Meta calls this once when you set the callback URL).
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// Incoming messages.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifySignature(raw, signature)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  const texts = extractTextMessages(payload);

  for (const text of texts) {
    const parsed = parseMessage(text);
    try {
      const result = await ingestParsedMessage(parsed);
      await prisma.whatsAppLog.create({
        data: {
          rawPayload: { text },
          parsed: { ...parsed },
          status: result.ok ? "ok" : "error",
          error: result.ok ? null : result.error,
        },
      });
    } catch (err) {
      await prisma.whatsAppLog.create({
        data: {
          rawPayload: { text },
          parsed: { ...parsed },
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        },
      });
    }
  }

  // Always 200 so Meta doesn't retry indefinitely.
  return NextResponse.json({ received: texts.length });
}

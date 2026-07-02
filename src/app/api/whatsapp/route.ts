import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifySignature,
  extractMessages,
  parseMessage,
  ingestParsedMessage,
  handleQueryCommand,
  sendWhatsApp,
} from "@/lib/whatsapp";
import { notifyTaskLinked } from "@/lib/task-notify";

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

  const messages = extractMessages(payload);

  for (const { from, text } of messages) {
    // Query command (e.g. "x") → reply with pending tasks instead of ingesting.
    try {
      const reply = await handleQueryCommand(text, from);
      if (reply !== null) {
        await sendWhatsApp(from, reply);
        await prisma.whatsAppLog.create({
          data: {
            rawPayload: { from, text },
            parsed: { command: "query" },
            status: "ok",
            error: null,
          },
        });
        continue;
      }
    } catch (err) {
      await prisma.whatsAppLog.create({
        data: {
          rawPayload: { from, text },
          parsed: { command: "query" },
          status: "error",
          error: err instanceof Error ? err.message : "Query failed",
        },
      });
      continue;
    }

    const parsed = parseMessage(text);
    try {
      const result = await ingestParsedMessage(parsed, from);
      await prisma.whatsAppLog.create({
        data: {
          rawPayload: { from, text },
          parsed: {
            ...parsed,
            ...(result.ok ? { placement: result.placement } : {}),
          },
          status: result.ok ? "ok" : "error",
          error: result.ok ? null : result.error,
        },
      });
      if (result.ok && result.recipientIds.length) {
        after(() =>
          notifyTaskLinked(result.recipientIds, {
            actorName: result.actorName,
            tabId: result.tabId,
            taskText: result.description,
            taskId: result.taskId,
          }),
        );
      }
    } catch (err) {
      await prisma.whatsAppLog.create({
        data: {
          rawPayload: { from, text },
          parsed: { ...parsed },
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        },
      });
    }
  }

  // Always 200 so Meta doesn't retry indefinitely.
  return NextResponse.json({ received: messages.length });
}

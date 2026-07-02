import { describe, it, expect, vi } from "vitest";
import { parseMessage, normalizePhone } from "./whatsapp-parse";

// Stub heavy server-side modules so pure functions in whatsapp.ts are testable
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/access", () => ({ getMyTaskSections: vi.fn() }));
vi.mock("@/lib/alerts", () => ({ defaultDeadlines: vi.fn() }));

import { buildTemplatePayload } from "./whatsapp";

describe("parseMessage", () => {
  it("uses the first token as destination and the rest as description", () => {
    const r = parseMessage("mkt fix the logo");
    expect(r.firstToken).toBe("mkt");
    expect(r.description).toBe("fix the logo");
    expect(r.fullText).toBe("mkt fix the logo");
    expect(r.extraMentions).toEqual([]);
  });

  it("strips leading # and @ from the first token", () => {
    expect(parseMessage("#mkt do it").firstToken).toBe("mkt");
    expect(parseMessage("@sara call the client").firstToken).toBe("sara");
  });

  it("collects @mentions after the first token and drops them from the text", () => {
    const r = parseMessage("mkt fix logo @sara @jon");
    expect(r.extraMentions).toEqual(["sara", "jon"]);
    expect(r.description).toBe("fix logo");
    expect(r.fullText).toBe("mkt fix logo");
  });

  it("handles an empty message", () => {
    const r = parseMessage("   ");
    expect(r.firstToken).toBeNull();
    expect(r.fullText).toBe("");
    expect(r.description).toBe("");
  });
});

describe("normalizePhone", () => {
  it("keeps digits only", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("15551234567");
  });
  it("handles null/undefined", () => {
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone(undefined)).toBe("");
  });
});

describe("buildTemplatePayload", () => {
  it("builds a template message with body text parameters", () => {
    expect(
      buildTemplatePayload("15551234567", "task_linked", "en_US", [
        "Dana",
        "Marketing",
        "Buy milk",
      ]),
    ).toEqual({
      messaging_product: "whatsapp",
      to: "15551234567",
      type: "template",
      template: {
        name: "task_linked",
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Dana" },
              { type: "text", text: "Marketing" },
              { type: "text", text: "Buy milk" },
            ],
          },
        ],
      },
    });
  });

  it("handles an empty parameter list (no body params)", () => {
    const payload = buildTemplatePayload("15550000000", "t", "he", []);
    expect(
      (payload.template as { components: { parameters: unknown[] }[] })
        .components[0].parameters,
    ).toEqual([]);
  });
});

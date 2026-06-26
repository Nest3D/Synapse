import { describe, it, expect } from "vitest";
import { parseMessage, normalizePhone } from "./whatsapp-parse";

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

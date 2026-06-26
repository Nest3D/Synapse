// Pure WhatsApp message parsing — no DB, unit-tested in whatsapp.test.ts.

export type ParsedMessage = {
  /** First word (leading #/@ stripped) — the intended destination. */
  firstToken: string | null;
  /** Text after the first token (used when the first token is a destination). */
  description: string;
  /** Whole text minus @mentions (used when the first token isn't a destination). */
  fullText: string;
  /** Extra @mentions to also tag. */
  extraMentions: string[];
};

const strip = (t: string) => t.replace(/^[#@]+/, "");

/**
 * Parse a WhatsApp message. The first word is the destination alias (a brood or
 * a member); the rest is the task. Any @mention after the first word is an extra
 * person to tag.
 *   "mkt fix the logo @sara" -> first "mkt", desc "fix the logo", mentions ["sara"]
 */
export function parseMessage(text: string): ParsedMessage {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { firstToken: null, description: "", fullText: "", extraMentions: [] };
  }

  const extraMentions: string[] = [];
  const rest: string[] = [];
  for (const t of tokens.slice(1)) {
    if (t.startsWith("@")) extraMentions.push(strip(t));
    else rest.push(t);
  }

  return {
    firstToken: strip(tokens[0]),
    description: rest.join(" "),
    fullText: [tokens[0], ...rest].join(" "),
    extraMentions,
  };
}

/** Phone numbers to digits only, for matching the inbound `from` to a User. */
export function normalizePhone(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

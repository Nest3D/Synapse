// Outbound email via Resend (https://resend.com). No-ops when RESEND_API_KEY
// isn't configured, so the rest of the app keeps working.

const FROM = process.env.EMAIL_FROM ?? "Synapse <onboarding@resend.dev>";

export async function sendEmail(
  to: string[],
  subject: string,
  html: string,
): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const recipients = [...new Set(to.filter(Boolean))];
  if (!key || recipients.length === 0) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: recipients, subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

import { after } from "next/server";

import { serverEnv } from "@/lib/env";

export type EmailMessage = { to: string; subject: string; text: string };

type EmailSettings = { apiKey: string; from: string };

function settings(): EmailSettings | null {
  const apiKey = serverEnv.RESEND_API_KEY;
  const from = serverEnv.EMAIL_FROM;
  return apiKey && from ? { apiKey, from } : null;
}

/** Whether transactional email can be sent from this deployment. */
export function emailConfigured() {
  return settings() !== null;
}

/**
 * Send one plain-text email through Resend. Returns whether it was accepted.
 * It never throws and never logs an address, subject or body: a failed
 * notification must not break the action that triggered it.
 */
export async function sendEmail(
  message: EmailMessage,
  transport: typeof fetch = fetch,
  configured: EmailSettings | null = settings(),
): Promise<boolean> {
  if (!configured) return false;
  try {
    const response = await transport("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${configured.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: configured.from, to: [message.to], subject: message.subject, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) console.error("email_send_failed", { status: response.status });
    return response.ok;
  } catch (error) {
    console.error("email_send_failed", { name: error instanceof Error ? error.name : typeof error });
    return false;
  }
}

/** Tell the owner about something that needs them. No-op when unconfigured. */
export async function notifyOwner(subject: string, text: string, transport: typeof fetch = fetch) {
  const to = serverEnv.OWNER_NOTIFICATION_EMAIL;
  if (!to) return false;
  return sendEmail({ to, subject, text }, transport);
}

/**
 * Alert the owner once the current response has been sent, so a slow mail
 * provider never delays a customer or a payment provider.
 */
export function notifyOwnerLater(subject: string, text: string) {
  const task = async () => { await notifyOwner(subject, text); };
  try {
    after(task);
  } catch {
    // Outside a request (a script or a test) there is nothing to wait for.
    void task();
  }
}

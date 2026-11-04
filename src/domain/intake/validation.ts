import { isIP } from "node:net";
import { z } from "zod";

import { FORM_VERSION, PRIVACY_VERSION } from "./constants";
export const goals = ["calls", "appointments", "enquiries", "other"] as const;

export function publicWebsite(value: string): string {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  // No DNS or HTTP requests occur during intake. All IP literals are excluded.
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
    isIP(host) || host.includes(":") || !host.includes(".") ||
    /(^|\.)(localhost|local|internal|test|invalid|example|onion|home|lan|arpa)$/.test(host)) {
    throw new Error("Use a public HTTPS business website without credentials or a custom port.");
  }
  url.hostname = host;
  url.hash = "";
  url.search = ""; // Do not retain query credentials or tracking data.
  return url.toString();
}

const plain = (max: number) => z.string().trim().min(1).max(max)
  .refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Remove control characters.");
const campaign = z.string().trim().max(80).regex(/^[\p{L}\p{N} ._/-]*$/u);
export const inquirySchema = z.object({
  contactName: plain(120),
  companyName: plain(160),
  email: z.string().trim().max(254).email(),
  website: z.string().trim().max(2048).transform((value, context) => {
    try { return publicWebsite(value); } catch {
      context.addIssue({ code: "custom", message: "Enter a public HTTPS website, such as https://yourbusiness.com." });
      return z.NEVER;
    }
  }),
  goal: z.enum(goals),
  note: z.string().trim().max(1000).default(""),
  acknowledgement: z.literal(true),
  formVersion: z.literal(FORM_VERSION),
  privacyVersion: z.literal(PRIVACY_VERSION),
  nonce: z.string().min(30).max(300),
  companyFax: z.literal(""),
  attribution: z.object({
    utm_source: campaign.optional(), utm_medium: campaign.optional(),
    utm_campaign: campaign.optional(), referral: campaign.optional(),
  }).strict().default({}),
}).strict();

export type Inquiry = z.infer<typeof inquirySchema>;

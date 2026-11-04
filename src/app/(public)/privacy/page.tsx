import Link from "next/link";
import { getIntakeConfig } from "@/server/intake-config";

export const dynamic = "force-dynamic";
export default function PrivacyPage() {
  const config = getIntakeConfig(process.env, false);
  return <main className="vl-wrap vl-section vl-document"><Link href="/">← Virelantic</Link><p className="vl-eyebrow">Version 2026-11-04</p><h1>Audit request privacy notice</h1>
    <p>{config?.PUBLIC_BUSINESS_NAME ?? "Virelantic"} uses the details in an audit request to review the website and service fit, respond about scope and next steps, and manage the enquiry. An enquiry does not subscribe you to marketing.</p>
    <h2>What is collected</h2><p>Your name, business, email, website, goal, optional note, acknowledgement, form and privacy versions, and submission time. We may save bounded source, medium, campaign and referral codes supplied with the page link. Website queries and fragments are removed. Please do not submit sensitive information, passwords or payment details.</p>
    <h2>Protection and providers</h2><p>Requests are stored in a restricted database on Neon and made available to authorized Virelantic operators. The hosting service processes network requests and operational logs. We use short-lived keyed fingerprints of network and email information to limit abuse; raw network addresses are not saved in the intake table. Infrastructure providers may process network information under their own service arrangements.</p>
    <h2>Retention and follow-up</h2><p>The intake copy expires after 90 days and is removed by scheduled daily cleanup. A request accepted into the sales pipeline becomes a separate business relationship record under the applicable client and business retention arrangements. We do not sell enquiry details or use this form to enroll you in a campaign. No automated receipt is sent by this form; an operator reviews and follows up.</p>
    <h2>Questions or a request to withdraw</h2>{config ? <p>Contact <a href={`mailto:${config.PUBLIC_CONTACT_EMAIL}`}>{config.PUBLIC_CONTACT_EMAIL}</a> to ask about your details, request correction or deletion, or withdraw your enquiry. We may verify your identity before sharing or changing personal information.</p> : <p>Intake remains closed until the business contact and operating configuration are supplied.</p>}
    <p><Link href="/#request">Back to the audit request</Link></p>
  </main>;
}

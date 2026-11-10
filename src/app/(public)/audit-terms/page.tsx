import Link from "next/link";
import { business } from "@/domain/intake/business";

export default function AuditTermsPage() {
  return <main className="vl-wrap vl-section vl-document"><Link href="/">← Virelantic</Link>
    <p className="vl-eyebrow">Digital Visibility Audit · November 4, 2026</p><h1>Service terms</h1>
    <p>Virelantic is operated by {business.seller}, from {business.location}. Initial service is for U.S. customers only. Contact <a href={`mailto:${business.email}`}>{business.email}</a>.</p>
    <h2>Scope before payment</h2><p>The audit is US$495, paid once before agreed work begins, plus any applicable tax identified in your offer. An enquiry does not place an order or authorize a charge, website edit, account connection or audit run.</p>
    <p>Before accepting an order, we agree in writing on the customer, website and pages, checks, deliverables, exclusions, required access, start and delivery dates, total price, taxes, payment schedule, review process and cancellation terms. Your signed scope and these terms form the service agreement. Additional work requires a written change agreed by both parties.</p>
    <h2>What you receive</h2><p>A manually reviewed written report identifies checked pages, evidence sources and observation dates, findings, practical priorities, limitations and unavailable evidence. Website clarity, search fundamentals, structured-data signals and the customer journey can be included as agreed. The audit includes no implementation, publishing, account changes or ongoing monitoring.</p>
    <h2>Delivery and concerns</h2><p>Your scope states how and when the report will be delivered and how to report a missing or incorrect deliverable. If a dependency or delay affects delivery, we discuss a revised date before proceeding. We review a scope issue with you and agree on correction or an appropriate refund. Review periods and any milestone allocation are written in your scope.</p>
    <h2>Authorization and tools</h2><p>You confirm that you control the website or have permission to authorize the scoped checks. We agree on necessary access first. Use delegated access or an agreed secure exchange; do not send passwords or confidential personal records through the enquiry form or ordinary email.</p>
    <p>A person reviews deliverables before delivery. Software or AI assistance, named tools, permitted data and approval steps must be disclosed in the scope before confidential material is processed. Search results and AI responses can change. We do not guarantee rankings, AI-answer inclusion, traffic, leads or revenue.</p>
    <h2>One private invoice</h2><p>After scope acceptance, the owner reviews a one-off invoice for the agreed order in Stripe. You choose whether to pay on Stripe’s hosted payment page. We do not collect card details on this website. There is no subscription, automatic future charge or automatic fulfillment. Paid work starts only after the owner verifies the exact invoice as paid in Stripe.</p>
    <h2>Your materials and report</h2><p>You retain rights in supplied materials and permit their use for the agreed service. You may use the final paid-for report and customer-specific deliverables for your business. Any source-file, code, third-party asset or reusable-method licensing is stated in your scope. We do not publish your results or testimonial without separate permission.</p>
    <h2>Cancellation and refunds</h2><p>The <Link href="/refunds">cancellation and refund policy</Link> forms part of your written scope. These terms do not remove rights that applicable law gives you.</p>
    <p><Link href="/privacy">Privacy notice</Link> · <Link href="/#request">Request an audit</Link></p>
  </main>;
}

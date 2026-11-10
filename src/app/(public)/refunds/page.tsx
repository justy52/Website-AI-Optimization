import Link from "next/link";
import { business } from "@/domain/intake/business";

export default function RefundsPage() {
  return <main className="vl-wrap vl-section vl-document">
    <Link href="/">← Virelantic</Link><p className="vl-eyebrow">One-time services · November 4, 2026</p>
    <h1>Cancellation and refunds</h1>
    <p>Provider: {business.seller}. For help, email <a href={`mailto:${business.email}`}>{business.email}</a> with your order reference and a short explanation. Do not include passwords, card numbers, bank details or identity documents.</p>
    <h2>Before ordering</h2><p>Your written offer identifies the service, total price in US dollars, applicable taxes, start and delivery dates, milestones and payment schedule. An enquiry is not an order.</p>
    <h2>If you cancel</h2><p>If you cancel before the agreed work begins, we refund the service amount paid for that work. If work has started, we stop further work where reasonably possible, identify completed work against the agreed scope and milestone prices, and propose a refund for the unperformed portion. Any deduction must be explained and tied to the agreed work. There is no blanket non-refundable deposit or cancellation penalty.</p>
    <h2>Missing or incorrect work</h2><p>Tell us which agreed deliverable is missing or incorrect. We review it with you and agree on correction or a fair refund for affected undelivered work. Limited website visibility is not, by itself, a failure to deliver an agreed evidence-based audit.</p>
    <p>If we cannot provide the service, we contact you about rescheduling or refunding the affected unperformed work. You do not have to accept a substitute service.</p>
    <h2>How refunds are returned</h2><p>Approved refunds use the original payment method when available. The payment provider controls when funds appear. We do not charge a cancellation fee or withhold processing fees unless clearly agreed and lawful.</p>
    <h2>No subscription</h2><p>The audit is a one-time service. Future ongoing work needs its own scope and billing consent. This policy does not limit rights or remedies provided by applicable law.</p>
    <p><Link href="/audit-terms">Service terms</Link> · <Link href="/#request">Request an audit</Link></p>
  </main>;
}

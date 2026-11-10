import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { AuditRequestForm } from "./request-form";
import { getIntakeConfig } from "@/server/intake-config";
import { business } from "@/domain/intake/business";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Virelantic | Know what to fix next",
  description: "A manually reviewed website and search fundamentals audit for U.S. businesses. US$495 one time, with scope and delivery date agreed before payment.",
  alternates: { canonical: "https://virelantic.com" },
};

const questions = [
  ["Does this request place an order?", "No. The Digital Visibility Audit is US$495 one time, plus any applicable tax identified in your offer. We agree the checks, exclusions, delivery date and terms before payment. After acceptance, the owner reviews a private Stripe invoice. This form takes no payment and creates no subscription."],
  ["What will you check?", "We agree the pages and evidence sources before work begins. Website clarity, search fundamentals, structured-data signals and the main customer journey can be included. Connected account data and specialist measurements are included only when access and scope are confirmed. The report identifies checked pages and dates, manual observations and unavailable evidence."],
  ["Will you make changes to my website?", "The audit provides findings and priorities. Implementation is quoted and authorized separately. You can share the recommendations with your current website provider."],
  ["What does AI readiness mean?", "It concerns how clearly your website explains your business and how accessible its information is. It does not guarantee inclusion or ranking in an AI answer. Any separately agreed AI-response observations identify their source, prompts and date; they are a sample, not universal visibility."],
  ["Can you guarantee more traffic or enquiries?", "No. Search placement, AI answers and customer behaviour depend on factors outside our control. Our commitment is to a clearly scoped review, evidence and practical recommendations."],
];

export default function LandingPage() {
  const config = getIntakeConfig(process.env, false);
  return <>
    <a className="vl-skip" href="#content">Skip to content</a>
    <header className="vl-header vl-wrap">
      <Link href="/" aria-label="Virelantic home"><Image src="/virelantic-logo.svg" alt="Virelantic" width={206} height={56} priority /></Link>
      <nav aria-label="Main navigation"><a href="#report">What you get</a><a href="#process">How it works</a><a href="#questions">Questions</a><a className="vl-button vl-button-small" href="#request">Request an audit <span aria-hidden>↗</span></a></nav>
    </header>
    <main id="content" tabIndex={-1}>
      <section className="vl-hero vl-wrap">
        <div><p className="vl-eyebrow">Website · Search · AI readiness</p>
          <h1>Know what<br />to fix <em>next.</em></h1>
          <p className="vl-lead">A clear audit of your website and search fundamentals, with practical recommendations for conversion and AI readiness.</p>
          <a className="vl-button" href="#request">Request an audit <span aria-hidden>↗</span></a>
          <p className="vl-price">Digital Visibility Audit <strong>US$495</strong> <span>one time</span></p>
          <p className="vl-fine">U.S. customers · Any applicable tax stated in your offer.<br />Scope and delivery date agreed before a private Stripe invoice.<br />Implementation quoted separately.</p>
        </div>
        <div className="vl-report" aria-label="Illustration of the report structure; no client results shown">
          <div className="vl-report-top"><span className="vl-dot" /> VIRELANTIC / FIELD NOTES</div>
          <p className="vl-eyebrow">Digital Visibility Audit</p><h2>Clarity before<br />your next move.</h2>
          <div className="vl-report-row"><span>01</span><div><strong>The evidence</strong><p>What was checked, where and when.</p></div></div>
          <div className="vl-report-row"><span>02</span><div><strong>The meaning</strong><p>Findings connected to your website goals.</p></div></div>
          <div className="vl-report-row"><span>03</span><div><strong>The priorities</strong><p>What to address first, with a clear reason.</p></div></div>
          <div className="vl-report-row"><span>04</span><div><strong>The limits</strong><p>Unavailable evidence and open questions.</p></div></div>
          <p className="vl-report-caption">REPORT FORMAT ILLUSTRATION / NO CLIENT RESULTS</p>
        </div>
      </section>
      <div className="vl-rule"><div className="vl-wrap">A practical starting point for small service businesses and the people who manage their websites.</div></div>
      <section className="vl-section vl-wrap" id="report">
        <p className="vl-eyebrow">01 / What you get</p>
        <div className="vl-section-heading"><h2>A useful next step.<br />Backed by evidence.</h2><p>Understand what your site communicates, where a customer may get stuck, and which improvements deserve attention. Your review starts with an agreed scope.</p></div>
        <div className="vl-columns">
          <article><span className="vl-index">A / FOUNDATIONS</span><h3>Can your site be understood?</h3><p>Review agreed pages for titles, headings, links, business clarity and structured-data signals. Record reachable robots and sitemap evidence where available.</p></article>
          <article><span className="vl-index">B / CUSTOMER JOURNEY</span><h3>Is the next action clear?</h3><p>Look at how a visitor moves from a service page to a call, appointment or enquiry. Separate manual observations from measured performance.</p></article>
          <article><span className="vl-index">C / PRIORITIES</span><h3>What should happen next?</h3><p>Receive a written report with evidence, limitations and practical recommendations. Checks that cannot be completed are disclosed, without invented scores.</p></article>
        </div>
      </section>
      <section className="vl-section vl-process" id="process"><div className="vl-wrap">
        <p className="vl-eyebrow">02 / How it works</p><h2>Start with the site.<br />Agree the details.</h2>
        <ol><li><span>01</span><div><h3>Tell us about your website</h3><p>Share your business, website and main goal. No account, payment details or passwords required.</p></div></li><li><span>02</span><div><h3>Confirm the scope and date</h3><p>We review fit and confirm the checks, exclusions, price, delivery date and terms before payment.</p></div></li><li><span>03</span><div><h3>Get findings and next steps</h3><p>After the agreed review, receive a report explaining the evidence and priorities. Decide separately how to implement the recommendations.</p></div></li></ol>
      </div></section>
      <section className="vl-section vl-wrap vl-faq" id="questions"><div><p className="vl-eyebrow">03 / Good questions</p><h2>Clear from<br />the start.</h2></div><div>{questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden>+</span></summary><p>{answer}</p></details>)}</div></section>
      <section className="vl-section vl-wrap vl-request" id="request"><div><p className="vl-eyebrow">04 / Your next move</p><h2>Let’s look at<br />your website.</h2><p className="vl-lead">Tell us what you want it to do better.</p><p>The Digital Visibility Audit is <strong>US$495 one time</strong>. We confirm the scope and delivery date before payment. This request does not place an order.</p><p className="vl-fine">Please share only business contact details. Don’t include passwords, payment information or private customer data.</p></div><AuditRequestForm enabled={!!config && process.env.PUBLIC_INTAKE_ENABLED === "true"} /></section>
    </main>
    <footer className="vl-footer vl-wrap"><div><Image src="/virelantic-logo.svg" alt="Virelantic" width={165} height={45} /><p>{business.seller}</p><p>{business.location} · U.S. customers</p><a href={`mailto:${business.email}`}>{business.email}</a></div><div><Link href="/privacy">Privacy notice</Link><Link href="/audit-terms">Service terms</Link><Link href="/refunds">Cancellation and refunds</Link><Link href="/dashboard">Operator sign in</Link></div><p>Know what to fix next.</p></footer>
  </>;
}

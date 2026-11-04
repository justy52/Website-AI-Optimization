"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { FORM_VERSION, PRIVACY_VERSION } from "@/domain/intake/constants";

export function AuditRequestForm({ enabled }: { enabled: boolean }) {
  const [nonce, setNonce] = useState("");
  const [pending, setPending] = useState(false);
  const [received, setReceived] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const loading = useRef(false);
  const message = useRef<HTMLParagraphElement>(null);

  async function refreshNonce() {
    if (loading.current || nonce || !enabled) return;
    loading.current = true;
    try {
      const response = await fetch("/api/public/audit-requests/nonce", { cache: "no-store" });
      const result = await response.json();
      if (response.ok && typeof result.nonce === "string") setNonce(result.nonce);
    } catch { /* Submission shows an actionable error and retains the fields. */ }
    finally { loading.current = false; }
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading.current || pending || received) return;
    if (!nonce) { setError("The form isn’t ready. Please try again in a few seconds."); await refreshNonce(); return; }
    const data = new FormData(event.currentTarget);
    const attribution: Record<string, string> = {};
    const query = new URLSearchParams(window.location.search);
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "referral"]) {
      const value = query.get(key);
      if (value && value.length <= 80 && /^[\p{L}\p{N} ._/-]*$/u.test(value)) attribution[key] = value;
    }
    const body = JSON.stringify({ contactName: data.get("contactName"), companyName: data.get("companyName"), email: data.get("email"), website: data.get("website"), goal: data.get("goal"), note: data.get("note"), acknowledgement: data.get("acknowledgement") === "on", nonce, companyFax: data.get("companyFax"), attribution, formVersion: FORM_VERSION, privacyVersion: PRIVACY_VERSION });
    // Edits after an uncertain save receive an explicit idempotency conflict.
    setPending(true); setError(""); setFields({});
    try {
      const response = await fetch("/api/public/audit-requests", { method: "POST", headers: { "content-type": "application/json" }, body });
      const result = await response.json();
      if (!response.ok || result.received !== true) {
        setError(result.error ?? "We couldn’t save your request. Please try again. Nothing has been charged.");
        setFields(result.fields ?? {});
        if (result.refreshNonce) {
          const response = await fetch("/api/public/audit-requests/nonce", { cache: "no-store" });
          const next = await response.json();
          if (response.ok) setNonce(next.nonce);
        }
      } else { setReceived(true); }
    } catch { setError("We couldn’t confirm your request. Please try again with the same details. Nothing has been charged."); }
    finally { setPending(false); requestAnimationFrame(() => message.current?.focus()); }
  }

  if (!enabled) return <div className="vl-form vl-unavailable" role="status"><h3>Audit requests are currently closed.</h3><p>Please check back when intake is available.</p></div>;
  if (received) return <div className="vl-form vl-success"><span aria-hidden>↗</span><h3>Your audit request has been received.</h3><p ref={message} tabIndex={-1} role="status">We’ll review the details and email you about scope and next steps. No payment has been taken.</p></div>;
  const issue = (name: string) => fields[name] ? <span className="vl-field-error" id={`${name}-error`}>{fields[name]}</span> : null;
  const props = (name: string) => ({ "aria-invalid": !!fields[name], "aria-describedby": fields[name] ? `${name}-error` : undefined });
  return <form className="vl-form" method="post" action="/api/public/audit-requests" onSubmit={submit} onFocusCapture={refreshNonce}>
    <fieldset disabled={pending}><legend className="vl-sr">Request a Digital Visibility Audit</legend>
      <div className="vl-field-pair"><label htmlFor="contactName">Your name<input {...props("contactName")} id="contactName" name="contactName" autoComplete="name" required maxLength={120} />{issue("contactName")}</label><label htmlFor="companyName">Business name<input {...props("companyName")} id="companyName" name="companyName" autoComplete="organization" required maxLength={160} />{issue("companyName")}</label></div>
      <label htmlFor="email">Business email<input {...props("email")} id="email" name="email" type="email" autoComplete="email" required maxLength={254} />{issue("email")}</label>
      <label htmlFor="website">Business website <span className="vl-fine">(https://…)</span><input {...props("website")} id="website" name="website" type="url" autoComplete="url" placeholder="https://yourbusiness.com" required maxLength={2048} />{issue("website")}</label>
      <label htmlFor="goal">Your main website goal<select {...props("goal")} id="goal" name="goal" required defaultValue=""><option value="" disabled>Select a goal</option><option value="calls">Calls or quote requests</option><option value="appointments">Appointments</option><option value="enquiries">Enquiries</option><option value="other">Other</option></select>{issue("goal")}</label>
      <label htmlFor="note">What needs attention? <span className="vl-fine">(optional)</span><textarea {...props("note")} id="note" name="note" rows={3} maxLength={1000} />{issue("note")}</label>
      <div className="vl-honeypot" aria-hidden="true"><label>Company fax<input name="companyFax" tabIndex={-1} autoComplete="off" defaultValue="" /></label></div>
      <label className="vl-ack" htmlFor="acknowledgement"><input {...props("acknowledgement")} id="acknowledgement" name="acknowledgement" type="checkbox" required /><span>I agree that Virelantic may use these details to review and respond to this audit request. I have read the <Link href="/privacy" target="_blank">privacy notice</Link>.</span></label>{issue("acknowledgement")}
      <p className="vl-fine">This request does not subscribe you to marketing.</p>
      {error ? <p className="vl-error" role="alert" ref={message} tabIndex={-1}>{error}</p> : null}
      <button className="vl-button" type="submit" disabled={pending}>{pending ? "Saving your request…" : "Request an audit"}<span aria-hidden>↗</span></button>
    </fieldset>
    <noscript><p>This secure form needs JavaScript. Please enable it to send your request.</p></noscript>
  </form>;
}

"use client";

import { useState } from "react";

import { useFormStatus } from "react-dom";

import { AUDIT_PRICE_CENTS, LAUNCH_MINIMUM_CENTS } from "@/domain/payments/pricing";

import { serviceOrderAction } from "./actions";

type Website = { id: string; label: string; clientId: string };

const dollars = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

async function fingerprint(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function SubmitButton({ disabled, mode }: { disabled: boolean; mode: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="mx-btn mx-form-wide" disabled={disabled || pending} type="submit">
      {pending ? "Saving…" : mode === "live" ? "Record this order" : "Record this test order"}
    </button>
  );
}

export function OrderForm({
  clients,
  websites,
  mode,
  termsVersion,
  operatorName,
  today,
}: {
  clients: Array<{ id: string; name: string }>;
  websites: Website[];
  mode: "test" | "live";
  termsVersion?: string;
  operatorName: string;
  today: string;
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [service, setService] = useState<"AUDIT_ONLY" | "LAUNCH">("AUDIT_ONLY");
  const [launchTotal, setLaunchTotal] = useState(String(LAUNCH_MINIMUM_CENTS / 100));
  const [hash, setHash] = useState("");
  const [fileNote, setFileNote] = useState("");
  const clientWebsites = websites.filter((website) => website.clientId === clientId);
  const launchCents = Math.round(Number(launchTotal) * 100);
  const launchValid = Number.isFinite(launchCents) && launchCents >= LAUNCH_MINIMUM_CENTS && launchCents % 2 === 0;

  async function chooseFile(file: File | undefined) {
    setHash("");
    if (!file) return setFileNote("");
    if (file.size > 50 * 1024 * 1024) return setFileNote("That file is larger than 50 MB. Choose a smaller copy.");
    try {
      setHash(await fingerprint(file));
      setFileNote(`Fingerprint recorded for ${file.name}. The file itself stays on your computer.`);
    } catch {
      setFileNote("The file could not be read. Try choosing it again.");
    }
  }

  return (
    <form action={serviceOrderAction} className="mx-form">
      <input name="action" type="hidden" value="create" />
      <input name="scopeSha256" type="hidden" value={hash} />
      <label>
        Client
        <select className="mx-input" name="clientId" onChange={(event) => setClientId(event.target.value)} required value={clientId}>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
      </label>
      <label>
        Website
        <select className="mx-input" key={clientId} name="websiteId" required>
          {clientWebsites.map((website) => <option key={website.id} value={website.id}>{website.label}</option>)}
        </select>
        {clientWebsites.length === 0 ? <span className="mx-help">This client has no website yet. Add one on the client&apos;s page first.</span> : null}
      </label>
      <label>
        What they bought
        <select className="mx-input" name="service" onChange={(event) => setService(event.target.value === "LAUNCH" ? "LAUNCH" : "AUDIT_ONLY")} value={service}>
          <option value="AUDIT_ONLY">Digital Visibility Audit</option>
          <option value="LAUNCH">Optimization Launch</option>
        </select>
      </label>
      {service === "AUDIT_ONLY" ? (
        <div className="mx-form-fact">
          <span>Price</span>
          <strong>{dollars(AUDIT_PRICE_CENTS)}</strong>
          <span className="mx-help">Paid in full before the audit starts.</span>
        </div>
      ) : (
        <label>
          Total price on the signed quote (US dollars)
          <input className="mx-input" inputMode="decimal" min={LAUNCH_MINIMUM_CENTS / 100} name="totalDollars" onChange={(event) => setLaunchTotal(event.target.value)} required step="0.02" type="number" value={launchTotal} />
          <span className="mx-help">
            {launchValid
              ? `Two payments of ${dollars(launchCents / 2)}: one before work starts and one on completion.`
              : `Launch starts at ${dollars(LAUNCH_MINIMUM_CENTS)} and is paid in two equal halves.`}
          </span>
        </label>
      )}
      <label>
        Customer&apos;s email for the receipt
        <input autoComplete="off" className="mx-input" maxLength={254} name="customerEmail" required type="email" />
      </label>
      <label>
        Date they signed
        <input className="mx-input" defaultValue={today} max={today} name="signedAt" required type="date" />
      </label>
      <label className="mx-form-wide">
        Name of the signed agreement
        <input className="mx-input" maxLength={200} minLength={3} name="scopeReference" placeholder="For example: Aloha Fence audit agreement, signed 12 Nov 2026" required />
      </label>
      <label className="mx-form-wide">
        The signed agreement file (PDF, scan or photo)
        <input accept=".pdf,image/*,.doc,.docx" className="mx-input" onChange={(event) => void chooseFile(event.target.files?.[0])} required type="file" />
        <span className="mx-help">
          {fileNote || "Nothing is uploaded. The app records a fingerprint of the file so the exact signed version can be proven later."}
        </span>
      </label>
      <label>
        Who will deliver the work
        <input className="mx-input" defaultValue={operatorName} maxLength={200} minLength={3} name="deliveryOperator" required />
      </label>
      {termsVersion ? (
        <div className="mx-form-fact">
          <span>Service terms version</span>
          <strong>{termsVersion}</strong>
          <input name="termsVersion" type="hidden" value={termsVersion} />
        </div>
      ) : (
        <label>
          Service terms version
          <input className="mx-input" maxLength={200} minLength={3} name="termsVersion" required />
        </label>
      )}
      <label className="mx-form-check mx-form-wide">
        <input name="signatureVerified" required type="checkbox" />
        <span>I have checked that the agreement is signed by the customer, and that the service, price and payment schedule above match it.</span>
      </label>
      <SubmitButton disabled={!hash || clientWebsites.length === 0 || (service === "LAUNCH" && !launchValid)} mode={mode} />
    </form>
  );
}

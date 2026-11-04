import Link from "next/link";
import { getWorkspaceShellContext } from "@/server/auth";
import { listIntakeRequests } from "@/server/intake-queue";
import { inquirySchema } from "@/domain/intake/validation";
import { reviewIntakeAction } from "./actions";
import { Panel, PageHeader, StatusChip, EmptyState, formatDate } from "../ui";

export default async function IntakePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const shell = await getWorkspaceShellContext();
  const raw = Number((await searchParams).page ?? 0);
  const page = Number.isSafeInteger(raw) && raw >= 0 ? Math.min(raw, 10000) : 0;
  const requests = await listIntakeRequests(shell.workspaceContext, page);
  return <>
    <PageHeader eyebrow="Public enquiries" title="Audit requests" />
    <p className="mx-muted">Review this queue regularly. Details are unverified, including the email address and website. Importing creates a NEW lead; it does not verify payment, authorize an audit, or send an email. Request copies expire after 90 days.</p>
    {requests.length === 0 ? <EmptyState>No current requests.</EmptyState> : requests.slice(0, 50).map(request => {
      const result = inquirySchema.omit({ nonce: true, companyFax: true }).safeParse(request.payload);
      if (!result.success) return <Panel key={request.id} title="Request needs technical review"><p>Invalid stored request: {request.id}</p></Panel>;
      const data = result.data;
      return <Panel key={request.id} title={data.companyName}>
        <StatusChip tone="info">{request.state}</StatusChip>
        <p>{data.contactName} · {data.email}</p>
        <p style={{ overflowWrap: "anywhere" }}>{data.website}</p>
        <p>Goal: {data.goal}</p><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{data.note || "No additional note."}</p>
        <p className="mx-muted">Received {formatDate(request.createdAt)} · Privacy {data.privacyVersion} · {Object.entries(data.attribution).map(([key, value]) => `${key}: ${value}`).join(" · ") || "Direct / unknown source"}</p>
        {request.state === "RECEIVED" ? <form action={reviewIntakeAction} className="mx-actions">
          <input type="hidden" name="requestId" value={request.id} />
          <button className="mx-btn" name="decision" value="import">Import as new lead</button>
          <button className="mx-btn mx-btn-ghost" name="decision" value="dismiss">Dismiss request</button>
        </form> : request.leadId ? <Link className="mx-btn" href={`/leads/${request.leadId}`}>Open lead</Link> : <p>Reviewed {request.reviewedAt ? formatDate(request.reviewedAt) : ""}</p>}
      </Panel>;
    })}
    <nav aria-label="Audit request pages" className="mx-actions">
      {page > 0 ? <Link href={`/intake?page=${page - 1}`}>Previous</Link> : null}
      {requests.length > 50 ? <Link href={`/intake?page=${page + 1}`}>Next</Link> : null}
    </nav>
  </>;
}

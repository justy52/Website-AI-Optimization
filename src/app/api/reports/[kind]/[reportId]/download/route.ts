import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { monthlyReports } from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import type { BuiltAuditReport } from "@/domain/audits/report";
import { renderAuditReport, renderMonthlyReport, type MonthlyDeliverySnapshot } from "@/domain/report-delivery";
import { getReport } from "@/server/audits";
import { getOptionalAuthenticatedUser, getWorkspaceShellContext } from "@/server/auth";

const privateHeaders = { "Cache-Control": "private, no-store" };
const notFound = () => new Response("Report not found.", { status: 404, headers: privateHeaders });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; reportId: string }> },
) {
  if (!(await getOptionalAuthenticatedUser())) {
    return new Response("Sign in to download reports.", { status: 401, headers: privateHeaders });
  }
  const { kind, reportId } = await params;
  if ((kind !== "audit" && kind !== "monthly") || !z.uuid().safeParse(reportId).success) return notFound();

  const { workspaceContext } = await getWorkspaceShellContext();
  let html: string;
  if (kind === "audit") {
    const report = await getReport(workspaceContext, reportId);
    if (!report || report.status !== "FINALIZED" || !report.finalizedAt) return notFound();
    html = renderAuditReport({
      title: report.title,
      executiveSummary: report.executiveSummary,
      reportData: report.reportData as BuiltAuditReport["reportData"],
    }, report.finalizedAt.toISOString());
  } else {
    const snapshot = await withTenantContext(db, workspaceContext, async (tx) => {
      const [report] = await tx.select({ snapshot: monthlyReports.immutableSnapshot })
        .from(monthlyReports)
        .where(and(
          eq(monthlyReports.workspaceId, workspaceContext.workspaceId),
          eq(monthlyReports.id, reportId),
          eq(monthlyReports.status, "FINALIZED"),
        ))
        .limit(1);
      return report?.snapshot;
    });
    if (!snapshot) return notFound();
    html = renderMonthlyReport(snapshot as MonthlyDeliverySnapshot);
  }

  return new Response(html, {
    headers: {
      ...privateHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="virelantic-${kind}-report.html"`,
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

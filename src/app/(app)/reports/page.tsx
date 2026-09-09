import { listReports } from "@/server/audits";
import { getWorkspaceShellContext } from "@/server/auth";
import { listMonthlyReports } from "@/server/monthly-cycles";

import { EmptyState, formatDate, PageHeader, Panel, RowLink, StatusChip } from "../ui";

export default async function ReportsPage() {
  const shell = await getWorkspaceShellContext();
  const [reports, monthlyReports] = await Promise.all([
    listReports(shell.workspaceContext),
    listMonthlyReports(shell.workspaceContext),
  ]);

  return (
    <>
      <PageHeader eyebrow="Snapshot-backed" title="Reports" />
      <Panel title="Audit reports">
        {reports.length > 0 ? (
          <div className="mx-list">
            {reports.map((report) => (
              <RowLink
                chips={<StatusChip tone="info">{report.status}</StatusChip>}
                href={`/reports/${report.id}`}
                key={report.id}
                meta={`${report.methodologyVersion} - ${formatDate(report.createdAt)}`}
                title={report.title}
              />
            ))}
          </div>
        ) : (
          <EmptyState>No reports have been created yet.</EmptyState>
        )}
      </Panel>
      <div className="mx-spacer" />
      <Panel title="Monthly reports">
        {monthlyReports.length > 0 ? (
          <div className="mx-list">
            {monthlyReports.map((report) => (
              <RowLink
                chips={<StatusChip tone="info">{report.status}</StatusChip>}
                href={`/monthly-cycles/${report.monthlyCycleId}`}
                key={report.id}
                meta={`${report.clientName} - ${report.reportPeriodStartDate} to ${report.reportPeriodEndDate} - ${report.snapshotHash ?? "draft mutable"}`}
                title={report.title}
              />
            ))}
          </div>
        ) : (
          <EmptyState>No monthly reports have been generated yet.</EmptyState>
        )}
      </Panel>
    </>
  );
}

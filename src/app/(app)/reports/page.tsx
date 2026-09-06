import { listReports } from "@/server/audits";
import { getWorkspaceShellContext } from "@/server/auth";

import { EmptyState, formatDate, PageHeader, Panel, RowLink, StatusChip } from "../ui";

export default async function ReportsPage() {
  const shell = await getWorkspaceShellContext();
  const reports = await listReports(shell.workspaceContext);

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
    </>
  );
}

import { getWorkspaceShellContext } from "@/server/auth";
import { listClients } from "@/server/revenue";

import { EmptyState, formatDate, PageHeader, Panel, RowLink, StatusChip } from "../ui";

export default async function ClientsPage() {
  const shell = await getWorkspaceShellContext();
  const clients = await listClients(shell.workspaceContext);

  return (
    <>
      <PageHeader eyebrow="Roster" title="Clients" />
      <Panel title="Active clients">
        {clients.length > 0 ? (
          <div className="mx-list">
            {clients.map((client) => (
              <RowLink
                chips={<StatusChip tone="good">{client.servicePlan}</StatusChip>}
                href={`/clients/${client.id}`}
                key={client.id}
                meta={`${client.servicePlanVersion} - ${formatDate(client.createdAt)}`}
                title={client.name}
              />
            ))}
          </div>
        ) : (
          <EmptyState>
            No clients yet. Convert a qualified lead to create the first client.
          </EmptyState>
        )}
      </Panel>
    </>
  );
}

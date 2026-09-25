import { getWorkspaceShellContext } from "@/server/auth";
import { exportWorkspace } from "@/server/workspace-export";
import { OperationsValidationError } from "@/domain/operations/policy";
import { AuthorizationError } from "@/domain/tenancy/context";
export async function GET() {
  const { workspaceContext } = await getWorkspaceShellContext();
  try {
    const data = await exportWorkspace(workspaceContext);
    return new Response(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="optiq-workspace-export.json"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (error instanceof OperationsValidationError || error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: error instanceof AuthorizationError ? 403 : error.code === "RATE_LIMIT" ? 429 : 400 });
    throw error;
  }
}

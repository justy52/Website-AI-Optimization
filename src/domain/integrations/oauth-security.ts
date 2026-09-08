export type PendingOAuthState = {
  workspaceId: string;
  createdByUserId: string | null;
  provider: string;
  status: "PENDING" | "CONSUMED" | "EXPIRED" | "FAILED";
  expiresAt: Date;
};

export function assertOAuthStateMatchesContext(
  state: PendingOAuthState | null | undefined,
  context: {
    workspaceId: string;
    userId?: string;
    provider: string;
    now?: Date;
  },
) {
  if (!state) {
    throw new Error("OAuth state is invalid or expired.");
  }

  if (state.status !== "PENDING") {
    throw new Error("OAuth state is invalid or expired.");
  }

  if (state.workspaceId !== context.workspaceId) {
    throw new Error("OAuth state is not valid for this workspace.");
  }

  if (!context.userId || state.createdByUserId !== context.userId) {
    throw new Error("OAuth state is not valid for this user.");
  }

  if (state.provider !== context.provider) {
    throw new Error("OAuth state is not valid for this provider.");
  }

  if (state.expiresAt <= (context.now ?? new Date())) {
    throw new Error("OAuth state is invalid or expired.");
  }
}

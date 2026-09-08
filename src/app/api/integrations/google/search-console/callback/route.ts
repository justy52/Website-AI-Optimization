import { NextResponse } from "next/server";

import { getWorkspaceShellContext } from "@/server/auth";
import { completeGoogleSearchConsoleOAuth } from "@/server/integrations";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const redirectBase = new URL("/settings/integrations", url.origin);

  if (!state || !code) {
    redirectBase.searchParams.set("error", "oauth_callback_invalid");
    return NextResponse.redirect(redirectBase);
  }

  try {
    const shell = await getWorkspaceShellContext();
    await completeGoogleSearchConsoleOAuth(shell.workspaceContext, {
      state,
      code,
    });
    redirectBase.searchParams.set("connected", "google_search_console");
    return NextResponse.redirect(redirectBase);
  } catch {
    redirectBase.searchParams.set("error", "oauth_callback_failed");
    return NextResponse.redirect(redirectBase);
  }
}

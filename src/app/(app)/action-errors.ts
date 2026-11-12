import { redirect, unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";

import { UserInputError } from "@/domain/errors";
import { OperationsValidationError } from "@/domain/operations/policy";
import { AuthorizationError } from "@/domain/tenancy/context";
import { WebsiteUrlError } from "@/domain/websites/url";
import { noticeUrl } from "@/server/notice";

function explain(error: unknown): string | null {
  if (error instanceof UserInputError || error instanceof WebsiteUrlError || error instanceof OperationsValidationError) {
    return error.message;
  }
  if (error instanceof AuthorizationError) return "Your role in this workspace does not allow that action.";
  if (error instanceof ZodError) return "Some of the details were not valid. Check the form and try again.";
  return null;
}

/**
 * End a form action that failed. A problem the operator can fix returns them
 * to `back` with the explanation; anything else is logged by name only and
 * reaches the error page.
 */
export function failAction(error: unknown, back: string): never {
  // Redirects and not-found signals are control flow, not failures.
  unstable_rethrow(error);
  const message = explain(error);
  if (!message) {
    console.error("app_action_failed", { name: error instanceof Error ? error.name : typeof error });
    throw error;
  }
  redirect(noticeUrl(back, message) as never);
}

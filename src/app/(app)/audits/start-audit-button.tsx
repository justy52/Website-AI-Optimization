"use client";

import { Play } from "lucide-react";
import { useFormStatus } from "react-dom";

/**
 * Submit button for the start-audit forms. An audit can take up to two
 * minutes, so the button reports progress and cannot be pressed again while
 * the request is in flight.
 */
export function StartAuditButton() {
  const { pending } = useFormStatus();

  return (
    <>
      <button aria-disabled={pending} className="mx-btn" disabled={pending} type="submit">
        <Play aria-hidden size={14} />
        {pending ? "Audit running…" : "Start audit"}
      </button>
      {pending ? (
        <p className="mx-muted" role="status">
          The audit is running and can take up to two minutes. This page will open the result when it finishes.
        </p>
      ) : null}
    </>
  );
}

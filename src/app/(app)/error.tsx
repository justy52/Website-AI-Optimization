"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-panel" role="alert">
      <div className="mx-eyebrow">Something went wrong</div>
      <h1 className="mx-title">That didn&apos;t work</h1>
      <p className="mx-muted">
        Nothing was changed by the step that failed. Try again, or go back and check what was entered.
        {error.digest ? ` If it keeps happening, quote reference ${error.digest}.` : ""}
      </p>
      <div className="mx-action-stack">
        <button className="mx-btn" onClick={() => retry()} type="button">Try again</button>
        <a className="mx-btn mx-btn-ghost" href="/dashboard">Go to the dashboard</a>
      </div>
    </section>
  );
}

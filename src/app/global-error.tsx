"use client";

import { useEffect } from "react";

// Replaces the root layout when it fails, so it carries its own document and
// styles rather than relying on the app stylesheet.
export default function GlobalError({
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
    <html lang="en">
      <body style={{ background: "#020806", color: "#d7ffe4", fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <title>Something went wrong | Virelantic</title>
        <main style={{ margin: "0 auto", maxWidth: 520, padding: "96px 24px" }}>
          <h1 style={{ fontSize: 28 }}>Something went wrong</h1>
          <p>The page could not be shown. Please try again in a moment.</p>
          <button onClick={() => retry()} style={{ cursor: "pointer", font: "inherit", padding: "10px 16px" }} type="button">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

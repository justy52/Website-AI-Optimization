import Link from "next/link";

export const metadata = { title: "Page not found | Virelantic" };

export default function NotFound() {
  return (
    <main className="mx-auth-root">
      <div className="mx-auth-panel">
        <div className="mx-eyebrow">Page not found</div>
        <h1 className="mx-title">We couldn&apos;t find that page</h1>
        <p className="mx-muted">The address may be mistyped, or the page may have moved.</p>
        <div className="mx-action-stack">
          <Link className="mx-btn" href="/">Go to the Virelantic home page</Link>
        </div>
      </div>
    </main>
  );
}

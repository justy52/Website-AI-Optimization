import Link from "next/link";

export default function AppNotFound() {
  return (
    <section className="mx-panel">
      <div className="mx-eyebrow">Not found</div>
      <h1 className="mx-title">This record isn&apos;t here</h1>
      <p className="mx-muted">
        It may have been archived, or the link belongs to a different workspace.
      </p>
      <div className="mx-action-stack">
        <Link className="mx-btn" href="/dashboard">Go to the dashboard</Link>
      </div>
    </section>
  );
}

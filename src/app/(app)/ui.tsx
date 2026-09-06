import { ChevronRight } from "lucide-react";

import type { CheckStatus } from "@/domain/audits/scoring";

export function PageHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-page-head">
      <div>
        <div className="mx-eyebrow">{eyebrow}</div>
        <h1 className="mx-title">{title}</h1>
      </div>
      {action}
    </div>
  );
}

export function Panel({
  title,
  children,
  right,
}: {
  title?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="mx-panel">
      {title || right ? (
        <div className="mx-panel-title">
          {title ? <b>{title}</b> : <span />}
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="mx-empty">{children}</div>;
}

export function RowLink({
  href,
  title,
  meta,
  chips,
}: {
  href: string;
  title: string;
  meta?: string;
  chips?: React.ReactNode;
}) {
  return (
    <a className="mx-row" href={href}>
      <div className="mx-row-main">
        <span className="mx-row-title">{title}</span>
        {meta ? <span className="mx-row-meta">{meta}</span> : null}
      </div>
      {chips}
      <ChevronRight aria-hidden size={15} />
    </a>
  );
}

export function StatusChip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
}) {
  return <span className={`mx-chip mx-chip-${tone}`}>{children}</span>;
}

export function statusTone(status: CheckStatus) {
  if (status === "PASS") return "good";
  if (status === "WARNING") return "warn";
  if (status === "FAIL" || status === "ERROR") return "bad";
  if (status === "UNAVAILABLE") return "info";
  return "neutral";
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

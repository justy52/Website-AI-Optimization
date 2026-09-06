import {
  Activity,
  CheckCircle2,
  Database,
  Flag,
  Gauge,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

const foundationCards = [
  {
    label: "Application",
    value: "Next.js App Router",
    detail: "TypeScript and Tailwind foundation render from the root route.",
    icon: Activity,
  },
  {
    label: "Tenant Core",
    value: "Workspace Scoped",
    detail: "Server-derived context is paired with Postgres RLS hooks.",
    icon: ShieldCheck,
  },
  {
    label: "Authentication",
    value: "Better Auth",
    detail: "Self-hosted auth tables are wired through the API route.",
    icon: LockKeyhole,
  },
  {
    label: "Definitions",
    value: "Versioned Rules",
    detail: "Scoring, priority, and service plans use deterministic versions.",
    icon: Gauge,
  },
] as const;

const phaseZeroChecks = [
  "Database foundation and migrations",
  "Workspace ownership and membership guardrails",
  "Environment validation and safe examples",
  "Health endpoint for deployment checks",
  "Unit tests for Phase 0 boundaries",
];

const guardrails = [
  "No audit execution",
  "No lead or client workflow",
  "No report or proposal generation",
  "No billing or subscriptions",
  "No agents or scheduled automation",
  "No third-party integration workflows",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-brand text-white">
              <Activity aria-hidden="true" size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-brand">OPTIQ</p>
              <p className="text-xs text-muted">Phase 0 foundation baseline</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-line bg-[var(--panel-strong)] px-3 py-2 text-sm text-brand">
            <CheckCircle2 aria-hidden="true" size={16} />
            Scaffold active
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-8 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-6">
          <section className="rounded-lg border border-line bg-panel p-5 shadow-sm">
            <p className="text-xs font-medium uppercase text-muted">
              Phase 0 only
            </p>
            <h1 className="mt-2 text-2xl font-semibold">
              Website and AI Optimization foundation
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
              This shell exists to verify the application scaffold, design
              foundation, authentication route, tenant model, migrations, and
              deterministic configuration. Product workflows begin after this
              baseline is reviewed.
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {foundationCards.map((card) => (
              <article
                key={card.label}
                className="rounded-lg border border-line bg-panel p-4 shadow-sm"
              >
                <div className="mb-4 flex size-9 items-center justify-center rounded-md bg-[var(--panel-strong)] text-brand">
                  <card.icon aria-hidden="true" size={18} />
                </div>
                <p className="text-xs font-medium uppercase text-muted">
                  {card.label}
                </p>
                <h2 className="mt-1 text-base font-semibold">{card.value}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {card.detail}
                </p>
              </article>
            ))}
          </section>

          <section className="rounded-lg border border-line bg-panel shadow-sm">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Database aria-hidden="true" size={18} />
              <h2 className="font-semibold">Foundation Scope</h2>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {phaseZeroChecks.map((item) => (
                <div key={item} className="flex gap-3 text-sm leading-6">
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-1 shrink-0 text-brand"
                    size={15}
                  />
                  <span className="text-muted">{item}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="grid content-start gap-5">
          <section className="rounded-lg border border-line bg-panel p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Flag aria-hidden="true" className="text-warning" size={18} />
              <h2 className="font-semibold">Scope Guard</h2>
            </div>
            <div className="grid gap-3">
              {guardrails.map((item) => (
                <div key={item} className="flex gap-3 text-sm leading-6">
                  <span
                    aria-hidden="true"
                    className="mt-2 size-2 rounded-full bg-warning"
                  />
                  <span className="text-muted">{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-panel p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck
                aria-hidden="true"
                className="text-brand"
                size={18}
              />
              <h2 className="font-semibold">Security Default</h2>
            </div>
            <p className="text-sm leading-6 text-muted">
              External EXECUTE actions, production imports, and automated
              recommendations are disabled in Phase 0. Feature flags and
              approval policy tables are foundation only.
            </p>
          </section>
        </aside>
      </section>
    </main>
  );
}

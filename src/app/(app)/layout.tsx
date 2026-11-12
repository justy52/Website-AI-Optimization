import { serverEnv } from "@/lib/env";
import Link from "next/link";
import Image from "next/image";

import {
  Activity,
  Bot,
  CalendarDays,
  FileText,
  Globe2,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Plug,
  Radar,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

import { switchWorkspaceAction } from "@/app/workspace-actions";
import { getWorkspaceShellContext } from "@/server/auth";

import { Fragment, Suspense } from "react";

import { NoticeBanner } from "./notice-banner";
import { SignOutButton } from "./sign-out-button";
import { countPendingAuditRequests, receivesPublicRequests } from "@/server/attention";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Radar },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/service-orders", label: "Service orders", icon: FileText },
  { href: "/websites", label: "Websites", icon: Globe2 },
  { href: "/audits", label: "Audits", icon: Radar },
  { href: "/opportunities", label: "Opportunities", icon: ListChecks },
  { href: "/work-plan", label: "Work Plan", icon: ListChecks },
  { href: "/monthly-cycles", label: "Monthly Cycles", icon: CalendarDays },
  { href: "/monitoring", label: "Monitoring", icon: Activity },
  { href: "/settings/integrations", label: "Integrations", icon: Plug },
  { href: "/runs", label: "Runs", icon: Bot },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/operations", label: "Operations", icon: Activity },
  { href: "/ai-visibility", label: "AI Visibility", icon: Radar },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shell = await getWorkspaceShellContext();
  const showRequests = receivesPublicRequests(shell.workspaceContext);
  const pendingRequests = showRequests ? await countPendingAuditRequests(shell.workspaceContext) : 0;

  return (
    <div className="mx-root">
      <a className="mx-skip-link" href="#main-content">Skip to main content</a>
      <div className="mx-rain" aria-hidden />
      <div className="mx-scan" aria-hidden />
      <div className="mx-vignette" aria-hidden />
      <div className="mx-shell">
        <aside className="mx-rail">
          <Link className="mx-brand" href="/dashboard">
            <Image src="/virelantic-logo.svg" alt="Virelantic" width={188} height={51} priority />
          </Link>
          <nav className="mx-nav" aria-label="Main navigation">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <Fragment key={item.href}>
                  <a className="mx-nav-item" href={item.href}>
                    <Icon aria-hidden size={15} />
                    {item.label}
                  </a>
                  {/* New enquiries are the first thing to act on, so they sit directly under the dashboard. */}
                  {item.href === "/dashboard" && showRequests ? (
                    <a className="mx-nav-item" href="/intake">
                      <Inbox aria-hidden size={15} />
                      Audit requests
                      {pendingRequests > 0 ? (
                        <span className="mx-nav-count" aria-label={`${pendingRequests} waiting`}>{pendingRequests}</span>
                      ) : null}
                    </a>
                  ) : null}
                </Fragment>
              );
            })}
          {serverEnv.APP_ENV === "qa" ? <a className="mx-nav-item" href="/qa-execution">QA Execution</a> : null}
          </nav>
          <div className="mx-rail-foot">
            <span className="mx-led" aria-hidden />
            <span>{shell.currentWorkspace.workspaceName}</span>
          </div>
        </aside>
        <div className="mx-main">
          <header className="mx-topbar">
            <div>
              <div className="mx-eyebrow">Current workspace</div>
              <div className="mx-top-title">{shell.currentWorkspace.workspaceName}</div>
            </div>
            <div className="mx-top-actions">
              {shell.memberships.length > 1 ? (
                <form action={switchWorkspaceAction}>
                  <label className="sr-only" htmlFor="workspaceId">
                    Workspace
                  </label>
                  <select
                    className="mx-input mx-select"
                    defaultValue={shell.currentWorkspace.workspaceId}
                    id="workspaceId"
                    name="workspaceId"
                  >
                    {shell.memberships.map((membership) => (
                      <option
                        key={membership.workspaceId}
                        value={membership.workspaceId}
                      >
                        {membership.workspaceName}
                      </option>
                    ))}
                  </select>
                  <button className="mx-btn mx-btn-ghost" type="submit">
                    Switch
                  </button>
                </form>
              ) : null}
              <div className="mx-session">
                <span>{shell.user.name}</span>
                <span>{shell.currentWorkspace.role}</span>
              </div>
              <SignOutButton />
            </div>
          </header>
          <main id="main-content" tabIndex={-1} className="mx-view">
            <Suspense fallback={null}><NoticeBanner /></Suspense>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

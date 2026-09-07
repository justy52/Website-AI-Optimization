import Link from "next/link";

import {
  FileText,
  Globe2,
  LayoutDashboard,
  ListChecks,
  Radar,
  Settings,
  Terminal,
  Users,
} from "lucide-react";

import { switchWorkspaceAction } from "@/app/workspace-actions";
import { getWorkspaceShellContext } from "@/server/auth";

import { SignOutButton } from "./sign-out-button";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Radar },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/websites", label: "Websites", icon: Globe2 },
  { href: "/audits", label: "Audits", icon: Radar },
  { href: "/opportunities", label: "Opportunities", icon: ListChecks },
  { href: "/work-plan", label: "Work Plan", icon: ListChecks },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shell = await getWorkspaceShellContext();

  return (
    <div className="mx-root">
      <div className="mx-rain" aria-hidden />
      <div className="mx-scan" aria-hidden />
      <div className="mx-vignette" aria-hidden />
      <div className="mx-shell">
        <aside className="mx-rail">
          <Link className="mx-brand" href="/">
            <Terminal aria-hidden size={18} />
            <span>OPTIQ</span>
          </Link>
          <nav className="mx-nav" aria-label="Main navigation">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <a className="mx-nav-item" href={item.href} key={item.href}>
                  <Icon aria-hidden size={15} />
                  {item.label}
                </a>
              );
            })}
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
          <main className="mx-view">{children}</main>
        </div>
      </div>
    </div>
  );
}

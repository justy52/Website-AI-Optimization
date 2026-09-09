import { expect, test, type Page, type Locator } from "@playwright/test";

const timestamp = Date.now();
const runId = `${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
const email = `optiq-phase5-${runId}@example.com`;
const password = `OPTIQPhase5-${runId}!`;
const workspaceName = `OPTIQ Phase 5 QA ${runId}`;
const clientName = `Phase 5 QA Client ${runId}`;
const competitorName = `IANA Phase 5 ${runId}`;

function monthlyCyclesNavLink(page: Page) {
  return page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Monthly Cycles", exact: true });
}

async function signUp(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Name").fill("OPTIQ Phase 5 QA");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Enter" }).click();
}

async function ensureWorkspace(page: Page) {
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/workspace-setup")) {
    await page.getByLabel("Workspace name").fill(workspaceName);
    await page.getByRole("button", { name: "Create workspace" }).click();
  }
  await expect(monthlyCyclesNavLink(page)).toBeVisible();
}

async function createGrowthClientWithWebsite(page: Page) {
  await page.getByRole("link", { name: "Leads", exact: true }).click();
  await page.getByLabel("Company").fill(clientName);
  await page.getByLabel("Status").selectOption("NEW");
  await page.getByLabel("Source").fill("Phase 5 E2E");
  await page.getByLabel("Contact name").fill("QA User");
  await page.getByLabel("Contact email").fill(email);
  await page.getByLabel("Website URL").fill("https://example.com");
  await page.getByLabel("Notes").fill("Disposable Phase 5 QA record.");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByRole("heading", { name: clientName })).toBeVisible();

  await page.getByLabel("Status").selectOption("QUALIFIED");
  await page.getByRole("button", { name: "Save lead" }).click();
  await page.getByRole("button", { name: "Convert to client" }).click();
  await expect(page.getByRole("heading", { name: clientName })).toBeVisible();
  await page.getByLabel("Service plan").selectOption("GROWTH");
  await page.getByRole("button", { name: "Save client" }).click();
  await expect(page.getByLabel("Service plan")).toHaveValue("GROWTH");

  await page.getByLabel("Display name").fill("Example");
  await page.getByLabel("Canonical URL").fill("https://example.com");
  await page.getByLabel("Domain").fill("example.com");
  await page
    .getByLabel("Authorization scope")
    .selectOption("PUBLIC_PAGES_ONLY");
  await page.getByRole("button", { name: "Add website" }).click();
  await expect(page.getByRole("heading", { name: "Example" })).toBeVisible();
}

async function addBusinessFact(
  page: Page,
  options: {
    factType: string;
    value: string;
    verification?: string;
    sensitivity?: string;
  },
) {
  const form = page.locator("form").filter({ hasText: "Fact type" }).last();
  await form.getByLabel("Fact type").fill(options.factType);
  await form
    .getByLabel("Verification")
    .selectOption(options.verification ?? "VERIFIED");
  await form
    .getByLabel("Sensitivity")
    .selectOption(options.sensitivity ?? "PUBLIC");
  await form.getByLabel("Value").fill(options.value);
  await form.getByLabel("Source reference").fill("Phase 5 QA source");
  await form.getByRole("button", { name: "Add fact" }).click();
  await expect(page.getByText(options.value)).toBeVisible();
}

async function runMonitoringAndCompetitorObservation(page: Page) {
  await expect(page.getByText("Recurring monitoring")).toBeVisible();
  await page.getByRole("button", { name: "Sync plan schedules" }).click();
  await expect(page.getByText("website_health")).toBeVisible();

  const healthSchedule = page
    .locator(".mx-row", { hasText: "website_health" })
    .first();
  await healthSchedule.getByRole("button", { name: "Run" }).click();
  await expect
    .poll(
      async () => {
        await page.reload({ waitUntil: "networkidle" });
        return (await page.locator("main").textContent()) ?? "";
      },
      { timeout: 180_000, intervals: [3_000, 5_000, 10_000] },
    )
    .toMatch(/SUCCEEDED|PARTIAL/);

  const competitorForm = page.locator("form").filter({ hasText: "Domain or URL" });
  await competitorForm.getByLabel("Name").fill(competitorName);
  await competitorForm.getByLabel("Domain or URL").fill("https://www.iana.org");
  await competitorForm
    .getByLabel("Relationship")
    .fill("REFERENCE_PUBLIC_SITE");
  await competitorForm.getByLabel("Notes").fill("Disposable Phase 5 target.");
  await competitorForm.getByRole("button", { name: "Add competitor" }).click();
  await expect(page.getByText(competitorName)).toBeVisible();
  await page
    .locator(".mx-row", { hasText: competitorName })
    .first()
    .getByRole("button", { name: "Observe" })
    .click();
  await expect
    .poll(
      async () => {
        await page.reload({ waitUntil: "networkidle" });
        return (await page.locator("main").textContent()) ?? "";
      },
      { timeout: 120_000, intervals: [2_000, 5_000, 10_000] },
    )
    .toMatch(
      /Initial public homepage metadata observation recorded|Competitor public-page observation failed/,
    );
}

async function createAuditOpportunity(page: Page) {
  await page.getByRole("button", { name: "Start audit" }).click();
  await expect(page.getByRole("heading", { name: /Audit/ })).toBeVisible();
  await expect(page.getByText("UNAVAILABLE").first()).toBeVisible();
  await page.getByRole("button", { name: "Finalize audit snapshot" }).click();
  await page.getByRole("button", { name: "Create report" }).click();
  await expect(page.getByText("Executive summary")).toBeVisible();
  await page.getByRole("button", { name: "Finalize report" }).click();
}

async function pollCycleFor(page: Page, text: string | RegExp) {
  await expect
    .poll(
      async () => {
        await page.reload({ waitUntil: "networkidle" });
        return (await page.locator("main").textContent()) ?? "";
      },
      { timeout: 180_000, intervals: [3_000, 5_000, 10_000] },
    )
    .toMatch(text instanceof RegExp ? text : new RegExp(text));
}

function deliverableRow(page: Page, title: string): Locator {
  return page.locator(".mx-check-row", { hasText: title }).first();
}

async function setDeliverableComplete(page: Page, title: string) {
  const row = deliverableRow(page, title);
  await row.getByLabel("Status").selectOption("COMPLETE");
  await row.getByLabel("Completed").fill("1");
  await row.getByLabel("Evidence").fill(`${title} verified by Phase 5 E2E.`);
  await row.getByRole("button", { name: "Update" }).click();
  await expect(deliverableRow(page, title).locator(".mx-chip").first()).toHaveText(
    "COMPLETE",
  );
}

async function waiveDeliverable(page: Page, title: string) {
  const row = deliverableRow(page, title);
  await row.getByPlaceholder("Waiver reason").fill(`${title} waived by Phase 5 E2E.`);
  await row.getByRole("button", { name: "Waive" }).click();
  await expect(deliverableRow(page, title).locator(".mx-chip").first()).toHaveText(
    "WAIVED",
  );
}

async function approveLatestPendingDraft(page: Page) {
  await page.getByRole("link", { name: "Approvals", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Approval Queue" })).toBeVisible();
  await page.locator("main a.mx-row", { hasText: clientName }).first().click();
  await expect(page.getByText("Pending")).toBeVisible();
  await page.getByLabel("Decision").selectOption("APPROVED_UNCHANGED");
  await page.getByLabel("Comments").fill("Phase 5 approves manual implementation.");
  await page.getByRole("button", { name: "Record human decision" }).click();
  await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("Phase 5 monthly fulfillment workflow on QA", async ({ page }) => {
  test.setTimeout(540_000);

  await signUp(page);
  await ensureWorkspace(page);
  await createGrowthClientWithWebsite(page);
  const websiteUrl = page.url();

  await runMonitoringAndCompetitorObservation(page);

  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByText(clientName).click();
  await addBusinessFact(page, {
    factType: "service",
    value: "Website optimization",
  });
  await page.goto(websiteUrl, { waitUntil: "networkidle" });
  await createAuditOpportunity(page);

  await monthlyCyclesNavLink(page).click();
  await expect(page.getByRole("heading", { name: "Monthly Cycles" })).toBeVisible();
  await page.getByLabel("Client").selectOption({ label: `${clientName} - GROWTH` });
  await page.getByRole("button", { name: "Create cycle" }).click();
  await expect(
    page.getByRole("heading", { name: "Monthly Fulfillment Cycle" }),
  ).toBeVisible();
  const firstCycleUrl = page.url();

  await expect(page.getByText("Growth").first()).toBeVisible();
  await expect(page.getByText("Weekly Website Health")).toBeVisible();
  await expect(page.getByText("Weekly Search Console")).toBeVisible();
  await expect(page.locator("main")).toContainText(
    "BLOCKED / SEARCH CONSOLE NOT CONNECTED",
  );
  await expect(deliverableRow(page, "Observed AI Visibility")).toContainText(
    "UNAVAILABLE",
  );
  await expect(
    page.getByText("Major Content Asset", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Existing Page Optimization", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText(
    "contractual recurring deliverable not yet fulfilled",
  );

  const workRow = page.locator(".mx-check-row", { hasText: "Selected:" }).last();
  await workRow.getByRole("button", { name: "Prepare draft" }).click();
  await pollCycleFor(page, /Draft (DRAFT|AWAITING_APPROVAL|APPROVED)/);

  await approveLatestPendingDraft(page);
  await page.goto(firstCycleUrl, { waitUntil: "networkidle" });
  await pollCycleFor(page, /Approval APPROVED/);
  await expect(page.locator("main")).toContainText("Page optimizations");
  await expect(page.locator("main")).toContainText("0 / 1");

  const selectedWork = page.locator(".mx-check-row", { hasText: /Approval APPROVED/ }).last();
  await selectedWork.getByLabel("Manual minutes").fill("45");
  await selectedWork.getByLabel("What changed").fill("Implemented approved metadata.");
  await selectedWork
    .getByLabel("Evidence/reference")
    .fill("https://example.com/e2e-reference");
  await selectedWork.getByRole("button", { name: "Record manual implementation" }).click();
  await expect(page.locator("main")).toContainText("IMPLEMENTED_UNVERIFIED");
  await expect(page.locator("main")).toContainText("45 min");
  await expect(page.locator("main")).toContainText("1 / 1");

  const implementedWork = page
    .locator(".mx-check-row", { hasText: "IMPLEMENTED_UNVERIFIED" })
    .last();
  await implementedWork.getByLabel("Verification state").selectOption("VERIFIED");
  await implementedWork
    .locator('input[name="evidence"]')
    .fill("Human verified Phase 5 change.");
  await implementedWork.getByRole("button", { name: "Record verification" }).click();
  await expect(page.locator("main")).toContainText("VERIFIED");

  await page.getByRole("button", { name: "Generate draft" }).click();
  await expect(page.getByText(/Monthly Optimization Report/)).toBeVisible();
  await expect(page.locator("main")).toContainText("Limitations");
  await page.getByRole("button", { name: "Finalize report" }).click();
  await expect(page.locator("main")).toContainText("FINALIZED");
  await expect(page.locator("main")).toContainText(/[a-f0-9]{64}/);

  await setDeliverableComplete(page, "Weekly Website Health");
  await setDeliverableComplete(page, "Monthly Competitor Review");
  await setDeliverableComplete(page, "Monthly AI-Readiness Recheck");
  await waiveDeliverable(page, "Weekly Search Console");
  await waiveDeliverable(page, "Major Content Asset");

  await page.getByRole("button", { name: "Close cycle" }).click();
  await expect(page.locator("main")).toContainText("CLOSED");
  await expect(page.locator("main")).toContainText("WAIVED");

  await monthlyCyclesNavLink(page).click();
  const currentMonth = new Date().getUTCMonth() + 1;
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextYear = new Date().getUTCFullYear() + (currentMonth === 12 ? 1 : 0);
  await page.getByLabel("Client").selectOption({ label: `${clientName} - GROWTH` });
  await page.getByLabel("Year").fill(String(nextYear));
  await page.getByLabel("Month").fill(String(nextMonth));
  await page.getByRole("button", { name: "Create cycle" }).click();
  await expect(
    page.getByRole("heading", { name: "Monthly Fulfillment Cycle" }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText(clientName);
  await expect(page.locator("main")).toContainText("Growth");
  await expect(page.locator("main")).toContainText(
    "contractual recurring deliverable not yet fulfilled",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(monthlyCyclesNavLink(page)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Enter" }).click();
  await ensureWorkspace(page);
});

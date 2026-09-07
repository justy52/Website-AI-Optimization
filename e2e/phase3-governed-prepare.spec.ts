import { expect, test, type Page } from "@playwright/test";

const timestamp = Date.now();
const runId = `${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
const email = `optiq-phase3-${runId}@example.com`;
const password = `OPTIQPhase3-${runId}!`;
const workspaceName = `OPTIQ Phase 3 QA ${runId}`;
const clientName = `Phase 3 QA Client ${runId}`;
const confidentialCanary = `CONFIDENTIAL_CANARY_${runId}`;
const unverifiedCanary = `UNVERIFIED_CANARY_${runId}`;
const expectedProvider = process.env.OPTIQ_E2E_EXPECT_PROVIDER ?? "deterministic";

async function signUp(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Name").fill("OPTIQ Phase 3 QA");
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
  await expect(
    page.getByRole("link", { name: "Leads", exact: true }),
  ).toBeVisible();
}

async function addBusinessFact(
  page: Page,
  options: {
    factType: string;
    verification: string;
    sensitivity: string;
    value: string;
    source: string;
  },
) {
  const form = page.locator("form").filter({ hasText: "Fact type" }).last();
  await form.getByLabel("Fact type").fill(options.factType);
  await form.getByLabel("Verification").selectOption(options.verification);
  await form.getByLabel("Sensitivity").selectOption(options.sensitivity);
  await form.getByLabel("Value").fill(options.value);
  await form.getByLabel("Source reference").fill(options.source);
  await form.getByRole("button", { name: "Add fact" }).click();
  await expect(page.getByText(options.value)).toBeVisible();
}

async function pollForLink(page: Page, name: RegExp) {
  await expect
    .poll(
      async () => {
        await page.reload({ waitUntil: "networkidle" });
        return page.getByRole("link", { name }).count();
      },
      { timeout: 180_000, intervals: [2_000, 5_000, 10_000] },
    )
    .toBeGreaterThan(0);
}

async function openLatestRunDraftVersionForClient(
  page: Page,
  expectedClientName: string,
  version: number,
) {
  const deadline = Date.now() + 180_000;
  const artifactMarker = `v${version}`;

  while (Date.now() < deadline) {
    await page.goto("/runs", { waitUntil: "networkidle" });
    const runRow = page.locator("main a.mx-row", {
      hasText: expectedClientName,
    }).first();

    if ((await runRow.count()) > 0) {
      await runRow.click();
      const runText = (await page.locator("main").textContent()) ?? "";

      if (runText.includes("SUCCEEDED")) {
        const draftLink = page.getByRole("link", { name: "Open draft artifact" });

        if ((await draftLink.count()) > 0) {
          await draftLink.click();
          await page.waitForLoadState("networkidle");
          const draftText = (await page.locator("main").textContent()) ?? "";

          if (draftText.includes(artifactMarker)) {
            return;
          }
        }
      }
    }

    await page.waitForTimeout(5_000);
  }

  throw new Error(`Timed out waiting for run-backed draft artifact v${version}.`);
}

test.describe.configure({ mode: "serial" });

test("Phase 3 governed prepare workflow on QA", async ({ page }) => {
  test.setTimeout(420_000);

  await signUp(page);
  await ensureWorkspace(page);

  await page.getByRole("link", { name: "Leads", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  await page.getByLabel("Company").fill(clientName);
  await page.getByLabel("Status").selectOption("NEW");
  await page.getByLabel("Source").fill("Phase 3 E2E");
  await page.getByLabel("Contact name").fill("QA User");
  await page.getByLabel("Contact email").fill(email);
  await page.getByLabel("Website URL").fill("https://example.com");
  await page.getByLabel("Notes").fill("Disposable Phase 3 QA record.");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByRole("heading", { name: clientName })).toBeVisible();

  await page.getByLabel("Status").selectOption("QUALIFIED");
  await page.getByRole("button", { name: "Save lead" }).click();
  await expect(page.getByLabel("Status")).toHaveValue("QUALIFIED");
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

  await page.goBack();
  await addBusinessFact(page, {
    factType: "service",
    verification: "VERIFIED",
    sensitivity: "PUBLIC",
    value: "Website optimization",
    source: "QA source",
  });
  await addBusinessFact(page, {
    factType: "pricing",
    verification: "VERIFIED",
    sensitivity: "CONFIDENTIAL",
    value: confidentialCanary,
    source: "QA confidential source",
  });
  await addBusinessFact(page, {
    factType: "service_area",
    verification: "NEEDS_REVIEW",
    sensitivity: "PUBLIC",
    value: unverifiedCanary,
    source: "QA unverified source",
  });

  await page.getByRole("link", { name: "Websites", exact: true }).click();
  await page.getByText("example.com").first().click();
  await page.getByRole("button", { name: "Start audit" }).click();
  await expect(page.getByRole("heading", { name: /Audit/ })).toBeVisible();
  await expect(page.getByText("UNAVAILABLE").first()).toBeVisible();
  await page.getByRole("button", { name: "Finalize audit snapshot" }).click();
  await page.getByRole("button", { name: "Create report" }).click();
  await expect(page.getByText("Executive summary")).toBeVisible();
  await expect(page.getByText("Scoring", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finalize report" }).click();

  await page.getByRole("link", { name: "Opportunities", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Opportunities" })).toBeVisible();
  await page.locator("main a").filter({ hasText: /Priority|Immediate|High|Normal/i }).first().click();
  await expect(page.getByRole("heading")).toBeVisible();
  const opportunityUrl = page.url();
  await expect(page.getByText("Priority explanation")).toBeVisible();
  await page.getByRole("button", { name: "Prepare draft" }).click();

  await pollForLink(page, /Inspect run/);
  await pollForLink(page, /Open approval/);
  await page.getByRole("link", { name: "Inspect run" }).click();
  await expect(page.getByText("Usage and Gateway metadata")).toBeVisible();
  await expect(page.getByText(expectedProvider).first()).toBeVisible();
  if (expectedProvider === "vercel-ai-gateway") {
    await expect(page.locator("main")).toContainText(
      /Actual cost\s*[1-9]\d* cents/,
    );
  } else {
    await expect(page.locator("main")).toContainText(/Actual cost\s*0 cents/);
  }

  await page.goBack();
  await page.getByRole("link", { name: "Review draft" }).click();
  await expect(page.getByText("Factual basis")).toBeVisible();
  await expect(page.getByText(confidentialCanary)).toHaveCount(0);
  await expect(page.getByText(unverifiedCanary)).toHaveCount(0);

  await page.goBack();
  await page.getByRole("link", { name: "Open approval" }).click();
  await expect(page.getByText("Pending")).toBeVisible();
  await expect(
    page.getByText(
      "Approval is for this internal draft version only. It does not publish, email, edit a website, or call an EXECUTE tool.",
    ),
  ).toBeVisible();
  await page.getByLabel("Decision").selectOption("APPROVED_UNCHANGED");
  await page
    .getByLabel("Comments")
    .fill("E2E approves exact v1 for manual implementation only.");
  await page.getByRole("button", { name: "Record human decision" }).click();
  await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();

  await page.goto(opportunityUrl);
  await page.getByRole("button", { name: "Prepare draft" }).click();
  await openLatestRunDraftVersionForClient(page, clientName, 2);
  await page.getByRole("link", { name: "Approval", exact: true }).click();
  await expect(page.getByText("Pending")).toBeVisible();
  await expect(page.locator("main")).toContainText(/Version\s*2/i);
  await page.getByLabel("Decision").selectOption("CHANGES_REQUESTED");
  await page.getByLabel("Comments").fill("E2E requests a revised v2 draft.");
  await page.getByRole("button", { name: "Record human decision" }).click();
  await expect(page.getByText("CHANGES_REQUESTED").first()).toBeVisible();

  await page.getByRole("link", { name: "Work Plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Work Plan" })).toBeVisible();
  await page.getByRole("link", { name: "Runs", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Agent Runs" })).toBeVisible();
  await page.getByRole("link", { name: "Approvals", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Approval Queue" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Opportunities", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Enter" }).click();
  await ensureWorkspace(page);
});

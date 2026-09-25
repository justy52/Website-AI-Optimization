import { expect, test, type Page } from "@playwright/test";
async function visibilitySubmit(page: Page, label: string) {
  const responsePromise = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/ai-visibility");
  await page.getByRole("button", { name: label, exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBeLessThan(400);
  // Action headers arrive after the committed mutation/redirect. The RSC body
  // can remain streaming, so it is not a useful completion boundary here.
  await page.reload({ waitUntil: "domcontentloaded" });
}
async function fact(page: Page, type: string, value: string) {
  const form = page.locator("form").filter({ hasText: "Fact type" }).last();
  await form.getByLabel("Fact type").fill(type); await form.getByLabel("Verification").selectOption("VERIFIED"); await form.getByLabel("Sensitivity").selectOption("PUBLIC"); await form.getByLabel("Value").fill(value); await form.getByLabel("Source reference").fill("Human verified synthetic Phase 9 QA fixture"); await form.getByRole("button", { name: "Add fact" }).click(); await expect(page.getByText(value, { exact: true })).toBeVisible();
}
test("Phase 9 verified prompts, sampled fixture metrics, honest accounting and immutable history", async ({ page }) => {
  test.setTimeout(600_000);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, email = `optiq-phase9-${id}@example.com`, password = `Phase9-${id}!`, clientName = `Phase 9 QA ${id}`;
  await page.goto("/login"); await page.getByRole("button", { name: "Create account" }).click(); await page.getByLabel("Name").fill("Visibility QA Operator"); await page.getByLabel("Email").fill(email); await page.getByLabel("Password").fill(password); await page.getByRole("button", { name: "Enter" }).click(); await expect(page).toHaveURL(/workspace-setup/);
  await page.getByLabel("Workspace name").fill(clientName); await page.getByRole("button", { name: "Create workspace" }).click(); await expect(page.getByRole("heading", { name: "Command Center", exact: true })).toBeVisible();
  await page.goto("/leads"); await page.getByLabel("Company").fill(clientName); await page.getByLabel("Status").selectOption("NEW"); await page.getByLabel("Source").fill("Phase 9 E2E"); await page.getByLabel("Contact name").fill("QA Operator"); await page.getByLabel("Contact email").fill(email); await page.getByLabel("Website URL").fill("https://example.com"); await page.getByRole("button", { name: "Create lead" }).click(); await expect(page.getByRole("heading", { name: clientName })).toBeVisible();
  await page.getByLabel("Status").selectOption("QUALIFIED"); await page.getByRole("button", { name: "Save lead" }).click(); await page.getByRole("button", { name: "Convert to client" }).click(); await expect(page).toHaveURL(/clients\/[a-f0-9-]+$/); await page.getByLabel("Service plan").selectOption("GROWTH"); await page.getByRole("button", { name: "Save client" }).click(); const clientUrl = page.url();
  await fact(page, "business_name", "Cedar Plumbing"); await fact(page, "canonical_domain", "cedar.example"); await fact(page, "service", "plumbing"); await fact(page, "location", "Denver");
  await page.getByLabel("Display name").fill("Phase 9 public audit target"); await page.getByLabel("Canonical URL").fill("https://example.com"); await page.getByLabel("Domain", { exact: true }).fill("example.com"); await page.getByLabel("Authorization scope").selectOption("PUBLIC_PAGES_ONLY"); await page.getByRole("button", { name: "Add website" }).click(); await expect(page).toHaveURL(/websites\/[a-f0-9-]+$/); const websiteUrl = page.url();
  const competitor = page.locator("form").filter({ has: page.getByRole("button", { name: "Add competitor" }) }); await competitor.getByLabel("Name", { exact: true }).fill("Aspen Plumbing"); await competitor.getByLabel("Domain or URL").fill("https://aspen.example"); await competitor.getByRole("button", { name: "Add competitor" }).click(); await expect(page.getByText("Aspen Plumbing", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start audit" }).click(); await expect(page.getByRole("heading", { name: /Audit/ })).toBeVisible(); const auditUrl = page.url(); await page.getByRole("button", { name: "Finalize audit snapshot" }).click(); await expect(page.getByText("Audit snapshot finalized.", { exact: true })).toBeVisible();
  await page.goto(websiteUrl); await page.getByRole("link", { name: "Observed AI Visibility", exact: true }).click(); await expect(page.getByRole("heading", { name: "Observed AI Visibility", exact: true })).toBeVisible(); const visibilityUrl = page.url();
  await expect(page.locator("main")).toContainText("UNAVAILABLE / PROVIDER NOT CONFIGURED"); await visibilitySubmit(page, "Approve configured competitor aliases"); await visibilitySubmit(page, "Generate versioned prompt set"); await expect(page.getByTestId("prompt-set")).toContainText("version 1"); await expect(page.locator("main")).toContainText("What are the best plumbing companies in Denver?");
  await visibilitySubmit(page, "Run deterministic QA fixture");
  const fixture = page.getByTestId("visibility-run").filter({ has: page.getByRole("heading", { name: "QA deterministic fixture (not provider evidence)", exact: true }) });
  await expect.poll(async () => { await page.reload({ waitUntil: "domcontentloaded" }); return fixture.textContent(); }, { timeout: 150000, intervals: [2000, 4000] }).toContain("SUCCEEDED");
  await expect(fixture).toContainText("DIRECT_RECOMMENDATION"); await expect(fixture).toContainText("client citations 1"); await expect(fixture).toContainText("competitor citations 1"); await expect(fixture).toContainText("Mention rate 100.0%"); await expect(fixture).toContainText("Share of mentions 50.0%");
  await fixture.getByRole("link").first().click(); await expect(page.getByRole("heading", { name: "AI Visibility Observation", exact: true })).toBeVisible(); await expect(page.locator("main")).toContainText("ai-vis-parser-v1.1"); await expect(page.locator("main")).toContainText("Synthetic QA fixture"); const historyUrl = page.url();
  await page.goto(visibilityUrl); await visibilitySubmit(page, "Run deterministic QA fixture"); await expect(fixture).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Run API observations", exact: true })).toHaveCount(0);
  await expect(page.locator("main")).toContainText("No API run or cadence window is reserved");
  await expect(page.getByTestId("visibility-run").filter({ has: page.getByRole("heading", { name: "Perplexity Agent API", exact: true }) })).toHaveCount(0);
  await page.getByLabel("Manual surface", { exact: true }).fill("QA manually reviewed consumer surface");
  await page.getByLabel("Observed timestamp (UTC)").fill(new Date().toISOString().slice(0, 16));
  await page.getByLabel("Captured answer").fill("Cedar Plumbing serves Denver.");
  await page.getByLabel("Evidence reference and limitations").fill("Synthetic manual evidence; no provider request.");
  await visibilitySubmit(page, "Record MANUAL observation");
  await expect(page.getByTestId("visibility-run").filter({ has: page.getByRole("heading", { name: "QA manually reviewed consumer surface", exact: true }) })).toContainText("MANUAL");
  await page.goto("/monthly-cycles"); await page.getByLabel("Client").selectOption({ label: `${clientName} - GROWTH` }); await page.getByRole("button", { name: "Create cycle" }).click(); await expect(page.getByRole("heading", { name: "Monthly Fulfillment Cycle" })).toBeVisible();
  const deliverable = page.locator(".mx-check-row").filter({ hasText: "Observed AI Visibility" }).first(); await expect(deliverable).toContainText("UNAVAILABLE"); await expect(deliverable).toContainText("0/1"); await page.getByRole("button", { name: "Generate draft" }).click(); await expect(page.locator("main")).toContainText("No legitimate API visibility samples");
  await page.goto(clientUrl); await fact(page, "service_subtype", "drain cleaning"); await page.goto(visibilityUrl); await visibilitySubmit(page, "Generate versioned prompt set"); await expect(page.getByTestId("prompt-set")).toContainText("version 2"); await page.goto(historyUrl); await expect(page.locator("main")).toContainText("We recommend Cedar Plumbing");
  await page.goto(auditUrl); await expect(page.getByText("Audit snapshot finalized.", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(visibilityUrl); await expect(page.getByRole("heading", { name: "Observed AI Visibility", exact: true })).toBeVisible(); await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click(); await expect(page).toHaveURL(/login/); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.getByLabel("Email").fill(email); await page.getByLabel("Password").fill(password); await page.getByRole("button", { name: "Enter" }).click(); await expect(page.getByRole("heading", { name: "Command Center", exact: true })).toBeVisible(); await page.goto(historyUrl); await expect(page.locator("main")).toContainText("ai-vis-parser-v1.1");
});

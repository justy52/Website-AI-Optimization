import { expect, test, type Page, type Locator } from "@playwright/test";

async function serverAction(page: Page, button: Locator) {
  const path = new URL(page.url()).pathname;
  const [response] = await Promise.all([
    page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === path, { timeout: 90_000 }),
    button.click(),
  ]);
  expect(response.status()).toBeLessThan(400);
}

async function fact(page: Page, type: string, value: string) {
  const form = page.locator("form").filter({ hasText: "Fact type" }).last();
  await form.getByLabel("Fact type").fill(type);
  await form.getByLabel("Verification").selectOption("VERIFIED");
  await form.getByLabel("Sensitivity").selectOption("PUBLIC");
  await form.getByLabel("Value").fill(value);
  await form.getByLabel("Source reference").fill("Authorized QA factual review");
  await form.getByRole("button", { name: "Add fact" }).click();
  await expect(page.getByText(value, { exact: true })).toBeVisible();
}
async function prepared(page: Page) {
  await expect.poll(async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    return page.getByRole("link", { name: "Review draft", exact: true }).count();
  }, { timeout: 120_000, intervals: [2_000, 4_000] }).toBeGreaterThan(0);
}
async function openOpportunity(page: Page, check: string) {
  await page.goto("/opportunities");
  await page.locator("main a.mx-row").filter({ hasText: check }).first().click();
}
test("Phase 6 governed content, links and schema PREPARE", async ({ page }) => {
  test.setTimeout(600_000);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const email = `optiq-phase6-${id}@example.com`;
  const clientName = `Phase 6 QA ${id}`;
  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Name").fill("Phase 6 Operator");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(`Phase6-${id}!`);
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page).toHaveURL(/workspace-setup/);
  await page.getByLabel("Workspace name").fill(clientName);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByRole("link", { name: "Leads", exact: true }).click();
  await page.getByLabel("Company").fill(clientName);
  await page.getByLabel("Status").selectOption("NEW");
  await page.getByLabel("Source").fill("Phase 6 E2E");
  await page.getByLabel("Contact name").fill("QA Operator");
  await page.getByLabel("Contact email").fill(email);
  await page.getByLabel("Website URL").fill("https://example.com");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByRole("heading", { level: 1,  name: clientName })).toBeVisible();
  await page.getByLabel("Status").selectOption("QUALIFIED");
  await page.getByRole("button", { name: "Save lead" }).click();
  await page.getByRole("button", { name: "Convert to client" }).click();
  await expect(page.getByRole("heading", { level: 1,  name: clientName })).toBeVisible();
  await page.getByLabel("Service plan").selectOption("GROWTH");
  await page.getByRole("button", { name: "Save client" }).click();
  const clientUrl = page.url();
  await fact(page, "service", "Website optimization");
  await page.getByLabel("Display name").fill("Example Phase 6");
  await page.getByLabel("Canonical URL").fill("https://example.com");
  await page.getByLabel("Domain").fill("example.com");
  await page.getByLabel("Authorization scope").selectOption("PUBLIC_PAGES_ONLY");
  await page.getByRole("button", { name: "Add website" }).click();
  await page.getByRole("button", { name: "Start audit" }).click();
  await expect(page.getByRole("heading", { name: /Audit/, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Finalize audit snapshot" }).click();
  await page.goto("/opportunities");
  await page.getByLabel("Proposed topic").fill("Guide to website optimization");
  await page.getByLabel("Editorial rationale").fill("Human editorial request for an educational overview based on the verified service; search demand is unknown.");
  await page.getByRole("button", { name: "Nominate Opportunity" }).click();
  await expect(page.getByRole("button", { name: "Prepare Content Brief" })).toBeVisible();
  const contentOpportunity = page.url();
  await page.goto("/monthly-cycles");
  await page.getByLabel("Client").selectOption({ label: `${clientName} - GROWTH` });
  await page.getByRole("button", { name: "Create cycle" }).click();
  await expect(page.getByRole("heading", { level: 1,  name: "Monthly Fulfillment Cycle" })).toBeVisible();
  const cycleUrl = page.url();
  const contentWork = page.locator(".mx-check-row").filter({ has: page.getByRole("button", { name: "Prepare Content Brief" }) }).first();
  await serverAction(page, contentWork.getByRole("button", { name: "Prepare Content Brief" }));
  await prepared(page);
  await contentWork.getByRole("link", { name: "Review draft" }).click();
  await expect(page.locator("main")).toContainText("CONTENT_BRIEF");
  await expect(page.locator("main")).toContainText("Search Console metrics are not supplied");
  await expect(page.locator("main")).toContainText("Website optimization");
  const firstArtifactUrl = page.url();
  await page.getByRole("link", { name: "Approval", exact: true }).click();
  await page.getByLabel("Decision").selectOption("APPROVED_UNCHANGED");
  await page.getByLabel("Comments").fill("Approve brief only; no article has been implemented.");
  await page.getByRole("button", { name: "Record human decision" }).click();
  await page.goto(cycleUrl);
  const major = page.locator(".mx-check-row", { hasText: "Major Content Asset" }).first();
  await expect(major).toContainText("0/1");
  await expect(contentWork).toContainText("APPROVED");
  await expect(contentWork).not.toContainText("IMPLEMENTED_UNVERIFIED");
  await page.goto(contentOpportunity);
  await serverAction(page, page.getByRole("button", { name: "Prepare Content Brief" }));
  await expect.poll(async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    const link = page.getByRole("link", { name: "Review draft", exact: true });
    return (await link.count()) > 0 && (await link.getAttribute("href")) !== new URL(firstArtifactUrl).pathname;
  }, { timeout: 120_000, intervals: [2_000, 4_000] }).toBe(true);
  await page.getByRole("link", { name: "Review draft", exact: true }).click();
  await expect(page.locator("main")).toContainText("AWAITING_APPROVAL");
  await expect(page.locator("main")).toContainText("v2");
  await page.goto(firstArtifactUrl);
  await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();

  await openOpportunity(page, "seo.internal_links");
  await serverAction(page, page.getByRole("button", { name: "Prepare Internal Links" }));
  await prepared(page);
  await page.getByRole("link", { name: "Review draft", exact: true }).click();
  await expect(page.locator("main")).toContainText("INTERNAL_LINK_PROPOSAL");
  await expect(page.locator("main")).toContainText("human input");

  await page.goto("/opportunities");
  await page.getByLabel("Work type").selectOption("SCHEMA");
  await page.getByLabel("Proposed topic").fill("Review missing business structured data");
  await page.getByLabel("Editorial rationale").fill("Human review of the actual audit schema warning; verified entity facts are still needed.");
  await page.getByRole("button", { name: "Nominate Opportunity" }).click();
  await expect(page.getByRole("button", { name: "Prepare Schema" })).toBeVisible();
  const schemaOpportunity = page.url();
  await serverAction(page, page.getByRole("button", { name: "Prepare Schema" }));
  await prepared(page);
  await page.getByRole("link", { name: "Review draft", exact: true }).click();
  await expect(page.locator("main")).toContainText("SCHEMA_PROPOSAL");
  await expect(page.locator("main")).toContainText("No JSON-LD was generated");
  const missingSchemaArtifact = new URL(page.url()).pathname;
  await page.getByRole("link", { name: "Approval", exact: true }).click();
  await page.getByLabel("Decision").selectOption("CHANGES_REQUESTED");
  await page.getByLabel("Comments").fill("Provide verified entity facts before proposing JSON-LD.");
  await page.getByRole("button", { name: "Record human decision" }).click();
  await page.goto(clientUrl);
  await fact(page, "business_name", "Example Entity");
  await fact(page, "website_url", "https://example.com/");
  await page.goto(schemaOpportunity);
  await serverAction(page, page.getByRole("button", { name: "Prepare Schema" }));
  await expect.poll(async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    const link = page.getByRole("link", { name: "Review draft", exact: true });
    return (await link.count()) > 0 && (await link.getAttribute("href")) !== missingSchemaArtifact;
  }, { timeout: 120_000, intervals: [2_000, 4_000] }).toBe(true);
  await page.getByRole("link", { name: "Review draft", exact: true }).click();
  await expect(page.locator("main")).toContainText("Example Entity");
  await expect(page.locator("main")).toContainText("https://schema.org");
  await expect(page.locator("main")).toContainText("AWAITING_APPROVAL");
  await expect(page.locator("main")).toContainText("v2");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(cycleUrl);
  await expect(major).toContainText("0/1");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
});

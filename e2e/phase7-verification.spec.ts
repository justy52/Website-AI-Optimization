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
  await form.getByLabel("Source reference").fill("Fixed public OPTIQ QA test fixture; no customer claims");
  await form.getByRole("button", { name: "Add fact" }).click();
  await expect(page.getByText(value, { exact: true })).toBeVisible();
}
const work = (page: Page, opportunityId: string) => page.locator(".mx-check-row").filter({ has: page.locator(`input[name="opportunityId"][value="${opportunityId}"]`) });
async function ensureWork(page: Page, opportunityId: string) {
  if (!(await work(page, opportunityId).count())) {
    await page.getByRole("combobox", { name: "Opportunity", exact: true }).selectOption(opportunityId);
    await page.getByLabel("Override reason").fill("Explicit QA verification test; extra work is not additional included entitlement.");
    await page.getByRole("button", { name: "Add to cycle" }).click();
    await expect(work(page, opportunityId)).toBeVisible();
  }
}
async function prepareAndPackage(page: Page, cycleUrl: string, opportunityId: string, action = "Prepare Page Optimization") {
  await page.goto(cycleUrl); await ensureWork(page, opportunityId);
  await serverAction(page, work(page, opportunityId).getByRole("button", { name: action }));
  await expect.poll(async () => { await page.reload({ waitUntil: "domcontentloaded" }); return work(page, opportunityId).getByRole("link", { name: "Review draft" }).count(); }, { timeout: 120_000, intervals: [2000, 4000] }).toBe(1);
  await work(page, opportunityId).getByRole("link", { name: "Review draft" }).click();
  await expect(page).toHaveURL(/\/drafts\/[a-f0-9-]+$/);
  const artifactUrl = page.url();
  await page.getByRole("link", { name: "Approval", exact: true }).click();
  await page.getByLabel("Decision").selectOption("APPROVED_UNCHANGED");
  await page.getByLabel("Comments").fill("Approve exact QA fixture proposal for human review, no external execution.");
  await serverAction(page, page.getByRole("button", { name: "Record human decision" }));
  await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
  await page.goto(artifactUrl);
  await page.getByRole("button", { name: "Create implementation package" }).click();
  await expect(page.getByRole("heading", { level: 1,  name: "Implementation Package", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/implementation-packages\/[a-f0-9-]+$/);
  await expect(page.locator("main")).toContainText("Approved artifact v1");
  const packageId = new URL(page.url()).pathname.split("/").pop()!;
  await page.goto(cycleUrl);
  await expect(work(page, opportunityId)).not.toContainText("IMPLEMENTED_UNVERIFIED");
  await work(page, opportunityId).getByLabel("Approved version implemented").selectOption(packageId);
  await work(page, opportunityId).getByLabel("Manual minutes").fill("5");
  await work(page, opportunityId).getByLabel("What changed").fill("Human QA implementation declaration for the exact approved fixture version. No external site was edited.");
  await work(page, opportunityId).getByLabel("Evidence/reference").fill("Read-only scheduled QA fixture; verifier must independently establish actual public state.");
  await work(page, opportunityId).getByRole("button", { name: "Record manual implementation" }).click();
  await expect(work(page, opportunityId)).toContainText("IMPLEMENTED_UNVERIFIED");
  return { packageId, artifactUrl };
}
async function verify(page: Page, opportunityId: string, result: string) {
  await serverAction(page, work(page, opportunityId).getByRole("button", { name: "Verify implementation", exact: true }));
  await expect.poll(async () => { await page.reload({ waitUntil: "domcontentloaded" }); return work(page, opportunityId).locator(".mx-chip").allTextContents(); }, { timeout: 120_000, intervals: [2000, 4000] }).toContain(result);
}

test("Phase 7 exact packages, independent pass/fail/retry and immutable history", async ({ page, request }) => {
  test.setTimeout(900_000);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `optiq-phase7-${id}@example.com`; const password = `Phase7-${id}!`; const client = `Phase 7 QA ${id}`;
  await page.goto("/login"); await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Name").fill("Verification QA Operator"); await page.getByLabel("Email").fill(email); await page.getByLabel("Password").fill(password); await page.getByRole("button", { name: "Enter" }).click();
  await expect(page).toHaveURL(/workspace-setup/); await page.getByLabel("Workspace name").fill(client); await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByRole("link", { name: "Leads", exact: true }).click();
  await page.getByLabel("Company").fill(client); await page.getByLabel("Status").selectOption("NEW"); await page.getByLabel("Source").fill("Phase 7 QA");
  await page.getByLabel("Contact name").fill("QA Operator"); await page.getByLabel("Contact email").fill(email); await page.getByLabel("Website URL").fill("https://optiq-qa.vercel.app");
  await page.getByRole("button", { name: "Create lead" }).click(); await expect(page.getByRole("heading", { level: 1,  name: client })).toBeVisible();
  await page.getByLabel("Status").selectOption("QUALIFIED"); await page.getByRole("button", { name: "Save lead" }).click(); await page.getByRole("button", { name: "Convert to client" }).click();
  await page.getByLabel("Service plan").selectOption("GROWTH"); await page.getByRole("button", { name: "Save client" }).click();
  await fact(page, "service", "Verification fixture"); await fact(page, "business_name", "OPTIQ QA Fixture");
  const readyAt = Date.now() + 90_000; const correctAt = readyAt + 240_000;
  const target = `https://optiq-qa.vercel.app/api/qa/verification-fixture?readyAt=${readyAt}&correctAt=${correctAt}`;
  expect(await (await request.get(target)).text()).toContain("<title>Home</title>");
  await page.getByLabel("Display name").fill("Public read-only verification fixture"); await page.getByLabel("Canonical URL").fill(target); await page.getByLabel("Domain").fill("optiq-qa.vercel.app");
  await page.getByLabel("Authorization scope").selectOption("PUBLIC_PAGES_ONLY"); await page.getByRole("button", { name: "Add website" }).click();
  await page.getByRole("button", { name: "Start audit" }).click(); await expect(page.getByRole("heading", { name: /Audit/, level: 1 })).toBeVisible(); await page.getByRole("button", { name: "Finalize audit snapshot" }).click();
  await page.goto("/opportunities");
  const titleId = (await page.locator("main a.mx-row").filter({ hasText: "seo.title" }).first().getAttribute("href"))!.split("/").pop()!;
  // Lesser audit warnings are intentionally not auto-created. Use the existing
  // human schema nomination from real audit evidence for a distinct second item.
  await page.getByLabel("Work type").selectOption("SCHEMA");
  await page.getByLabel("Proposed topic").fill("Verify the QA fixture entity schema");
  await page.getByLabel("Editorial rationale").fill("Human review of the captured missing structured-data audit finding on the harmless public QA fixture.");
  await page.getByRole("button", { name: "Nominate Opportunity" }).click();
  await expect(page.getByRole("button", { name: "Prepare Schema" })).toBeVisible();
  await expect(page).toHaveURL(/\/opportunities\/[a-f0-9-]+$/);
  const schemaId = new URL(page.url()).pathname.split("/").pop()!;
  await page.goto("/monthly-cycles"); await page.getByLabel("Client").selectOption({ label: `${client} - GROWTH` }); await page.getByRole("button", { name: "Create cycle" }).click();
  await expect(page.getByRole("heading", { level: 1,  name: "Monthly Fulfillment Cycle" })).toBeVisible();
  await expect(page).toHaveURL(/\/monthly-cycles\/[a-f0-9-]+$/);
  const cycleUrl = page.url();
  const titlePackage = await prepareAndPackage(page, cycleUrl, titleId);
  await expect.poll(async () => (await (await request.get(target)).text()).includes("<title>Verification fixture | OPTIQ QA Fixture</title>"), { timeout: 120_000, intervals: [3000] }).toBe(true);
  await verify(page, titleId, "VERIFIED");
  const titleCredit = (await page.locator(".mx-method").filter({ hasText: "Page optimizations" }).textContent())!;
  await page.getByRole("link", { name: "Verification VERIFIED", exact: true }).first().click();
  await expect(page.locator("main")).toContainText("DETERMINISTIC"); await expect(page.locator("main")).toContainText("public-html-verifier-v1.0"); await expect(page.locator("main")).toContainText("observed");
  await prepareAndPackage(page, cycleUrl, schemaId, "Prepare Schema");
  expect(Date.now(), "Mismatch must be observed before the scheduled fixture correction").toBeLessThan(correctAt);
  await verify(page, schemaId, "VERIFICATION_FAILED");
  await expect(page.locator(".mx-method").filter({ hasText: "Page optimizations" })).toHaveText(titleCredit);
  await expect(work(page, titleId)).toContainText("VERIFIED");
  await serverAction(page, page.getByRole("button", { name: "Generate draft" }));
  await expect(page.locator("main")).toContainText("Verification Attention"); await expect(page.locator("main")).toContainText("VERIFICATION_FAILED");
  await expect.poll(async () => (await (await request.get(target)).text()).includes('"name":"OPTIQ QA Fixture"'), { timeout: 480_000, intervals: [15_000] }).toBe(true);
  await verify(page, schemaId, "VERIFIED");
  await expect(page.getByRole("link", { name: "Verification VERIFIED", exact: true })).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Verification VERIFICATION_FAILED", exact: true })).toHaveCount(1);
  await serverAction(page, page.getByRole("button", { name: "Generate draft" }));
  const completed = page.locator("div").filter({ has: page.getByRole("heading", { level: 1,  name: "Work Completed", exact: true }) }).last();
  await expect(completed).toContainText("VERIFIED"); await expect(completed).not.toContainText("VERIFICATION_FAILED");
  await expect(page.locator(".mx-method").filter({ hasText: "Manual minutes" })).toContainText("10 /");
  await page.goto(`/implementation-packages/${titlePackage.packageId}`); await expect(page.locator("main")).toContainText("Approved artifact v1");
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(cycleUrl); await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click(); await expect(page).toHaveURL(/login/); await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill(email); await page.getByLabel("Password").fill(password); await page.getByRole("button", { name: "Enter" }).click();
  await expect(page).not.toHaveURL(/login/);
  await page.goto(cycleUrl); await expect(work(page, titleId)).toContainText("VERIFIED"); await expect(work(page, schemaId)).toContainText("VERIFIED");
});

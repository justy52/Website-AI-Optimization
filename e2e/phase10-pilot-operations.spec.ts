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
  await form.getByLabel("Fact type").fill(type); await form.getByLabel("Verification").selectOption("VERIFIED"); await form.getByLabel("Sensitivity").selectOption("PUBLIC"); await form.getByLabel("Value").fill(value); await form.getByLabel("Source reference").fill("Human verified synthetic Phase 10 QA fixture"); await form.getByRole("button", { name: "Add fact" }).click(); await expect(page.getByText(value, { exact: true })).toBeVisible();
}
test("Phase 10 pilot operations, pause, budget, retention, export and accessibility", async ({ page }) => {
  test.setTimeout(600_000);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, email = `optiq-phase10-${id}@example.com`, password = `Phase9-${id}!`, clientName = `Phase 10 QA ${id}`;
  await page.goto("/login"); await page.getByRole("button", { name: "Create account" }).click(); await page.getByLabel("Name").fill("Visibility QA Operator"); await page.getByLabel("Email").fill(email); await page.getByLabel("Password").fill(password); await page.getByRole("button", { name: "Enter" }).click(); await expect(page).toHaveURL(/workspace-setup/);
  await page.getByLabel("Workspace name").fill(clientName); await page.getByRole("button", { name: "Create workspace" }).click(); await expect(page.getByRole("heading", { name: "Command Center", exact: true })).toBeVisible();
  await page.goto("/leads"); await page.getByLabel("Company").fill(clientName); await page.getByLabel("Status").selectOption("NEW"); await page.getByLabel("Source").fill("Phase 9 E2E"); await page.getByLabel("Contact name").fill("QA Operator"); await page.getByLabel("Contact email").fill(email); await page.getByLabel("Website URL").fill("https://example.com"); await page.getByRole("button", { name: "Create lead" }).click(); await expect(page.getByRole("heading", { name: clientName })).toBeVisible();
  await page.getByLabel("Status").selectOption("QUALIFIED"); await page.getByRole("button", { name: "Save lead" }).click(); await page.getByRole("button", { name: "Convert to client" }).click(); await expect(page).toHaveURL(/clients\/[a-f0-9-]+$/); await page.getByLabel("Service plan").selectOption("GROWTH"); await page.getByRole("button", { name: "Save client" }).click();
  await fact(page, "business_name", "Cedar Plumbing"); await fact(page, "canonical_domain", "cedar.example"); await fact(page, "service", "plumbing"); await fact(page, "location", "Denver");
  await page.getByLabel("Display name").fill("Phase 9 public audit target"); await page.getByLabel("Canonical URL").fill("https://example.com"); await page.getByLabel("Domain", { exact: true }).fill("example.com"); await page.getByLabel("Authorization scope").selectOption("PUBLIC_PAGES_ONLY"); await page.getByRole("button", { name: "Add website" }).click(); await expect(page).toHaveURL(/websites\/[a-f0-9-]+$/); const websiteUrl = page.url();

  await page.getByRole("button", {name:"Start audit"}).click();
  await expect(page.getByRole("heading", {name:/Audit/,level:1})).toBeVisible();
  await page.getByRole("button", {name:"Finalize audit snapshot"}).click();
  await expect(page.getByText("Audit snapshot finalized.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Create report"}).click();await page.getByRole("button",{name:"Finalize report"}).click();
  await page.goto("/opportunities?websiteId="+new URL(websiteUrl).pathname.split("/").pop());
  await page.locator("main a.mx-row").filter({hasText:/seo.title|seo.meta_description|seo.heading_structure|conv.primary_cta/}).first().click();
  const opportunityUrl=page.url();const opportunityId=new URL(opportunityUrl).pathname.split("/").pop()!;
  await page.goto("/operations");await expect(page.getByRole("heading",{name:"Operations",exact:true,level:1})).toBeVisible();
  const pause=page.locator("form").filter({has:page.getByRole("button",{name:"Update workspace pause"})});
  await pause.getByLabel("Reason",{exact:true}).fill("QA pause exercise");await pause.getByRole("button").click();await expect(page.locator("main")).toContainText("AUTOMATION PAUSED");
  await page.goto(opportunityUrl);await page.getByRole("button",{name:"Prepare Page Optimization"}).click();await expect(page.locator("main").getByRole("alert")).toContainText("Automation is paused");
  await pause.getByRole("combobox",{name:"Change",exact:true}).selectOption("false");await pause.getByLabel("Reason",{exact:true}).fill("QA resume exercise");await pause.getByRole("button").click();await expect(page.getByRole("status")).toContainText("Operation completed");
  const budget=page.locator("form").filter({has:page.getByRole("button",{name:"Save workspace budgets"})});
  await budget.getByLabel("Active workflow ceiling",{exact:true}).fill("0");await budget.getByLabel("Budget-change reason").fill("QA zero active workflow ceiling");await budget.getByRole("button").click();await expect(page.getByRole("status")).toBeVisible();
  await page.goto(opportunityUrl);await page.getByRole("button",{name:"Prepare Page Optimization"}).click();await expect(page.locator("main").getByRole("alert")).toContainText("active workflow ceiling");
  await budget.getByLabel("Active workflow ceiling",{exact:true}).fill("5");await budget.getByLabel("Budget-change reason").fill("QA restore conservative ceiling");await budget.getByRole("button").click();await expect(page.getByRole("status")).toBeVisible();
  await page.goto(opportunityUrl);await page.getByRole("button",{name:"Prepare Page Optimization"}).click();
  await expect.poll(async()=>{await page.reload({waitUntil:"domcontentloaded"});return page.getByRole("link",{name:"Review draft",exact:true}).count()},{timeout:150000,intervals:[2000,4000]}).toBe(1);
  await page.goto(websiteUrl);await page.getByRole("link",{name:"Observed AI Visibility",exact:true}).click();
  await visibilitySubmit(page,"Generate versioned prompt set");await expect(page.locator("main")).toContainText("PROVIDER NOT CONFIGURED");await expect(page.getByRole("button",{name:"Run API observations"})).toHaveCount(0);
  await page.goto("/operations");await page.getByLabel("QA website ID for retention exercise").fill(new URL(websiteUrl).pathname.split("/").pop()!);await page.getByRole("button",{name:"Create synthetic retention captures"}).click();await expect(page.getByRole("status")).toContainText("one expired and one current");
  await page.getByLabel("Cleanup mode").selectOption("false");await page.getByRole("button",{name:"Run retention cleanup"}).click();await expect(page.getByRole("status")).toContainText("1 deleted");
  await page.getByLabel("Cleanup mode").selectOption("true");await page.getByRole("button",{name:"Run retention cleanup"}).click();await expect(page.getByRole("status")).toContainText("0 expired eligible");
  const exported=await page.request.get("/api/workspace-export");expect(exported.status()).toBe(200);const data=await exported.json();
  expect(data.exportVersion).toBe("optiq-workspace-v1");expect(data.counts.ai_visibility_observations).toBe(2);expect(data.counts.clients).toBe(1);expect(data.counts.reports).toBe(1);
  for(const [key,rows]of Object.entries(data.data))expect(data.counts[key]).toBe((rows as unknown[]).length);
  expect(JSON.stringify(data)).not.toMatch(/integration_secrets|access_token|refresh_token|ciphertext|BETTER_AUTH_SECRET/);
  await expect(page.locator("main")).toContainText("PREPARE");await expect(page.locator("main")).toContainText("Production EXECUTE: DISABLED");
  const statuses:number[]=[];
  for(let n=0;n<13;n++){const response=await page.request.post("/api/agent-runs/prepare",{headers:{origin:new URL(page.url()).origin},data:{opportunityId}});statuses.push(response.status());}
  expect(statuses).toContain(429);expect(statuses).not.toContain(500);
  for(const path of ["/","/clients","/websites","/audits","/opportunities","/monthly-cycles","/approvals","/ai-visibility","/operations","/qa-execution"]){
    await page.goto(path);await expect(page.locator("main")).toBeVisible();await expect(page.getByRole("heading",{level:1})).toHaveCount(1);
    const missing=await page.locator('main input:not([type="hidden"]), main select, main textarea').evaluateAll(elements=>elements.filter(el=>!(el as HTMLInputElement).labels?.length&&!el.getAttribute("aria-label")&&!el.getAttribute("aria-labelledby")).map(el=>el.getAttribute("name")));
    expect(missing,`Unlabeled controls at ${path}`).toEqual([]);
  }
  await page.goto("/operations");await page.keyboard.press("Tab");await expect(page.getByRole("link",{name:"Skip to main content"})).toBeFocused();
  await page.keyboard.press("Enter");await expect(page.locator("main")).toBeFocused();
  await page.setViewportSize({width:390,height:844});await expect(page.getByRole("heading",{name:"Operations",level:1})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});

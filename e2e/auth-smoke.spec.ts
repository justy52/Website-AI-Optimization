import { expect, test } from "@playwright/test";

test("deployment auth and Monthly Cycles session smoke", async ({ page }) => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `optiq-auth-${id}@example.com`;
  const password = `OPTIQ-Auth-${id}!`;
  const originFailures: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/auth/") && response.status() === 403) originFailures.push(response.url());
  });
  await page.goto("/monthly-cycles");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Name").fill("OPTIQ Auth Smoke");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page).toHaveURL(/\/workspace-setup/);
  await page.getByLabel("Workspace name").fill(`OPTIQ Auth ${id}`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("link", { name: "Monthly Cycles", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1,  name: "Monthly Cycles" })).toBeVisible();
  await nav.getByRole("link", { name: "Clients", exact: true }).click();
  await page.goto("/monthly-cycles");
  await expect(page.getByRole("heading", { level: 1,  name: "Monthly Cycles" })).toBeVisible();
  const session = await page.request.get("/api/auth/get-session");
  expect((await session.json()).user.email).toBe(email);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(nav).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/monthly-cycles");
  await expect(page.getByRole("heading", { level: 1,  name: "Monthly Cycles" })).toBeVisible();
  expect(originFailures).toEqual([]);
});

import { test, expect } from "@playwright/test";

// Run only against the explicitly selected local server with payment config absent.
test.skip(!process.env.SERVICE_PAYMENTS_LOCAL_SMOKE, "Local payment-boundary smoke only");
test("payment redirect grants nothing and operator page requires authentication", async ({ page }) => {
  await page.goto("/service-payment/return?session_id=cs_test_forged&paid=true");
  await expect(page.getByRole("heading", { name: "Virelantic test payment" })).toBeVisible();
  await expect(page.locator("main")).toContainText("Returning here does not confirm payment");
  await page.goto("/service-orders"); await expect(page).toHaveURL(/\/login/);
  const disabled = await page.request.post("/api/service-payments/stripe", { data: { livemode: false } });
  expect(disabled.status()).toBe(503);
});

import { expect, test } from "@playwright/test";

// Run only against a provisioned, Go-served deployment. Never pass a token to
// this suite: the real deployment embeds it using the verified widget contract.
// Disable artifacts because DOM snapshots/traces can contain that public token.
test.use({ trace: "off", video: "off", screenshot: "off" });
test.skip(
  process.env.E2E_LARINE_VALIDATE !== "1",
  "Requires a provisioned Larine deployment; see LARINE_FEEDBACK_INTEGRATION.md"
);

const widgetURL = "https://next.larine.dev/larine-feedback.js";
const expectedWorkItem = process.env.E2E_LARINE_WORK_ITEM_ID || undefined;
const expectedStatement = process.env.E2E_LARINE_STATEMENT_ID || undefined;

test("live widget rendering, loading and independent context", async ({ page }) => {
  let widgetStatus: number | undefined;
  page.on("response", response => {
    if (response.url() === widgetURL) widgetStatus = response.status();
  });
  await page.goto("/");
  const script = page.locator(`script[src='${widgetURL}']`);
  await expect(script).toHaveCount(1);
  await expect(script).toHaveAttribute("crossorigin", "anonymous");
  await expect(script).toHaveAttribute("data-api-url", "https://api-stage.larine.dev");
  await expect(script).toHaveAttribute("data-enabled", "always");
  await expect(script).toHaveAttribute("data-shortcut", "mod+shift+f");
  await expect(script).toHaveAttribute("data-source", "HomeBox - Test 1");
  expect(await script.getAttribute("data-domain")).toBeNull();
  expect(await script.getAttribute("data-domains")).toBeNull();
  await expect.poll(() => widgetStatus).toBeDefined();
  expect(widgetStatus).toBeGreaterThanOrEqual(200);
  expect(widgetStatus).toBeLessThan(300);

  // Read only association globals, never the script's token attributes.
  const context = await page.evaluate(() => {
    const globals = window as unknown as Record<string, unknown>;
    const scripts = Array.from(document.querySelectorAll("script"));
    const widgetIndex = scripts.findIndex(script => script.src === "https://next.larine.dev/larine-feedback.js");
    const assignmentIndex = scripts.findIndex(script => script.textContent?.includes("window.__LARINE_"));
    return {
      workItem: globals.__LARINE_ACTIVE_WORK_ITEM_ID__,
      statement: globals.__LARINE_STATEMENT_ID__,
      enhancement: globals.__LARINE_ENHANCEMENT_ID__,
      bootstrapBeforeWidget: assignmentIndex >= 0 && assignmentIndex < widgetIndex,
      placeholder: scripts.some(script => /%VITE_|import\.meta\.env|%LARINE_/.test(script.textContent || "")),
    };
  });
  expect(context.workItem).toBe(expectedWorkItem);
  expect(context.statement).toBe(expectedStatement);
  expect(context.enhancement).toBeUndefined();
  expect(context.placeholder).toBe(false);
  if (expectedWorkItem || expectedStatement) expect(context.bootstrapBeforeWidget).toBe(true);
});

for (const modifier of ["Control", "Meta"]) {
  test(`${modifier}+Shift+F opens the widget`, async ({ page }) => {
    // Obtain the real widget dialog selector from the published UI, not a stub.
    const selector = process.env.E2E_LARINE_DIALOG_SELECTOR;
    test.skip(!selector, "Set E2E_LARINE_DIALOG_SELECTOR after inspecting the live widget UI");
    await page.goto("/");
    await expect(page.locator(`script[src='${widgetURL}']`)).toHaveCount(1);
    await page.waitForFunction(() =>
      performance
        .getEntriesByType("resource")
        .some(entry => entry.name === "https://next.larine.dev/larine-feedback.js")
    );
    const dialog = page.locator(selector!);
    await expect(dialog).toBeHidden();
    await page.keyboard.press(`${modifier}+Shift+F`);
    await expect(dialog).toBeVisible();
  });
}

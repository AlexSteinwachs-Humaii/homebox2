import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { themes } from "../../lib/data/themes";

async function expectTheme(page: Page, value: string) {
  await expect(page.locator("html")).toHaveAttribute("data-theme", value);
  await expect
    .poll(() =>
      page.locator("html").evaluate(element => [...element.classList].filter(name => name.startsWith("theme-")))
    )
    .toEqual([`theme-${value}`]);
}

async function selectTheme(page: Page, value: string) {
  const saved = page.waitForResponse(
    response =>
      response.url().endsWith("/users/self/settings") &&
      response.request().method() === "PUT" &&
      response.ok() &&
      response.request().postDataJSON().theme === value
  );
  await page.locator(`[data-set-theme='${value}']`).click();
  await expectTheme(page, value);
  await saved;
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("homebox/preferences/location") || "{}").theme))
    .toBe(value);
}

test("Claude picker preview, persistence, account sync and switching to all existing themes", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/home");
  await expect(page).toHaveURL("/");
  await page.fill("input[type='text']", "demo@example.com");
  await page.fill("input[type='password']", "demodemo");
  await page.click("button[type='submit']");
  await expect(page).toHaveURL("/home");
  await page.goto("/profile");
  const preview = page.locator("[data-set-theme='claude']");
  await expect(preview).toHaveCount(1);
  await expect(preview).toContainText("Claude");
  await expect(preview).toHaveClass(/theme-claude/);
  await expect(preview.locator(".bg-primary")).toHaveCSS("background-color", "rgb(142, 79, 57)");

  // Ensure a real change regardless of the account's previously saved theme.
  const initialTheme = await page.locator("html").getAttribute("data-theme");
  await selectTheme(page, initialTheme === "light" ? "homebox" : "light");
  await selectTheme(page, "claude");
  await page.locator("a[href='/home']").first().click();
  await expect(page).toHaveURL("/home");
  await expectTheme(page, "claude");
  await page.reload();
  await expectTheme(page, "claude");

  // Removing only the local preference proves the account snapshot also restores Claude.
  await page.evaluate(() => localStorage.removeItem("homebox/preferences/location"));
  await page.reload();
  await expectTheme(page, "claude");
  await page.goto("/profile");
  for (const option of themes.filter(option => option.value !== "claude")) {
    await selectTheme(page, option.value);
    const actualBackground = await page
      .locator("html")
      .evaluate(element => getComputedStyle(element).getPropertyValue("--background").trim());
    const previewBackground = await page
      .locator(`[data-set-theme='${option.value}']`)
      .evaluate(element => getComputedStyle(element).getPropertyValue("--background").trim());
    expect(actualBackground).toBe(previewBackground);
    await selectTheme(page, "claude");
  }
  await selectTheme(page, "homebox");
});

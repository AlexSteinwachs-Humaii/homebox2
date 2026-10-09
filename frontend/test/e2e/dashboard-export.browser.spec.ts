import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

// Isolated API fixtures exercise the actual dashboard and browser download without
// depending on demo inventory or modifying a user's collection.
const csv = "metric,breakdown,breakdown_id,breakdown_label,value,unit,date\ntotalItems,,,,0,items,\n";

test.beforeEach(async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "hb.auth.session", value: "true", url: baseURL! }]);
  await page.addInitScript(() => {
    if (!localStorage.getItem("homebox/preferences/location")) {
      localStorage.setItem(
        "homebox/preferences/location",
        JSON.stringify({ language: "en", collectionId: "collection-a" })
      );
    }
  });
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path === "/api/v1/users/self") {
      data = { item: { id: "user", name: "CSV User", defaultGroupId: "collection-a", group: { currency: "USD" } } };
    } else if (path === "/api/v1/users/self/settings") {
      data = { item: {} };
    } else if (path === "/api/v1/groups/all") {
      data = [
        { id: "collection-a", name: "Collection A" },
        { id: "collection-b", name: "Collection B" },
      ];
    } else if (path === "/api/v1/groups/statistics") {
      data = { totalItems: 0, totalItemPrice: 0, totalLocations: 0, totalTags: 0 };
    } else if (path === "/api/v1/entities") {
      data = { items: [], totalPrice: 0 };
    } else if (path === "/api/v1/status") {
      data = { build: { version: "v0.0.0", commit: "test" }, options: {}, otel: { enabled: false } };
    }
    await route.fulfill({ json: data });
  });
});

test("keyboard download is direct, scoped, busy, and leaves the dashboard unchanged", async ({ page }) => {
  let release!: () => void;
  const wait = new Promise<void>(resolve => (release = resolve));
  let requests = 0;
  await page.route("**/api/v1/groups/statistics/export?**", async route => {
    requests++;
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers()["x-tenant"]).toBe("collection-a");
    await wait;
    await route.fulfill({ contentType: "text/csv; charset=utf-8", body: csv });
  });
  await page.goto("/home");
  await expect(page.getByRole("combobox", { name: "Select Collection" })).toContainText("Collection A");
  const button = page.getByRole("button", { name: "Export CSV", exact: true });
  await button.focus();
  await page.keyboard.press("Enter");
  const busy = page.getByRole("button", { name: "Exporting CSV…", exact: true });
  await expect(busy).toBeDisabled();
  await expect(busy).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("status").filter({ hasText: "Exporting CSV…" })).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  release();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("homebox-dashboard-summary.csv");
  expect(await readFile((await download.path())!, "utf8")).toBe(csv);
  await expect(button).toBeEnabled();
  await expect(page).toHaveURL(/\/home\/?$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(requests).toBe(1);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("homebox/preferences/location")!).collectionId)
  ).toBe("collection-a");
});

test("error is announced without downloading, and retry succeeds", async ({ page }) => {
  let attempts = 0;
  const downloads: string[] = [];
  page.on("download", download => downloads.push(download.suggestedFilename()));
  await page.route("**/api/v1/groups/statistics/export?**", async route => {
    attempts++;
    if (attempts === 1) {
      await route.fulfill({ status: 500, json: { error: "internal details must not become CSV" } });
    } else {
      await route.fulfill({ contentType: "text/csv", body: csv });
    }
  });
  await page.goto("/home");
  await expect(page.getByRole("combobox", { name: "Select Collection" })).toContainText("Collection A");
  const button = page.getByRole("button", { name: "Export CSV", exact: true });
  await button.click();
  await expect(page.getByRole("alert")).toHaveText("Could not export dashboard summaries. Please try again.");
  await expect(button).toBeEnabled();
  expect(downloads).toEqual([]);
  await expect(page).toHaveURL(/\/home\/?$/);
  const downloadEvent = page.waitForEvent("download");
  await button.click();
  await downloadEvent;
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(button).toBeEnabled();
  expect(attempts).toBe(2);
});

test("uses the newly selected collection on the next export", async ({ page }) => {
  const tenants: Array<string | undefined> = [];
  await page.route("**/api/v1/groups/statistics/export?**", async route => {
    tenants.push(route.request().headers()["x-tenant"]);
    await route.fulfill({ contentType: "text/csv", body: csv });
  });
  await page.goto("/home");
  const selector = page.getByRole("combobox", { name: "Select Collection" });
  await expect(selector).toContainText("Collection A");
  let downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  await downloadEvent;
  await selector.click();
  await page.getByRole("option", { name: "Collection B" }).click();
  await expect(selector).toContainText("Collection B");
  downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  await downloadEvent;
  expect(tenants).toEqual(["collection-a", "collection-b"]);
  await expect(selector).toContainText("Collection B");
});

test("export labels and failure message follow the selected language", async ({ page }) => {
  await page.route("**/api/v1/groups/statistics/export?**", route =>
    route.fulfill({ status: 500, json: { error: "failed" } })
  );
  await page.goto("/home");
  await expect(page.getByRole("combobox", { name: "Select Collection" })).toContainText("Collection A");
  await page.evaluate(() => {
    const preferences = JSON.parse(localStorage.getItem("homebox/preferences/location")!);
    preferences.language = "de";
    localStorage.setItem("homebox/preferences/location", JSON.stringify(preferences));
  });
  await page.reload();
  await page.getByRole("button", { name: "CSV exportieren", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Die Dashboard-Zusammenfassungen konnten nicht exportiert werden. Bitte versuche es erneut."
  );
});

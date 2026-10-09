import { randomUUID } from "node:crypto";
import { format } from "date-fns";
import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import type { EntityOut, EntityTypeSummary, Group } from "../../lib/api/types/data-contracts";

async function json<T>(
  request: APIRequestContext,
  method: string,
  path: string,
  data?: unknown,
  tenant?: string
): Promise<T> {
  const response = await request.fetch(`/api/v1${path}`, {
    method,
    data,
    headers: tenant ? { "X-Tenant": tenant } : undefined,
  });
  const text = await response.text();
  expect(response.ok(), `${method} ${path}: ${text}`).toBeTruthy();
  return JSON.parse(text || "null");
}

test("item identity, real details and purchase data survive Home/search entry and existing controls", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const email = `details-${randomUUID()}@example.com`;
  const password = "InventoryDetailsTest123!";
  await json(page.request, "POST", "/users/register", {
    email,
    name: "Details Member",
    password,
    token: "",
  });
  await json(page.request, "POST", "/users/login", {
    username: email,
    password,
    stayLoggedIn: true,
  });
  const [group] = await json<Group[]>(page.request, "GET", "/groups/all");
  await json(page.request, "PUT", "/groups", { name: "Workshop", currency: "USD" }, group!.id);
  const types = await json<EntityTypeSummary[]>(page.request, "GET", "/entity-types", undefined, group!.id);
  const create = (name: string, location = false, parentId?: string) =>
    json<EntityOut>(
      page.request,
      "POST",
      "/entities",
      {
        name,
        description: "",
        quantity: 1,
        tagIds: [],
        parentId,
        entityTypeId: types.find(type => type.isLocation === location)!.id,
      },
      group!.id
    );
  const garage = await create("Details Garage", true);
  const tag = await json<{ id: string }>(
    page.request,
    "POST",
    "/tags",
    {
      name: "Workshop tools",
      description: "",
      color: "",
      icon: "",
    },
    group!.id
  );
  const records: EntityOut[] = [];
  for (const values of [
    {
      name: "Cordless drill",
      quantity: 3,
      serialNumber: "DR-321",
      modelNumber: "DCD999",
      manufacturer: "DeWalt",
      insured: true,
      purchasePrice: 123.45,
      purchaseFrom: "Drill supplier",
    },
    {
      name: "Inspection camera",
      quantity: 7,
      serialNumber: "CAM-987",
      modelNumber: "CAM42",
      manufacturer: "Camera maker",
      insured: false,
      purchasePrice: 246.8,
      purchaseFrom: "Camera supplier",
    },
  ]) {
    const item = await create(values.name, false, garage.id);
    await json(
      page.request,
      "PUT",
      `/entities/${item.id}`,
      {
        ...item,
        ...values,
        entityTypeId: item.entityType!.id,
        parentId: garage.id,
        tagIds: [tag.id],
        description: `Actual description for ${values.name}`,
        purchaseDate: "2025-02-03",
        archived: false,
      },
      group!.id
    );
    records.push(await json<EntityOut>(page.request, "GET", `/entities/${item.id}`, undefined, group!.id));
  }
  const sparse = await create("Sparse item " + "long name ".repeat(20));
  await page.addInitScript(collectionId => {
    localStorage.setItem(
      "homebox/preferences/location",
      JSON.stringify({
        collectionId,
        language: "en",
        overrideFormatLocale: "en-US",
        showEmpty: false,
        itemDisplayView: "table",
      })
    );
  }, group!.id);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/home");
  await page.getByRole("link", { name: "Cordless drill", exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/item/${records[0]!.id}$`));
  const main = page.locator("main");
  const section = (title: string) =>
    main
      .locator("div.rounded-lg")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
      .last();
  for (const [index, record] of records.entries()) {
    if (index) {
      await page.goto("/items?q=Inspection%20camera");
      await page.getByRole("link", { name: record.name, exact: true }).first().click();
    }
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(record.name);
    for (const text of [garage.name, "Workshop tools", "Created", "Updated"]) {
      await expect(main.locator("header")).toContainText(text);
    }
    await expect(main.locator("header")).toContainText(format(new Date(record.createdAt), "MM/dd/yyyy"));
    await expect(main.locator("header")).toContainText(format(new Date(record.updatedAt), "MM/dd/yyyy"));
    await expect(main).toContainText(`Actual description for ${record.name}`);
    const tabs = main.locator("a").filter({ hasText: /^(Details|Edit|Maintenance)$/ });
    await expect(tabs).toHaveText(["Details", "Edit", "Maintenance"]);
    const details = section("Details");
    const value = (label: string) =>
      details
        .locator("dl > div")
        .filter({ has: page.locator("dt", { hasText: label }) })
        .locator("dd");
    await expect(value("Quantity")).toHaveText(String(record.quantity));
    await expect(value("Serial Number")).toContainText(record.serialNumber);
    await expect(value("Model Number")).toContainText(record.modelNumber);
    await expect(value("Manufacturer")).toContainText(record.manufacturer);
    await expect(value("Insured")).toHaveText(record.insured ? "Yes" : "No");
    await expect(value("Archived")).toHaveText("No");
    for (const text of [index ? "$246.80" : "$123.45", "02/03/2025", record.purchaseFrom]) {
      await expect(section("Purchase Details")).toContainText(text);
    }
    await details.getByRole("button", { name: "Details", exact: true }).click();
    await expect(details.locator(".max-h-0")).toHaveCSS("max-height", "0px");
    await details.getByRole("button", { name: "Details", exact: true }).click();
    await expect(details.locator(".max-h-0")).toHaveCount(0);
    await expect(details.locator("dl")).toBeVisible();
  }
  await main.getByRole("button", { name: "Quantity +1", exact: true }).click();
  await expect(section("Details").locator("dd").first()).toHaveText("8");
  await main.getByRole("button", { name: "Quantity -1", exact: true }).click();
  await expect(main.getByRole("button", { name: "Create Subitem", exact: true })).toBeEnabled();
  await expect(main.locator("button").filter({ has: page.locator("svg[name='mdi-printer-pos']") })).toBeEnabled();
  await main.locator("header button[aria-haspopup=menu]").click();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await page.keyboard.press("Escape");
  await main.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(main.locator("input").first()).toBeVisible();
  await main.getByRole("link", { name: "Maintenance", exact: true }).click();
  await expect(page).toHaveURL(/\/maintenance$/);
  await main.getByRole("link", { name: "Details", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/item/${records[1]!.id}$`));
  await expect(main.getByRole("link", { name: "Details", exact: true })).toHaveClass(/bg-primary/);
  await page.screenshot({
    path: testInfo.outputPath("details-desktop.png"),
    fullPage: true,
  });
  await page.goto(`/item/${sparse.id}`);
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(sparse.name, { timeout: 20_000 });
  await expect(main.locator("dt", { hasText: "Serial Number" })).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "Purchase Details" })).toHaveCount(0);
  await main.getByRole("switch").click();
  await expect(main.locator("dt", { hasText: "Serial Number" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Purchase Details" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Attachments", exact: true })).toBeVisible();
  await main.getByRole("switch").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("details-mobile.png"),
    fullPage: true,
  });
});

import { randomUUID } from "node:crypto";
import { format } from "date-fns";
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
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
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBeTruthy();
  const text = await response.text();
  // Successful registration/update endpoints may return no content.
  return JSON.parse(text || "null");
}

async function setup(page: Page, saved = false) {
  const email = `search-${randomUUID()}@example.com`;
  const password = "InventorySearchTest123!";
  await json(page.request, "POST", "/users/register", {
    email,
    name: "Search Member",
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
  const create = (name: string, location: boolean, parentId?: string, tagIds: string[] = []) =>
    json<EntityOut>(
      page.request,
      "POST",
      "/entities",
      {
        name,
        description: "",
        quantity: 1,
        tagIds,
        parentId,
        entityTypeId: types.find(type => type.isLocation === location)!.id,
      },
      group!.id
    );
  const garage = await create("Search Garage", true);
  const tag = await json<{ id: string }>(
    page.request,
    "POST",
    "/tags",
    {
      name: "Power tools",
      description: "",
      color: "",
      icon: "",
    },
    group!.id
  );
  const drill = await create("Cordless drill", false, garage.id, [tag.id]);
  await json(
    page.request,
    "PUT",
    `/entities/${drill.id}`,
    {
      ...drill,
      entityTypeId: drill.entityType!.id,
      parentId: garage.id,
      tagIds: [tag.id],
      quantity: 3,
      insured: true,
      purchasePrice: 89,
    },
    group!.id
  );
  const updated = await json<EntityOut>(page.request, "GET", `/entities/${drill.id}`, undefined, group!.id);
  for (let i = 0; i < 12; i++) await create(`Spare drill ${String(i).padStart(2, "0")}`, false);
  const saw = await create("Hand saw", false);
  const archived = await create("Archived drill", false);
  await json(
    page.request,
    "PUT",
    `/entities/${archived.id}`,
    {
      ...archived,
      entityTypeId: archived.entityType!.id,
      tagIds: [],
      archived: true,
    },
    group!.id
  );
  const other = await json<Group>(page.request, "POST", "/groups", {
    name: "Other collection",
  });
  const otherTypes = await json<EntityTypeSummary[]>(page.request, "GET", "/entity-types", undefined, other.id);
  await json(
    page.request,
    "POST",
    "/entities",
    {
      name: "Foreign drill",
      description: "",
      quantity: 9,
      tagIds: [],
      entityTypeId: otherTypes.find(type => !type.isLocation)!.id,
    },
    other.id
  );
  await page.context().addCookies([
    {
      name: "sidebar:state",
      value: "false",
      url: new URL(test.info().project.use.baseURL ?? "http://localhost:3000").origin,
    },
  ]);
  await page.addInitScript(
    ({ collectionId, saved }) => {
      if (!localStorage.getItem("homebox/preferences/location")) {
        localStorage.setItem(
          "homebox/preferences/location",
          JSON.stringify({
            collectionId,
            language: "en",
            overrideFormatLocale: "en-US",
            itemDisplayView: "table",
            ...(saved
              ? {
                  tableHeaders: [
                    { value: "insured", enabled: true },
                    { value: "name", enabled: true },
                    { value: "quantity", enabled: false },
                    ...["assetId", "purchasePrice", "location", "archived", "createdAt", "updatedAt"].map(value => ({
                      value,
                      enabled: false,
                    })),
                  ],
                }
              : {}),
          })
        );
      }
    },
    { collectionId: group!.id, saved }
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/items?q=drill");
  await expect(page.locator("tbody")).toContainText("Cordless drill");
  await expect(page.locator("main button .animate-spin")).toHaveCount(0);
  return { drill: updated, saw, group: group!, other, garage, tag };
}

const rows = (page: Page) => page.locator("tbody tr");
const queryInput = (page: Page) => page.getByRole("textbox", { name: "Search", exact: true });
async function query(page: Page, text: string) {
  await queryInput(page).fill(text);
  await page.locator("main").getByRole("button", { name: "Search", exact: true }).last().click();
}
async function filter(page: Page, name: string, option: string) {
  await page
    .locator("main")
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
  await page
    .locator("[data-slot='popover-content'], [data-reka-popper-content-wrapper]")
    .locator("label")
    .filter({ hasText: option })
    .getByRole("checkbox")
    .click();
  await page.keyboard.press("Escape");
}

test("real search hierarchy, collection isolation and existing filters/options", async ({ page }, testInfo) => {
  const { drill, other } = await setup(page);
  await expect(page.locator("[data-state='collapsed'][data-variant='sidebar']")).toBeVisible();
  await expect(queryInput(page)).toHaveValue("drill");
  await expect(page.locator("thead th")).toHaveText([
    "",
    "Asset ID",
    "Name",
    "Quantity",
    "Insured",
    "Purchase Price",
    "Location",
    "Created At",
    "Open menu",
  ]);
  const result = rows(page).filter({ hasText: "Cordless drill" });
  await expect(result).toContainText(drill.assetId);
  await expect(result.locator("td").nth(3)).toHaveText("3");
  await expect(result.locator("td").nth(4).locator("svg")).toBeVisible();
  await expect(result).toContainText("$89.00");
  await expect(result).toContainText("Search Garage");
  await expect(result).toContainText(format(new Date(drill.createdAt), "MM/dd/yyyy"));
  await expect(page.locator("main")).not.toContainText("Foreign drill");
  await page.screenshot({
    path: testInfo.outputPath("search-desktop.png"),
    fullPage: true,
  });
  await filter(page, "Locations", "Search Garage");
  await expect(rows(page)).toHaveCount(1);
  await filter(page, "Locations", "Search Garage");
  await expect(rows(page)).toHaveCount(12);
  await filter(page, "Tags", "Power tools");
  await expect(rows(page)).toHaveCount(1);
  await filter(page, "Tags", "Power tools");
  await expect(rows(page)).toHaveCount(12);
  await page.getByRole("button", { name: "Options", exact: true }).click();
  await page.getByText("Include Archived Items", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(rows(page)).toContainText(["Archived drill"]);
  await page.getByRole("button", { name: "Options", exact: true }).click();
  await page.getByRole("dialog").getByRole("combobox").click();
  await page.getByRole("option", { name: "Created At", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/orderBy=createdAt/);
  await expect(rows(page).first()).toContainText("Archived drill");
  await query(page, "Hand saw");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText(["Hand saw"]);
  await query(page, "no-match-" + randomUUID());
  await expect(page.locator("main")).toContainText("No Items Found");
  await expect(page.locator("tbody")).not.toContainText("Cordless drill");
  await page.getByRole("combobox", { name: "Select Collection" }).click();
  await page.getByRole("option", { name: other.name, exact: true }).click();
  await query(page, "drill");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText(["Foreign drill"]);
  await expect(page.locator("tbody")).not.toContainText("Cordless drill");
});

test("selection, pagination, column edits and view preferences remain usable", async ({ page }) => {
  await setup(page);
  await page.locator("tbody").getByRole("checkbox").first().click();
  await expect(page.locator("main")).toContainText("1 of 12 rows selected");
  await page.locator("tbody").getByRole("checkbox").first().click();
  await expect(page.locator("main")).toContainText("0 of 12 rows selected");
  await page.locator("main").getByRole("button", { name: "Page 2", exact: true }).first().click();
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Table Settings", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("label[for=quantity]").click();
  await dialog.locator("label[for=name]").locator("..").getByRole("button").first().click();
  await page.keyboard.press("Escape");
  await expect(page.locator("thead th")).toHaveText([
    "",
    "Name",
    "Asset ID",
    "Insured",
    "Purchase Price",
    "Location",
    "Created At",
    "Open menu",
  ]);
  await page.reload();
  await expect(page.locator("thead th")).toHaveText([
    "",
    "Name",
    "Asset ID",
    "Insured",
    "Purchase Price",
    "Location",
    "Created At",
    "Open menu",
  ]);
  await page.getByRole("button", { name: "Card", exact: true }).click();
  await expect(page.locator("main table")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("main table")).toHaveCount(0);
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page.locator("main table")).toBeVisible();
});

test("saved columns take precedence and loading/errors are retained", async ({ page }) => {
  await setup(page, true);
  await expect(page.locator("thead th")).toHaveText(["", "Insured", "Name", "Open menu"]);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route("**/api/v1/entities?**", async route => {
    if (new URL(route.request().url()).searchParams.get("q") === "error-test") {
      await gate;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "test failure" }),
      });
    } else await route.continue();
  });
  await queryInput(page).fill("error-test");
  await expect(page.locator("main button .animate-spin")).toBeVisible();
  release();
  await expect(page.locator("[data-sonner-toast]")).toContainText("Failed to search items");
  await expect(page.locator("tbody")).not.toContainText("Cordless drill");
});

async function headerQuery(page: Page, text: string, submit: "enter" | "button") {
  const input = page.getByRole("searchbox");
  await input.fill(text);
  if (submit === "enter") await input.press("Enter");
  else await page.getByRole("button", { name: "Search", exact: true }).first().click();
  await expect(page).toHaveURL(url => url.pathname === "/items" && url.searchParams.get("q") === text);
  await expect(queryInput(page)).toHaveValue(text);
  await expect(input).toHaveValue("");
}

test("header queries on search and result names navigate to actual matching IDs", async ({ page }) => {
  const { drill, saw } = await setup(page);
  // Stay on the mounted search page: both header submit paths must refresh its query and results.
  await headerQuery(page, saw.name, "enter");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).not.toContainText([drill.name]);
  const sawLink = rows(page).getByRole("link", { name: saw.name, exact: true });
  await expect(sawLink).toHaveAttribute("href", `/item/${saw.id}`);
  await sawLink.focus();
  await sawLink.press("Enter");
  await expect(page).toHaveURL(url => url.pathname === `/item/${saw.id}`);
  await expect(page.locator("main")).toContainText(saw.name);
  await page.goBack();
  await expect(queryInput(page)).toHaveValue(saw.name);

  await headerQuery(page, drill.name, "button");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).not.toContainText([saw.name]);
  const drillLink = rows(page).getByRole("link", {
    name: drill.name,
    exact: true,
  });
  await expect(drillLink).toHaveAttribute("href", `/item/${drill.id}`);
  await drillLink.click();
  await expect(page).toHaveURL(url => url.pathname === `/item/${drill.id}`);
  await expect(page.locator("main")).toContainText(drill.name);
});

for (const state of ["collapsed", "expanded"] as const) {
  test(`Home and HomeBox return from search with ${state} sidebar`, async ({ page }) => {
    await setup(page);
    if (state === "expanded") await page.locator("[data-sidebar=trigger]").click();
    const sidebar = page.locator(`[data-state='${state}'][data-variant='sidebar']`);
    await expect(sidebar).toBeVisible();
    for (const control of ["Home", "HomeBox"] as const) {
      const link =
        control === "Home"
          ? page.locator("[data-sidebar=menu]").getByRole("link", { name: "Home", exact: true })
          : page.getByRole("link", { name: "HomeBox", exact: true });
      await expect(link).toHaveAttribute("href", "/home");
      // Leave a debounce pending as the user returns to Home.
      await queryInput(page).fill("pending navigation query");
      await link.click();
      await expect(page).toHaveURL(url => url.pathname === "/home" && !url.search);
      await expect(page.locator("main")).toContainText("Recently Added");
      await expect(sidebar).toBeVisible();
      await page.locator("[data-sidebar=menu]").getByRole("link", { name: "Search", exact: true }).click();
      await expect(page).toHaveURL(url => url.pathname === "/items");
      await expect(sidebar).toBeVisible();
      await query(page, "drill");
      await expect(rows(page)).toContainText(["Cordless drill"]);
    }
  });
}

test("selection, action menu and location link do not open item details", async ({ page }) => {
  const { drill, garage } = await setup(page);
  const row = rows(page).filter({ hasText: drill.name });
  await row.getByRole("checkbox").click();
  await expect(row).toHaveAttribute("data-state", "selected");
  await expect(page).toHaveURL(url => url.pathname === "/items");
  await row.getByRole("checkbox").click();
  await expect(row).not.toHaveAttribute("data-state", "selected");

  await row.getByRole("button", { name: "Open menu", exact: true }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "View item", exact: true })).toHaveAttribute(
    "href",
    `/item/${drill.id}`
  );
  await expect(page).toHaveURL(url => url.pathname === "/items");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  const location = row.getByRole("link", { name: garage.name, exact: true });
  await expect(location).toHaveAttribute("href", `/location/${garage.id}`);
  await location.click();
  await expect(page).toHaveURL(url => url.pathname === `/location/${garage.id}`);
  await expect(page.locator("main")).toContainText(garage.name);
});

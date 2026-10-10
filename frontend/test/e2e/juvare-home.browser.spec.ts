import { format } from "date-fns";
import { randomUUID } from "node:crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type {
  EntityOut,
  EntitySummary,
  EntityTypeSummary,
  Group,
  GroupStatistics,
} from "../../lib/api/types/data-contracts";

// Provide a virtual camera for the scanner smoke test without requiring host hardware.
test.use({
  launchOptions: async ({ browserName }, use) => {
    await use(
      browserName === "chromium"
        ? { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] }
        : {}
    );
  },
});

const savedHeaders = [
  { value: "insured", enabled: true },
  { value: "name", enabled: true },
  { value: "quantity", enabled: false },
];

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
  return response.json();
}

async function setup(page: Page) {
  const email = `home-${randomUUID()}@example.com`;
  const password = "HomeDashboardTest123!";
  const registration = await page.request.post("/api/v1/users/register", {
    data: { email, name: "Dashboard Member", password, token: "" },
  });
  expect(registration.ok(), await registration.text()).toBeTruthy();
  await json(page.request, "POST", "/users/login", {
    username: email,
    password,
    stayLoggedIn: true,
  });
  const groups = await json<Group[]>(page.request, "GET", "/groups/all");
  const first = groups[0]!;
  await json(page.request, "PUT", "/groups", { name: "Workshop collection", currency: "USD" }, first.id);
  first.name = "Workshop collection";
  const second = await json<Group>(page.request, "POST", "/groups", {
    name: "Kitchen collection",
  });
  const empty = await json<Group>(page.request, "POST", "/groups", {
    name: "Empty collection",
  });

  const populate = async (group: Group, prefix: string, quantity: number, price: number) => {
    await json(page.request, "PUT", "/groups", { name: group.name, currency: "USD" }, group.id);
    const types = await json<EntityTypeSummary[]>(page.request, "GET", "/entity-types", undefined, group.id);
    const location = await json<EntityOut>(
      page.request,
      "POST",
      "/entities",
      {
        name: `${prefix} room`,
        description: "",
        quantity: 1,
        tagIds: [],
        entityTypeId: types.find(type => type.isLocation)!.id,
      },
      group.id
    );
    const tag = await json<{ id: string }>(
      page.request,
      "POST",
      "/tags",
      {
        name: `${prefix} tag`,
        description: "",
        color: "",
        icon: "",
      },
      group.id
    );
    const item = await json<EntityOut>(
      page.request,
      "POST",
      "/entities",
      {
        name: `${prefix} inventory`,
        description: "",
        quantity,
        tagIds: [tag.id],
        parentId: location.id,
        entityTypeId: types.find(type => !type.isLocation)!.id,
      },
      group.id
    );
    await json(
      page.request,
      "PUT",
      `/entities/${item.id}`,
      {
        ...item,
        entityTypeId: item.entityType!.id,
        parentId: location.id,
        tagIds: [tag.id],
        purchasePrice: price,
      },
      group.id
    );
    const recent = await json<{ items: EntitySummary[] }>(
      page.request,
      "GET",
      "/entities?page=1&pageSize=5&orderBy=createdAt",
      undefined,
      group.id
    );
    const stats = await json<GroupStatistics>(page.request, "GET", "/groups/statistics", undefined, group.id);
    return {
      item: recent.items.find(record => record.id === item.id)!,
      stats,
      location,
    };
  };
  const workshop = await populate(first, "Workshop", 3, 37.5);
  const kitchen = await populate(second, "Kitchen", 7, 91.25);
  await page.addInitScript(
    ({ collectionId, tableHeaders }) => {
      if (!localStorage.getItem("homebox/preferences/location")) {
        localStorage.setItem(
          "homebox/preferences/location",
          JSON.stringify({
            collectionId,
            tableHeaders,
            language: "en",
            overrideFormatLocale: "en-US",
          })
        );
      }
    },
    { collectionId: first.id, tableHeaders: savedHeaders }
  );
  await page.goto("/home");
  return { first, second, empty, workshop, kitchen };
}

const sections = (page: Page) => page.locator("main section");

async function checkCollection(page: Page, prefix: string, fixture: Awaited<ReturnType<typeof setup>>["workshop"]) {
  const dashboard = sections(page);
  await expect(dashboard).toHaveCount(4);
  await expect(dashboard.nth(0)).toContainText(
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(fixture.stats.totalItemPrice)
  );
  for (const [label, total] of [
    ["Total Items", fixture.stats.totalItems],
    ["Total Locations", fixture.stats.totalLocations],
    ["Total Tags", fixture.stats.totalTags],
  ] as const) {
    await expect(dashboard.nth(0).getByText(label, { exact: true }).locator("..").locator("..")).toContainText(
      String(total)
    );
  }
  const row = dashboard
    .nth(1)
    .locator("tbody tr")
    .filter({ hasText: `${prefix} inventory` });
  await expect(row).toHaveCount(1);
  await expect(row.locator("td")).toHaveText([
    fixture.item.assetId,
    fixture.item.name,
    String(fixture.item.quantity),
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(fixture.item.purchasePrice),
    `${prefix} room`,
    new RegExp(`\\(${format(new Date(fixture.item.createdAt), "MM/dd/yyyy")}\\)`),
  ]);
  await expect(dashboard.nth(2)).toContainText(`${prefix} room`);
  await expect(dashboard.nth(2).locator(`a[href='/location/${fixture.location.id}']`)).toContainText(
    String(fixture.item.quantity)
  );
  await expect(dashboard.nth(3)).toContainText(`${prefix} tag`);
}

async function switchCollection(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Select Collection" }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Select Collection" })).toContainText(name);
}

test("Home hierarchy, independent columns and collection-scoped data survive switching", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fixtures = await setup(page);
  await expect(page.locator("[data-state='expanded'][data-variant='sidebar']")).toBeVisible();
  const dashboard = sections(page);
  for (const [index, title] of ["Quick Statistics", "Recently Added", "Storage Locations", "Tags"].entries()) {
    await expect(dashboard.nth(index)).toContainText(title);
  }
  await expect(dashboard.nth(1).locator("thead th")).toHaveText([
    "Asset ID",
    "Name",
    "Quantity",
    "Purchase Price",
    "Location",
    "Created At",
  ]);
  await checkCollection(page, "Workshop", fixtures.workshop);
  await page.screenshot({ path: testInfo.outputPath("home-desktop.png"), fullPage: true });
  await switchCollection(page, fixtures.second.name);
  await checkCollection(page, "Kitchen", fixtures.kitchen);
  await expect(page.locator("main")).not.toContainText("Workshop inventory");
  await expect(page.locator("main")).not.toContainText("Workshop room");
  await expect(page.locator("main")).not.toContainText("Workshop tag");
  await switchCollection(page, fixtures.first.name);
  await checkCollection(page, "Workshop", fixtures.workshop);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("homebox/preferences/location")!).tableHeaders)
  ).toEqual(savedHeaders);
  await switchCollection(page, fixtures.empty.name);
  await expect(dashboard.nth(1)).toContainText("No Items Found");
  await expect(dashboard.nth(2)).toContainText("No Locations Found");
  await expect(dashboard.nth(3)).toContainText("No Tags Found");
  await expect(dashboard.locator("table")).toHaveCount(0);
});

test("Home keeps mobile cards, sidebar state and legacy header preference", async ({ page }, testInfo) => {
  const { workshop } = await setup(page);
  await page.locator("[data-sidebar=trigger]").click();
  await page.reload();
  await expect(page.locator("[data-state='collapsed'][data-variant='sidebar']")).toBeVisible();
  await page.evaluate(() => {
    const key = "homebox/preferences/location";
    const prefs = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...prefs, displayLegacyHeader: true }));
  });
  await page.reload();
  await expect(page.locator("input[type=search]")).toBeHidden();
  await expect(page.locator("[data-sidebar=trigger]").first()).toBeVisible();
  await expect(sections(page).nth(1).locator("table")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sections(page).nth(1).locator("table")).toHaveCount(0);
  await expect(
    sections(page).nth(1).getByRole("link", { name: workshop.item.name, exact: false }).first()
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("home-mobile.png"), fullPage: true });
});

async function returnHome(page: Page) {
  await page.getByRole("link", { name: "HomeBox", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(sections(page).nth(1)).toContainText("Recently Added");
  // Check that a pending inventory search cannot overwrite the destination URL.
  await expect(page).toHaveURL(/\/home$/);
}

test("Home search uses the submitted query and recent names open their own records", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { first, workshop } = await setup(page);
  const source = await json<EntityOut>(page.request, "GET", `/entities/${workshop.item.id}`, undefined, first.id);
  const other = await json<EntityOut>(
    page.request,
    "POST",
    "/entities",
    {
      name: "Camping tent & lantern",
      description: "Another recent record, not the illustrative drill",
      quantity: 1,
      tagIds: [],
      parentId: workshop.location.id,
      entityTypeId: source.entityType!.id,
    },
    first.id
  );
  await page.reload();

  await page.locator("[data-sidebar=menu]").getByRole("link", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/items$/);
  await returnHome(page);

  // Focus alone must not navigate or substitute the prototype's fixed drill query.
  const search = page.getByRole("searchbox");
  for (const [query, submit] of [
    ["Workshop inventory & café + #1 / 50%?", "enter"],
    ["Camping tent & lantern + #2 / 100%?", "button"],
  ] as const) {
    await search.focus();
    await expect(page).toHaveURL(/\/home$/);
    await search.fill(query);
    if (submit === "enter") await search.press("Enter");
    else await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname === "/items" && url.searchParams.get("q") === query);
    // Vue Router may normalize spaces to +; reserved characters must still stay in q.
    const url = new URL(page.url());
    expect([...url.searchParams.keys()]).toEqual(["q"]);
    expect(url.hash).toBe("");
    expect(url.search).toContain("%26");
    expect(url.search).toContain("%23");
    await expect(search).toHaveValue("");
    await returnHome(page);
  }

  for (const item of [workshop.item, other]) {
    const name = sections(page).nth(1).getByRole("link", { name: item.name, exact: true });
    await expect(name).toHaveAttribute("href", `/item/${item.id}`);
    await name.click();
    await expect(page).toHaveURL(new RegExp(`/item/${item.id}$`));
    await expect(page.locator("main")).toContainText(item.name);
    await returnHome(page);
  }
});

test.describe("Shell integrations with a camera", () => {
  test("Home shell retains unrelated destinations, creation dialogs and scanner integration", async ({
    page,
    context,
    browserName,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await setup(page);
    const sidebar = page.locator("[data-sidebar=menu]");
    for (const [label, path] of [
      ["Locations", "/locations"],
      ["Tags", "/tags"],
      ["Templates", "/templates"],
      ["Maintenance", "/maintenance"],
      ["Profile", "/profile"],
      ["Collection", "/collection/members"],
      ["Invites", "/collection/invites"],
      ["Notifiers", "/collection/notifiers"],
      ["Settings", "/collection/settings"],
      ["Entity Types", "/collection/entity-types"],
      ["Tools", "/collection/tools"],
    ]) {
      const link = sidebar.getByRole("link", { name: label, exact: true });
      await expect(link).toHaveAttribute("href", path!);
      await link.click();
      await expect(page).toHaveURL(url => url.pathname === path);
      await returnHome(page);
    }

    for (const label of ["Item", "Location", "Tag"]) {
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await page.getByRole("menuitem", { name: label, exact: false }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(label);
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page).toHaveURL(/\/home$/);
    }

    // Only Chromium provides this virtual camera; other projects still check navigation and creation.
    if (browserName === "chromium") {
      await context.grantPermissions(["camera"]);
      await page.getByRole("button", { name: "Scanner", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog").locator("video")).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
      await expect(page).toHaveURL(/\/home$/);
    }
  });
});

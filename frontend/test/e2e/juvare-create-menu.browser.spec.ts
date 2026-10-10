import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { EntityOut, EntityTypeSummary, Group } from "../../lib/api/types/data-contracts";

async function setup(page: Page) {
  const email = `create-menu-${randomUUID()}@example.com`;
  const password = "CreateMenuTest123!";
  const register = await page.request.post("/api/v1/users/register", {
    data: { email, name: "Create Menu Member", password, token: "" },
  });
  expect(register.ok(), await register.text()).toBeTruthy();
  const login = await page.request.post("/api/v1/users/login", {
    data: { username: email, password, stayLoggedIn: true },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  const groups = await page.request.get("/api/v1/groups/all");
  expect(groups.ok()).toBeTruthy();
  const [group] = (await groups.json()) as Group[];
  const typesResponse = await page.request.get("/api/v1/entity-types", {
    headers: { "X-Tenant": group!.id },
  });
  expect(typesResponse.ok()).toBeTruthy();
  const types = (await typesResponse.json()) as EntityTypeSummary[];
  const itemResponse = await page.request.post("/api/v1/entities", {
    headers: { "X-Tenant": group!.id },
    data: {
      name: "Menu dismissal inventory",
      description: "",
      quantity: 3,
      tagIds: [],
      entityTypeId: types.find(type => !type.isLocation)!.id,
    },
  });
  expect(itemResponse.ok(), await itemResponse.text()).toBeTruthy();
  const item = (await itemResponse.json()) as EntityOut;
  const update = await page.request.put(`/api/v1/entities/${item.id}`, {
    headers: { "X-Tenant": group!.id },
    data: {
      ...item,
      entityTypeId: item.entityType!.id,
      tagIds: [],
      purchasePrice: 37.5,
    },
  });
  expect(update.ok(), await update.text()).toBeTruthy();
  await page.addInitScript(collectionId => {
    localStorage.setItem(
      "homebox/preferences/location",
      JSON.stringify({
        collectionId,
        language: "en",
        overrideFormatLocale: "en-US",
      })
    );
  }, group!.id);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/home");
  await expect(page.locator("main tbody")).toContainText(item.name);
  await expect(page.locator("main tbody")).toContainText("37.50");
  return types;
}

const create = (page: Page) => page.getByRole("button", { name: "Create", exact: true, includeHidden: true });
const menu = (page: Page) => page.getByRole("menu");

async function unchanged(page: Page, dashboard: string, url: string) {
  await expect(menu(page)).toBeHidden();
  await expect(create(page)).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(url);
  expect(await page.locator("main").innerText()).toBe(dashboard);
}

test("Create is anchored with visible shortcuts and dismisses without changing Home", async ({ page }, testInfo) => {
  await setup(page);
  const dashboard = await page.locator("main").innerText();
  const url = page.url();
  await create(page).click();
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole("menuitem")).toHaveText([/Item.*⇧.*1/s, /Location.*⇧.*2/s, /Tag.*⇧.*3/s]);
  await expect(menu(page).locator("kbd")).toHaveCount(3);
  for (const hint of await menu(page).locator("kbd").all()) {
    await expect(hint).toBeVisible();
  }
  const triggerBox = (await create(page).boundingBox())!;
  const menuBox = (await menu(page).boundingBox())!;
  expect(menuBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height);
  expect(menuBox.y - triggerBox.y - triggerBox.height).toBeLessThan(10);
  expect(Math.abs(menuBox.x - triggerBox.x)).toBeLessThan(2);
  // Allow subpixel rounding during the primitive's opening animation.
  expect(menuBox.width).toBeGreaterThanOrEqual(triggerBox.width - 1);
  await page.screenshot({
    path: testInfo.outputPath("create-menu-open.png"),
    fullPage: true,
  });
  await create(page).click();
  await unchanged(page, dashboard, url);

  // Neutral backgrounds, not navigation links: above, below and beside the menu.
  for (const point of [
    { x: 2, y: triggerBox.y - 8 },
    { x: 2, y: menuBox.y + menuBox.height + 16 },
    { x: menuBox.x + menuBox.width + 16, y: 900 },
  ]) {
    await create(page).click();
    await expect(menu(page)).toBeVisible();
    await page.mouse.click(point.x, point.y);
    await unchanged(page, dashboard, url);
  }
});

test("Create supports keyboard activation, arrows, Escape and focus return", async ({ page }) => {
  await setup(page);
  const dashboard = await page.locator("main").innerText();
  const url = page.url();
  for (const activation of ["Enter", "Space"]) {
    await create(page).focus();
    await page.keyboard.press(activation);
    const entries = menu(page).getByRole("menuitem");
    await expect(entries.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(entries.nth(1)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(entries.nth(2)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(entries.nth(1)).toBeFocused();
    await page.keyboard.press("Escape");
    await unchanged(page, dashboard, url);
    await expect(create(page)).toBeFocused();
  }
});

test("Create actions, Shift shortcuts and quick-menu digits retain existing dialogs without saving", async ({
  page,
}) => {
  const types = await setup(page);
  const dashboard = await page.locator("main").innerText();
  const url = page.url();
  const actions = [
    {
      name: "Item",
      type: types.find(type => !type.isLocation)!,
      key: "Digit1",
    },
    {
      name: "Location",
      type: types.find(type => type.isLocation)!,
      key: "Digit2",
    },
    { name: "Tag", type: null, key: "Digit3" },
  ];
  for (const mode of ["menu", "shortcut", "quick-menu"]) {
    for (const [index, action] of actions.entries()) {
      if (mode === "menu") {
        await create(page).click();
        const entry = menu(page)
          .getByRole("menuitem")
          .filter({ hasText: new RegExp(`^${action.name}`) });
        if (index === 1) {
          await entry.focus();
          await page.keyboard.press("Enter");
        } else {
          await entry.click();
        }
      } else if (mode === "shortcut") {
        await create(page).focus();
        await page.keyboard.press(`Shift+${action.key}`);
      } else {
        await page.keyboard.press("Control+Backquote");
        await expect(page.getByRole("combobox").last()).toBeFocused();
        await page.keyboard.press(String(index + 1));
      }
      const dialog = page.getByRole("dialog").last();
      await expect(dialog).toBeVisible();
      if (action.type) {
        // Existing entity-type selection distinguishes Item and Location integration.
        const translatedName = action.type.isLocation ? "Location" : "Item";
        await expect(dialog.getByRole("combobox").first()).toContainText(translatedName);
      } else {
        await expect(dialog.getByRole("heading")).toContainText("Create Tag");
      }
      await page.keyboard.press("Escape");
      if (mode === "quick-menu") {
        await page.keyboard.press("Escape");
      }
      await expect(page.getByRole("dialog")).toBeHidden();
      await unchanged(page, dashboard, url);
    }
  }
});

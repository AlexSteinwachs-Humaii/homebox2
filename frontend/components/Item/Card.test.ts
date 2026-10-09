import { readFileSync } from "node:fs";
import { compile, createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";

// Exercise the real card template without Nuxt's API/store setup or a browser DOM.
const source = readFileSync(new URL("./Card.vue", import.meta.url), "utf8");
const template = source.split("<template>")[1]!.split("</template>")[0]!;
const render = compile(template);

async function renderCard(assetId: string, showAssetId = false) {
  const app = createSSRApp({
    render,
    setup: () => ({
      item: {
        id: "item-uuid",
        name: "Recent asset",
        assetId,
        quantity: 1,
        description: "",
      },
      showAssetId,
      tableRow: null,
      imageUrl: "",
      objectContain: false,
      itemTags: [],
      locationString: "",
    }),
  });
  app.config.globalProperties.$t = (key: string) => (key === "items.asset_id" ? "Asset ID" : key);
  const stub = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h("div", slots.default?.()),
  });
  for (const tag of new Set([...template.matchAll(/<([A-Z]\w*)/g)].map(match => match[1]!))) {
    app.component(tag, stub);
  }
  return renderToString(app);
}

describe("homepage asset ID cards", () => {
  it.each(["000042", "000000000000000000000000000000000042"])("renders the unchanged string %s", async assetId => {
    const html = await renderCard(assetId, true);
    expect(html).toContain(`Asset ID: ${assetId}`);
    expect(html).toContain('to="/item/item-uuid"');
    expect(html).toContain("break-all");
  });

  it("leaves other card callers unchanged when not opted in", async () => {
    expect(await renderCard("000042")).not.toContain("Asset ID:");
    expect(source).toMatch(/showAssetId:\s*{\s*type: Boolean,\s*default: false/);
  });

  it("opts in both responsive homepage branches", () => {
    const home = readFileSync(new URL("../../pages/home/index.vue", import.meta.url), "utf8");
    expect(home).toContain(":visible-columns=\"['assetId']\"");
    expect(home).toContain(':item="item" show-asset-id');
    expect(home).toContain('v-if="itemTable.items.length === 0"');
  });
});

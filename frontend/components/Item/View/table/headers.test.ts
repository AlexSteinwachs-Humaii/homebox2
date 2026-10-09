import { describe, expect, it } from "vitest";
import { initialTableHeaders } from "./headers";

const ids = ["assetId", "name", "quantity", "insured", "purchasePrice", "updatedAt", "location", "createdAt"];
const visible = ["name", "quantity", "insured", "purchasePrice"];
const preset = ["assetId", "name", "quantity", "insured", "purchasePrice", "location", "createdAt"];

describe("initial inventory headers", () => {
  it("uses the search hierarchy while keeping other columns configurable", () => {
    expect(initialTableHeaders(ids, undefined, visible, preset)).toEqual([
      ...preset.map(value => ({ value, enabled: true })),
      { value: "updatedAt", enabled: false },
    ]);
  });

  it("preserves saved visibility and order, including an empty preference", () => {
    const saved = [
      { value: "insured", enabled: true },
      { value: "name", enabled: true },
      { value: "quantity", enabled: false },
    ];
    expect(initialTableHeaders(ids, saved, visible, preset)).toBe(saved);
    expect(initialTableHeaders(ids, [], visible, preset)).toEqual([]);
  });

  it("does not change other surfaces' default order and visibility", () => {
    expect(initialTableHeaders(ids, undefined, visible)).toEqual(
      ids.map(value => ({ value, enabled: visible.includes(value) }))
    );
  });
});

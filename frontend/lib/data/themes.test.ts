import { describe, expect, it } from "vitest";
import { darkThemes, themes } from "./themes";

// Preserve the picker contract (dark remains a legacy type, not a picker option).
const existingThemes = [
  "homebox",
  "garden",
  "light",
  "cupcake",
  "bumblebee",
  "emerald",
  "corporate",
  "synthwave",
  "retro",
  "cyberpunk",
  "valentine",
  "halloween",
  "forest",
  "aqua",
  "lofi",
  "pastel",
  "fantasy",
  "wireframe",
  "black",
  "luxury",
  "dracula",
  "cmyk",
  "autumn",
  "business",
  "acid",
  "lemonade",
  "night",
  "coffee",
  "winter",
];

describe("theme registration", () => {
  it("adds one clearly labeled light Claude option without changing existing options or the default", () => {
    expect(themes.filter(theme => theme.value === "claude")).toEqual([{ label: "Claude", value: "claude" }]);
    expect(themes.filter(theme => theme.value !== "claude").map(theme => theme.value)).toEqual(existingThemes);
    expect(themes[0]).toEqual({ label: "Homebox", value: "homebox" });
    expect(new Set(themes.map(theme => theme.value)).size).toBe(themes.length);
    expect(darkThemes).not.toContain("claude");
  });
});

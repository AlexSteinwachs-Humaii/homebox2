import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import tailwindConfig from "../../tailwind.config.js";

const css = readFileSync(new URL("./main.css", import.meta.url), "utf8");
const root = postcss.parse(css);
const tokens = (selector: string) => {
  const values: Record<string, string> = {};
  root.walkRules(selector, rule => {
    rule.walkDecls(decl => {
      values[decl.prop] = decl.value;
    });
  });
  return values;
};
const claude = tokens(".theme-claude");
function color(name: string) {
  const value = claude[`--${name}`];
  if (!value) throw new Error(`Missing Claude token: ${name}`);
  return value;
}

// WCAG relative luminance from the same HSL values consumed by Tailwind.
function rgb(hsl: string) {
  const [h = 0, s = 0, l = 0] = hsl.replaceAll("%", "").split(" ").map(Number);
  const saturation = s / 100;
  const lightness = l / 100;
  const a = saturation * Math.min(lightness, 1 - lightness);
  return [0, 8, 4].map(n => {
    const k = (n + h / 30) % 12;
    return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  });
}
function luminance(channels: number[]) {
  return channels
    .map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
}
function contrast(foreground: string, background: string, opacity = 1) {
  const bg = rgb(color(background));
  const fg = rgb(color(foreground)).map((c, i) => c * opacity + (bg[i] ?? 0) * (1 - opacity));
  const values = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
}

describe("Claude theme foundation", () => {
  it("defines exactly the complete shared token contract without layout or font overrides", () => {
    expect(Object.keys(claude).sort()).toEqual(Object.keys(tokens(":root,.homebox")).sort());
    expect(claude["--radius"]).toBe(tokens(":root,.homebox")["--radius"]);
    for (const [name, value] of Object.entries(claude)) {
      if (name !== "--radius") expect(value).toMatch(/^\d+ \d+% \d+%$/);
    }
  });

  it("keeps normal text and button labels at WCAG AA contrast", () => {
    const pairs = [
      ["foreground", "background"],
      ["foreground", "background-accent"],
      ["card-foreground", "card"],
      ["popover-foreground", "popover"],
      ["primary-foreground", "primary"],
      ["secondary-foreground", "secondary"],
      ["accent-foreground", "accent"],
      ["muted-foreground", "muted"],
      ["destructive-foreground", "destructive"],
      ["sidebar-foreground", "sidebar-background"],
      ["sidebar-primary-foreground", "sidebar-primary"],
      ["sidebar-accent-foreground", "sidebar-accent"],
    ] as const;
    for (const [fg, bg] of pairs) expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    for (const surface of ["background", "card", "popover", "sidebar-background"]) {
      for (const text of ["muted-foreground", "primary", "destructive"]) {
        expect(contrast(text, surface), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // Buttons use bg-primary/90 and bg-destructive/90 on hover.
    for (const name of ["primary", "destructive"]) {
      const bg = rgb(color("background"));
      const hover = rgb(color(name)).map((c, i) => c * 0.9 + (bg[i] ?? 0) * 0.1);
      const label = luminance(rgb(color(`${name}-foreground`)));
      expect((label + 0.05) / (luminance(hover) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps input boundaries and keyboard focus distinguishable from light surfaces", () => {
    for (const surface of ["background", "card", "popover", "sidebar-background"]) {
      for (const indicator of ["input", "border", "ring", "sidebar-border", "sidebar-ring"]) {
        expect(contrast(indicator, surface), `${indicator} on ${surface}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("ships the unused theme in generated CSS and retains the picker reset", async () => {
    const result = await postcss([
      tailwindcss({
        ...tailwindConfig,
        content: [{ raw: "bg-background text-foreground font-sans" }],
      }),
    ]).process(css, { from: undefined });
    const generated = postcss.parse(result.css);
    const selectors: string[] = [];
    generated.walkRules(rule => {
      selectors.push(rule.selector);
    });
    expect(selectors).toContain(".theme-claude");
    expect(selectors.some(selector => selector.includes(".homebox"))).toBe(true);
    expect(selectors.filter(selector => selector.includes("claude"))).toEqual([".theme-claude"]);
    const picker = readFileSync(new URL("../../components/App/ThemePicker.vue", import.meta.url), "utf8");
    expect(picker).toContain('class="homebox grid');
    expect(picker).toContain("font-sans");
  });
});

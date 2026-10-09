import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, nextTick, ref, watch } from "vue";
import { themes as options } from "../lib/data/themes";
import type { DaisyTheme } from "../lib/data/themes";
import { themes, useTheme } from "./use-theme";

function setup(initialTheme: DaisyTheme = "homebox") {
  const classes = new Set(["unrelated", "dark", "theme-legacy"]);
  const attributes = new Map<string, string>();
  const html = {
    setAttribute: (key: string, value: string) => attributes.set(key, value),
    classList: {
      [Symbol.iterator]: () => classes.values(),
      add: (...names: string[]) => names.forEach(name => classes.add(name)),
      remove: (...names: string[]) => names.forEach(name => classes.delete(name)),
    },
  };
  const document = { documentElement: html, querySelector: () => html };
  const preferences = ref({ theme: initialTheme });
  let mount = () => {};
  vi.stubGlobal("document", document);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("onMounted", (callback: () => void) => {
    mount = callback;
  });
  vi.stubGlobal("useViewPreferences", () => preferences);
  const scope = effectScope();
  const theme = scope.run(() => useTheme())!;
  mount();
  return { classes, attributes, document, preferences, theme, scope };
}

afterEach(() => vi.unstubAllGlobals());

describe("theme selection lifecycle", () => {
  it("applies Claude via the existing preference watcher and removes stale classes", async () => {
    const state = setup();
    try {
      expect(themes).toContain("theme-claude");
      state.theme.setTheme("claude");
      await nextTick();
      expect(state.preferences.value.theme).toBe("claude");
      expect(state.attributes.get("data-theme")).toBe("claude");
      expect([...state.classes]).toEqual(["unrelated", "theme-claude"]);

      for (const option of options.filter(option => option.value !== "claude")) {
        state.theme.setTheme("claude");
        await nextTick();
        state.theme.setTheme(option.value);
        await nextTick();
        expect(state.attributes.get("data-theme")).toBe(option.value);
        expect([...state.classes]).toEqual(["unrelated", `theme-${option.value}`]);
      }
    } finally {
      state.scope.stop();
    }
  });

  it("restores a saved Claude preference in startup script and on composable remount", () => {
    const state = setup("claude");
    try {
      state.classes.clear();
      state.attributes.clear();
      runInNewContext(readFileSync(new URL("../public/set-theme.js", import.meta.url), "utf8"), {
        localStorage: {
          getItem: (key: string) => {
            expect(key).toBe("homebox/preferences/location");
            return JSON.stringify(state.preferences.value);
          },
        },
        document: state.document,
        console: { log: vi.fn(), error: vi.fn() },
      });
      expect(state.attributes.get("data-theme")).toBe("claude");
      expect([...state.classes]).toEqual(["theme-claude"]);
      const restored = setup("claude");
      try {
        expect(restored.theme.theme.value).toBe("claude");
        expect(restored.attributes.get("data-theme")).toBe("claude");
        expect([...restored.classes]).toEqual(["unrelated", "theme-claude"]);
      } finally {
        restored.scope.stop();
      }
    } finally {
      state.scope.stop();
    }
  });
});

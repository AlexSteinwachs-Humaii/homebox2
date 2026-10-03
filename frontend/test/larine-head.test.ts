import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("nuxt/config", () => ({ defineNuxtConfig: (config: unknown) => config }));

async function scriptsFor(token: string | undefined) {
  vi.stubEnv("LARINE_WIDGET_TOKEN", token);
  vi.resetModules();
  const { default: config } = await import("../nuxt.config");
  return config.app!.head!.script!;
}

afterEach(() => vi.unstubAllEnvs());

describe("Larine shared HTML head", () => {
  it.each([undefined, "", "   "])("omits an unconfigured widget (%s)", async token => {
    expect(await scriptsFor(token)).toEqual([{ src: "/set-theme.js" }]);
  });

  it("includes one deferred widget with the provisioned public token", async () => {
    // Synthetic test-only value; never used in a deployment build.
    const scripts = await scriptsFor("  public-token-for-unit-test  ");
    expect(scripts).toEqual([
      { src: "/set-theme.js" },
      {
        src: "https://next.larine.dev/larine-feedback.js",
        crossorigin: "anonymous",
        defer: true,
        "data-token": "public-token-for-unit-test",
        "data-api-url": "https://api-stage.larine.dev",
        "data-enabled": "always",
        "data-shortcut": "mod+shift+f",
        "data-source": "HomeBox - Test 1",
      },
    ]);
  });
});

import { defineNuxtConfig } from "nuxt/config";

// This is a public widget token embedded in generated HTML, not a server API key.
// Provision it for the frontend build; runtime backend variables cannot change it.
const larineWidgetToken = process.env.LARINE_WIDGET_TOKEN?.trim();

// https://v3.nuxtjs.org/api/configuration/nuxt.config
export default defineNuxtConfig({
  ssr: false,

  components: {
    dirs: [],
  },

  build: {
    transpile: ["vue-i18n"],
  },

  modules: [
    "@nuxtjs/tailwindcss",
    "@pinia/nuxt",
    "@vueuse/nuxt",
    "@vite-pwa/nuxt",
    "unplugin-icons/nuxt",
    "shadcn-nuxt",
    "@nuxt/eslint",
  ],

  eslint: {
    config: {},
  },

  // Runtime config for OpenTelemetry
  // Note: otelEnabled is determined automatically by querying the backend status endpoint.
  // When the backend has telemetry enabled, the frontend will automatically enable it.
  runtimeConfig: {
    public: {
      // OpenTelemetry configuration (can be overridden by environment variables)
      otelServiceName: process.env.NUXT_PUBLIC_OTEL_SERVICE_NAME || "homebox-frontend",
      otelServiceVersion: process.env.NUXT_PUBLIC_OTEL_SERVICE_VERSION || "1.0.0",
      otelSampleRate: process.env.NUXT_PUBLIC_OTEL_SAMPLE_RATE || "1.0",
      otelDebug: process.env.NUXT_PUBLIC_OTEL_DEBUG || "false",
    },
  },

  nitro: {
    devProxy: {
      "/api": {
        target: "http://localhost:7745/api",
        ws: true,
        changeOrigin: true,
      },
    },
  },

  app: {
    head: {
      script: [
        { src: "/set-theme.js" },
        ...(larineWidgetToken
          ? [
              {
                src: "https://next.larine.dev/larine-feedback.js",
                // Use the widget server's CORS permission under COEP require-corp.
                crossorigin: "anonymous",
                defer: true,
                "data-token": larineWidgetToken,
                "data-api-url": "https://api-stage.larine.dev",
                "data-enabled": "always",
                "data-shortcut": "mod+shift+f",
                "data-source": "HomeBox - Test 1",
              },
            ]
          : []),
      ],
    },
  },

  css: ["@/assets/css/main.css"],

  pwa: {
    workbox: {
      // HTML contains runtime Larine deployment context from the Go server.
      // Never serve an app shell cached with a previous launch's associations.
      globIgnores: ["**/*.html"],
      navigateFallback: null,
      navigateFallbackDenylist: [/^\/api/],
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          urlPattern: /^\/api/,
          handler: "NetworkFirst",
          method: "GET",
          options: {
            cacheName: "api-cache",
            cacheableResponse: { statuses: [0, 200] },
            expiration: { maxAgeSeconds: 60 * 60 * 24 },
          },
        },
      ],
    },
    registerType: "autoUpdate",
    injectRegister: "script",
    injectManifest: {
      swSrc: "sw.js",
    },
    devOptions: {
      // Enable to troubleshoot during development
      enabled: false,
    },
    manifest: {
      name: "Homebox",
      short_name: "Homebox",
      description: "Home Inventory App",
      theme_color: "#5b7f67",
      start_url: "/home",
      icons: [
        {
          src: "pwa-192x192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "pwa-512x512.png",
          sizes: "512x512",
          type: "image/png",
        },
        {
          src: "pwa-512x512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable",
        },
      ],
    },
  },
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },

  compatibilityDate: "2024-11-29",
});

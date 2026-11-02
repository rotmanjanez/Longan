/// <reference types="vitest/config" />

import { fileURLToPath, URL } from "node:url";
import ui from "@nuxt/ui/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const backend = process.env.LONGAN_API_URL ?? "http://localhost:3100";

export default defineConfig({
	plugins: [
		vue(),
		ui({
			colorMode: false,
			// Composables are imported explicitly from "@nuxt/ui/composables".
			autoImport: false,
			// Local components are imported explicitly (typed without a generated components.d.ts, so local
			// typecheck == CI); only Nuxt UI's own U* components are auto-registered through its resolver.
			components: { dirs: [] },
			dts: false,
			// Bundle every icon referenced in our sources (Nuxt UI's own icons are bundled by default), so the
			// app never falls back to fetching from api.iconify.design. Icon names must be string literals.
			icon: { clientBundle: { scan: { globInclude: ["src/**/*.{vue,ts}"], globExclude: ["**/*.test.ts"] } } },
			ui: {
				colors: { primary: "sky", neutral: "slate" },
				button: {
					slots: { base: "rounded-xl" },
					compoundVariants: [{ color: "primary", variant: "solid", class: "text-white" }],
				},
			},
		}),
	],
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	server: {
		port: 5173,
		strictPort: true,
		proxy: {
			"/api": { target: backend, changeOrigin: true },
			"/auth": { target: backend, changeOrigin: true },
		},
	},
	build: {
		chunkSizeWarningLimit: 900,
	},
	test: {
		environment: "jsdom",
		include: ["src/**/*.test.ts"],
	},
});

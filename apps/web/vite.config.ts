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

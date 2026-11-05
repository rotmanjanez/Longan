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
				colors: { primary: "alpine", neutral: "moss" },
				// Touch screens: every button is at least a 40×40 tap target, whatever its size prop.
				button: {
					slots: {
						base: "rounded-md font-medium pointer-coarse:min-h-10 pointer-coarse:min-w-10 justify-center",
					},
					compoundVariants: [{ color: "primary", variant: "solid", class: "text-white" }],
				},
				empty: {
					slots: {
						root: "py-16",
						title: "font-serif font-normal text-2xl tracking-tight text-highlighted",
						description: "text-muted max-w-sm text-pretty",
					},
				},
				breadcrumb: {
					slots: { link: "text-xs", separatorIcon: "size-3" },
				},
				dropdownMenu: { slots: { content: "rounded-lg shadow-xl shadow-black/10" } },
				toast: {
					slots: {
						root: "items-center gap-3 rounded-lg py-3 ps-4 pe-3 shadow-xl shadow-black/10",
						title: "font-normal",
						icon: "size-4",
					},
				},
				tooltip: { slots: { content: "rounded-md" } },
				kbd: { slots: { base: "rounded-sm" } },
				// iOS-style switch: 52×32 pill, white knob with a soft shadow, accent colour when on, label left / switch right.
				switch: {
					slots: {
						root: "flex-row-reverse items-center justify-between gap-3",
						base: "p-0.5 border-0 data-[state=unchecked]:bg-neutral-200 dark:data-[state=unchecked]:bg-neutral-700",
						thumb: "bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_3px_1px_rgb(0_0_0/0.06)]",
						wrapper: "ms-0 min-w-0",
					},
					variants: {
						size: {
							md: {
								base: "w-13",
								container: "h-8",
								thumb: "size-7 data-[state=checked]:translate-x-5 data-[state=checked]:rtl:-translate-x-5",
							},
						},
					},
					defaultVariants: { color: "primary", size: "md" },
				},
				// 16px text in fields on phones: iOS Safari zooms into anything smaller on focus.
				input: { slots: { base: "max-sm:text-base" } },
				textarea: { slots: { base: "max-sm:text-base" } },
				select: { slots: { base: "max-sm:text-base" } },
				selectMenu: { slots: { base: "max-sm:text-base" } },
				inputMenu: { slots: { base: "max-sm:text-base" } },
				navigationMenu: { slots: { link: "pointer-coarse:py-2.5" } },
				// Phones get a bottom sheet (full width, flush with the bottom edge, safe-area aware) instead of a
				// floating centred card.
				modal: {
					slots: {
						overlay: "bg-black/40 backdrop-blur-[2px]",
						content:
							"rounded-xl shadow-2xl shadow-black/20 ring-0 divide-y-0 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:max-h-[calc(100dvh-env(safe-area-inset-top)-1.5rem)]",
						header: "pb-2 sm:pb-2",
						title: "font-serif font-normal text-2xl tracking-tight text-highlighted",
						description: "text-muted",
						footer: "pt-2 sm:pt-2 max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))]",
					},
				},
				slideover: {
					slots: {
						overlay: "bg-black/40 backdrop-blur-[2px]",
						content: "ring-0 divide-y-0",
						title: "font-serif font-normal text-2xl tracking-tight text-highlighted",
						description: "text-muted text-xs",
					},
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

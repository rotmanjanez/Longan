import "./style.css";
import ui from "@nuxt/ui/vue-plugin";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { createApp } from "vue";
import { queryClient } from "@/api/query.ts";
import App from "./App.vue";
import { i18n } from "./i18n/index.ts";
import { router } from "./router/index.ts";
import { pinia } from "./stores/index.ts";

createApp(App).use(pinia).use(router).use(i18n).use(ui).use(VueQueryPlugin, { queryClient }).mount("#app");

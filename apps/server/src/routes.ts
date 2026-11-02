/**
 * Side-effect imports of every module that registers plain HTTP routes via addHttpRoutes().
 * Import this file before createApp(). Keep the list explicit so the dependency is visible.
 */
import "./auth/routes.ts";
import "./http/asset.ts";
import "./http/upload.ts";
import "./http/zip.ts";

import {
	type GlobalRights,
	ImageOverlayType,
	type InitConfig,
	PhotoLayout,
	SizeVariantType,
	type SmartAlbumId,
	ThemeColor,
	ThemeNeutral,
} from "@longan/shared";
import pkg from "../../../package.json" with { type: "json" };
import { toUserMe } from "../../auth/users.ts";
import { env } from "../../env.ts";
import { settingBool, settingInt, settingJson, settingStr } from "../../settings/index.ts";
import { os } from "../base.ts";

export const init = os.init.router({
	get: os.init.get.handler(async ({ context: ctx }) => {
		const db = ctx.db;
		const bool = (k: string, d: boolean) => settingBool(k, d, db);
		const int = (k: string, d: number) => settingInt(k, d, db);
		const str = (k: string, d: string) => settingStr(k, d, db);

		const loggedIn = ctx.user !== null;
		const { isAdmin, mayUpload } = ctx.viewer;
		const loginRequired = await bool("site.login_required", false);
		const guestBlocked = !loggedIn && loginRequired;

		const features = {
			search: await bool("features.search", true),
			map: await bool("features.map", true),
			timeline: await bool("features.timeline", true),
			ratings: await bool("features.ratings", true),
		};
		const smartPublic = await bool("smart.public", false);
		const timelinePublic = await bool("features.timeline_public", false);
		const guestTimeline = !guestBlocked && smartPublic && timelinePublic;

		const rights: GlobalRights = {
			isAdmin,
			mayUpload,
			canCreateAlbums: mayUpload,
			canUseSearch: features.search && !guestBlocked,
			canUseMap: features.map && !guestBlocked,
			canUseTimeline: features.timeline && (loggedIn || guestTimeline),
		};

		// Smart albums the viewer can see. Guests need smart.public; unsorted is owner/admin only (uploaders).
		const smartAlbums: SmartAlbumId[] = [];
		const guestSmart = !guestBlocked && smartPublic;
		for (const id of ["unsorted", "recent", "highlighted", "untagged", "on_this_day"] as const) {
			if (!(await bool(`smart.${id}`, false))) continue;
			if (id === "unsorted" ? mayUpload : loggedIn || guestSmart) smartAlbums.push(id);
		}
		if (rights.canUseTimeline) smartAlbums.push("timeline");

		const overridesRaw = await settingJson<unknown>("theme.overrides", {}, db);
		const overrides: Record<string, string> = {};
		if (overridesRaw && typeof overridesRaw === "object" && !Array.isArray(overridesRaw)) {
			for (const [k, v] of Object.entries(overridesRaw)) if (typeof v === "string") overrides[k] = v;
		}

		const downloadableVariants = (await str("download.variants", "original"))
			.split(",")
			.map((s) => SizeVariantType.safeParse(s.trim()))
			.flatMap((r) => (r.success ? [r.data] : []));

		const config: InitConfig = {
			title: await str("site.title", "Longan"),
			version: pkg.version,
			darkModeDefault: await bool("site.dark_mode_default", true),
			theme: {
				primary: ThemeColor.catch("sky").parse(await str("theme.primary", "sky")),
				neutral: ThemeNeutral.catch("slate").parse(await str("theme.neutral", "slate")),
				overrides,
			},
			defaultLayout: PhotoLayout.catch("justified").parse(await str("layout.default", "justified")),
			layout: {
				justifiedRowHeight: await int("layout.justified_row_height", 320),
				squareColumnWidth: await int("layout.square_column_width", 200),
				masonryColumnWidth: await int("layout.masonry_column_width", 300),
				gridColumnWidth: await int("layout.grid_column_width", 300),
				gap: await int("layout.gap", 8),
			},
			imageOverlayType: ImageOverlayType.catch("exif").parse(await str("layout.image_overlay", "exif")),
			dateFormat: await str("site.date_format", "d MMM yyyy"),
			loginRequired,
			nsfwVisibleByDefault: await bool("nsfw.visible_by_default", false),
			nsfwBlur: await bool("nsfw.blur", true),
			downloadableVariants,
			mapTileUrl: await str("map.tile_url", "https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
			mapAttribution: await str("map.attribution", "&copy; OpenStreetMap contributors"),
			features,
			smartAlbums,
			recentAgeDays: await int("smart.recent_age_days", 30),
			uploadMaxBytes: env.UPLOAD_MAX_BYTES,
			uploadParallelism: await int("upload.parallelism", 3),
			slideshowIntervalS: Math.min(60, Math.max(1, await int("gallery.slideshow_interval_s", 5))),
		};

		return { user: ctx.user ? toUserMe(ctx.user) : null, rights, config };
	}),
});

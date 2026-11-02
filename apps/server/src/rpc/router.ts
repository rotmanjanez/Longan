import { os } from "./base.ts";
import { admin } from "./procedures/admin.ts";
import { albums } from "./procedures/albums.ts";
import { init } from "./procedures/init.ts";
import { map } from "./procedures/map.ts";
import { photos } from "./procedures/photos.ts";
import { search } from "./procedures/search.ts";
import { settings } from "./procedures/settings.ts";
import { sharing } from "./procedures/sharing.ts";
import { tags } from "./procedures/tags.ts";
import { users } from "./procedures/users.ts";

export const router = os.router({ init, albums, sharing, photos, tags, search, map, users, settings, admin });
export type AppRouter = typeof router;

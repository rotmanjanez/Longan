import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./index.ts";
import { seedSettings } from "./seed.ts";

await migrate(db, { migrationsFolder: new URL("../../drizzle", import.meta.url).pathname });
await seedSettings(db);
await sql.end();
console.log("migrations applied");

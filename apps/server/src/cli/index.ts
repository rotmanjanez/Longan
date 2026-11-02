/**
 * Longan maintenance CLI.
 *   node --env-file=.env src/cli/index.ts <command> [options]
 */
import { sql } from "../db/index.ts";
import { CliError } from "./common.ts";

const USAGE = `Usage: node --env-file=.env src/cli/index.ts <command> [options]

Commands:
  sync <dir> [--album <id>] [--owner <userId|username>] [--delete-imported] [--dry-run]
      Import a directory tree. Sub-directories become (nested) albums named after the directory;
      files directly in <dir> go to --album (or unsorted). Existing albums with the same title are reused.
  reprocess [--variants medium,thumb] [--photo <id>]
      Regenerate size variants (all photos, or one) synchronously.
  doctor [--fix]
      Report variant rows with missing files, orphan files in storage and photos without variants.
      --fix queues reprocess jobs for repairable photos.
`;

async function main(argv: string[]): Promise<number> {
	const [cmd, ...rest] = argv;
	switch (cmd) {
		case "sync":
			return (await import("./sync.ts")).sync(rest);
		case "reprocess":
			return (await import("./reprocess.ts")).reprocess(rest);
		case "doctor":
			return (await import("./doctor.ts")).doctor(rest);
		case undefined:
		case "help":
		case "--help":
		case "-h":
			process.stdout.write(USAGE);
			return cmd === undefined ? 1 : 0;
		default:
			process.stderr.write(`Unknown command "${cmd}".\n\n${USAGE}`);
			return 1;
	}
}

let code = 1;
try {
	code = await main(process.argv.slice(2));
} catch (err) {
	const e = err instanceof Error ? err : new Error(String(err));
	const argError = String((e as { code?: unknown }).code ?? "").startsWith("ERR_PARSE_ARGS");
	process.stderr.write(`error: ${e instanceof CliError || argError ? e.message : (e.stack ?? e.message)}\n`);
} finally {
	await sql.end({ timeout: 5 });
}
process.exit(code);

import { notImplemented, os } from "../base.ts";

export const admin = os.admin.router({
	health: os.admin.health.handler(notImplemented("admin.health")),
	jobs: os.admin.jobs.handler(notImplemented("admin.jobs")),
	reprocess: os.admin.reprocess.handler(notImplemented("admin.reprocess")),
	retryJob: os.admin.retryJob.handler(notImplemented("admin.retryJob")),
});

import { notImplemented, os } from "../base.ts";

export const map = os.map.router({
	points: os.map.points.handler(notImplemented("map.points")),
});

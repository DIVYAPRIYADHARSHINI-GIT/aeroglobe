// Geodesy + unit helpers. Pure functions only so they are cheap to unit-test.

export const EARTH_RADIUS_KM = 6371;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const toRad = (deg: number) => deg * D2R;
export const toDeg = (rad: number) => rad * R2D;

/** Great-circle distance in km. */
export function haversineKm(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number
): number {
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing in degrees (0..360) from point 1 to point 2. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const p1 = toRad(lat1);
	const p2 = toRad(lat2);
	const dl = toRad(lon2 - lon1);
	const y = Math.sin(dl) * Math.cos(p2);
	const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
	return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Move from a point along a bearing by a distance in km. */
export function destinationPoint(
	lat: number,
	lon: number,
	bearing: number,
	distKm: number
): [number, number] {
	const d = distKm / EARTH_RADIUS_KM;
	const p1 = toRad(lat);
	const l1 = toRad(lon);
	const b = toRad(bearing);
	const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
	const l2 =
		l1 +
		Math.atan2(
			Math.sin(b) * Math.sin(d) * Math.cos(p1),
			Math.cos(d) - Math.sin(p1) * Math.sin(p2)
		);
	return [toDeg(p2), ((toDeg(l2) + 540) % 360) - 180];
}

/** Interpolate along the great circle between two points. f in 0..1. */
export function interpolateGreatCircle(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
	f: number
): [number, number] {
	const p1 = toRad(lat1);
	const l1 = toRad(lon1);
	const p2 = toRad(lat2);
	const l2 = toRad(lon2);
	const d =
		2 *
		Math.asin(
			Math.min(
				1,
				Math.sqrt(
					Math.sin((p2 - p1) / 2) ** 2 +
						Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2
				)
			)
		);
	if (d < 1e-9) return [lat1, lon1];
	const a = Math.sin((1 - f) * d) / Math.sin(d);
	const b = Math.sin(f * d) / Math.sin(d);
	const x = a * Math.cos(p1) * Math.cos(l1) + b * Math.cos(p2) * Math.cos(l2);
	const y = a * Math.cos(p1) * Math.sin(l1) + b * Math.cos(p2) * Math.sin(l2);
	const z = a * Math.sin(p1) + b * Math.sin(p2);
	return [toDeg(Math.atan2(z, Math.hypot(x, y))), toDeg(Math.atan2(y, x))];
}

/** Sample a great-circle path as [lat, lon] pairs, for dashed route lines. */
export function greatCirclePath(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
	steps = 64
): [number, number][] {
	const pts: [number, number][] = [];
	for (let i = 0; i <= steps; i++) pts.push(interpolateGreatCircle(lat1, lon1, lat2, lon2, i / steps));
	return pts;
}

// --- unit conversions -------------------------------------------------------

export const FT_PER_M = 3.280839895;
export const KT_TO_KMH = 1.852;

export const ftToM = (ft: number) => ft / FT_PER_M;
export const ktToKmh = (kt: number) => kt * KT_TO_KMH;
export const fpmToMs = (fpm: number) => fpm / FT_PER_M / 60;

/** 8-point compass label for a heading. */
export function compassLabel(heading: number): string {
	const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
	return dirs[Math.round((((heading % 360) + 360) % 360) / 45) % 8];
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Shortest signed angular difference b - a, in degrees (-180..180). */
export function angleDelta(a: number, b: number): number {
	return ((((b - a) % 360) + 540) % 360) - 180;
}

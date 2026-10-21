// Provider payload -> normalised Aircraft[].
//
// Two upstream shapes exist:
//  1. readsb / tar1090 JSON  (airplanes.live, adsb.lol, adsb.fi) - { ac | aircraft: [...] }
//  2. OpenSky  "states/all"  - { states: [ [...17 positional fields] ] }
//
// Both are reduced to the same Aircraft record so nothing downstream branches on provider.

import type { Aircraft, AircraftCategory } from '../types';

/** readsb emitter category (A0..C7) -> our coarse filter category. */
function categoryFromAdsb(cat: string | undefined, type: string | undefined): AircraftCategory {
	const c = (cat ?? '').toUpperCase();
	if (c === 'A7' || c === 'B6') return 'heli';
	if (c === 'A1' || c === 'B1' || c === 'B2' || c === 'B4') return 'light';
	if (c === 'A2' || c === 'A3' || c === 'A4' || c === 'A5') return 'airliner';
	const t = (type ?? '').toUpperCase();
	if (/^(EC|AS|R22|R44|R66|S76|H1|H2|B06|B47|EH1|UH|AH|CH)/.test(t)) return 'heli';
	if (/^(C1|C2|P2|P28|SR2|DA4|BE|PA)/.test(t)) return 'light';
	if (t) return 'airliner';
	return 'unknown';
}

/** Military traffic is only flagged when the feed explicitly says so. */
function isMilitary(ac: Record<string, unknown>): boolean {
	const dbf = ac.dbFlags;
	if (typeof dbf === 'number' && (dbf & 1) === 1) return true;
	return ac.type === 'adsb_icao_nt' && typeof ac.r === 'string' && /^\d{2}-\d{4}$/.test(ac.r);
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function normaliseReadsb(payload: unknown, now = Date.now()): Aircraft[] {
	const root = payload as { ac?: unknown[]; aircraft?: unknown[] } | null;
	const list = root?.ac ?? root?.aircraft;
	if (!Array.isArray(list)) return [];

	const out: Aircraft[] = [];
	for (const raw of list) {
		const ac = raw as Record<string, unknown>;
		const hex = typeof ac.hex === 'string' ? ac.hex.trim().toLowerCase().replace(/^~/, '') : '';
		const lat = num(ac.lat);
		const lon = num(ac.lon);
		if (!hex || lat === undefined || lon === undefined) continue;

		const onGround = ac.alt_baro === 'ground';
		const altFt = onGround ? 0 : (num(ac.alt_baro) ?? num(ac.alt_geom) ?? 0);
		const heading = num(ac.track) ?? num(ac.true_heading) ?? num(ac.mag_heading) ?? 0;
		const seenAgo = num(ac.seen_pos) ?? num(ac.seen) ?? 0;

		out.push({
			hex,
			callsign: (typeof ac.flight === 'string' ? ac.flight.trim() : '') || hex.toUpperCase(),
			lat,
			lon,
			altFt,
			gsKt: num(ac.gs) ?? 0,
			heading,
			vertRate: num(ac.baro_rate) ?? num(ac.geom_rate) ?? 0,
			onGround,
			squawk: typeof ac.squawk === 'string' ? ac.squawk : undefined,
			registration: typeof ac.r === 'string' ? ac.r.trim() || undefined : undefined,
			aircraftType:
				(typeof ac.desc === 'string' ? ac.desc : undefined) ??
				(typeof ac.t === 'string' ? ac.t.trim() || undefined : undefined),
			category: isMilitary(ac)
				? 'military'
				: categoryFromAdsb(ac.category as string, ac.t as string),
			seen: now - seenAgo * 1000
		});
	}
	return out;
}

/** OpenSky state vector field order, per their REST docs. */
export function normaliseOpenSky(payload: unknown, now = Date.now()): Aircraft[] {
	const states = (payload as { states?: unknown[][] } | null)?.states;
	if (!Array.isArray(states)) return [];

	const out: Aircraft[] = [];
	for (const s of states) {
		if (!Array.isArray(s)) continue;
		const hex = typeof s[0] === 'string' ? s[0].trim().toLowerCase() : '';
		const lon = num(s[5]);
		const lat = num(s[6]);
		if (!hex || lat === undefined || lon === undefined) continue;

		const onGround = s[8] === true;
		const altM = num(s[13]) ?? num(s[7]) ?? 0; // geo_altitude, else baro_altitude
		const velMs = num(s[9]) ?? 0;
		const vertMs = num(s[11]) ?? 0;
		const lastContact = num(s[4]) ?? num(s[3]);

		out.push({
			hex,
			callsign: (typeof s[1] === 'string' ? s[1].trim() : '') || hex.toUpperCase(),
			lat,
			lon,
			altFt: onGround ? 0 : Math.round(altM * 3.280839895),
			gsKt: Math.round(velMs * 1.943844),
			heading: num(s[10]) ?? 0,
			vertRate: Math.round(vertMs * 196.8503937), // m/s -> ft/min
			onGround,
			squawk: typeof s[14] === 'string' ? s[14] : undefined,
			category: 'unknown',
			seen: lastContact ? lastContact * 1000 : now
		});
	}
	return out;
}

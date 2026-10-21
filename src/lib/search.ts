// Instant search over live aircraft + the bundled airport list.
// Pure function so it can be unit-tested and called on every keystroke cheaply.

import type { LiveAircraft } from './state/traffic.svelte';
import { AIRPORTS, type Airport } from './data/airports';

export type SearchResult =
	| { kind: 'aircraft'; hex: string; title: string; subtitle: string; score: number }
	| { kind: 'airport'; airport: Airport; title: string; subtitle: string; score: number };

/**
 * Rank matches: exact code hits first, then prefix, then substring.
 * Searches callsign, ICAO24 hex, registration, aircraft type, airport code/city/name.
 */
export function search(query: string, aircraft: Iterable<LiveAircraft>, limit = 8): SearchResult[] {
	const q = query.trim().toLowerCase();
	if (q.length < 1) return [];
	const out: SearchResult[] = [];

	const rank = (haystack: string, weight: number): number => {
		const h = haystack.toLowerCase();
		if (!h) return 0;
		if (h === q) return 100 * weight;
		if (h.startsWith(q)) return 70 * weight;
		if (h.includes(q)) return 40 * weight;
		return 0;
	};

	for (const ac of aircraft) {
		const score = Math.max(
			rank(ac.callsign, 1),
			rank(ac.hex, 1),
			rank(ac.registration ?? '', 0.9),
			rank(ac.aircraftType ?? '', 0.6)
		);
		if (score > 0) {
			const bits = [ac.aircraftType, ac.registration, `${Math.round(ac.altFt).toLocaleString()} ft`].filter(
				Boolean
			);
			out.push({
				kind: 'aircraft',
				hex: ac.hex,
				title: ac.callsign,
				subtitle: bits.join(' \u00B7 '),
				score: score + 5 // live traffic outranks a static airport on an equal match
			});
		}
	}

	for (const ap of AIRPORTS) {
		const score = Math.max(
			rank(ap.iata, 1),
			rank(ap.icao, 0.95),
			rank(ap.city, 0.75),
			rank(ap.name, 0.6)
		);
		if (score > 0) {
			out.push({
				kind: 'airport',
				airport: ap,
				title: `${ap.iata} \u00B7 ${ap.city || ap.name}`,
				subtitle: `${ap.name} \u00B7 ${ap.country}`,
				score
			});
		}
	}

	out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
	return out.slice(0, limit);
}

/** Airports within a radius of a point, for "busiest airports nearby". */
export function airportsNear(lat: number, lon: number, maxKm: number, limit = 5): (Airport & { distKm: number })[] {
	const out: (Airport & { distKm: number })[] = [];
	for (const ap of AIRPORTS) {
		// Cheap equirectangular approximation; exact distance is not needed for a list.
		const dLat = (ap.lat - lat) * 111.32;
		const dLon = (ap.lon - lon) * 111.32 * Math.cos(((lat + ap.lat) / 2) * (Math.PI / 180));
		const distKm = Math.hypot(dLat, dLon);
		if (distKm <= maxKm) out.push({ ...ap, distKm });
	}
	out.sort((a, b) => a.distKm - b.distKm);
	return out.slice(0, limit);
}

// Provider registry + URL builders, shared by the browser client and the server proxy.
//
// API-citizen rules encoded here:
//  - every query is region-scoped (radius around the camera, or a bbox), never global
//  - radius is capped at 250 NM so a zoomed-out camera cannot ask for the whole planet
//  - airplanes.live is kept last of the readsb feeds: as of build time its public endpoint
//    answers with a "contact us" error, so the chain treats it as a best-effort extra.
//
// CORS note (measured, not assumed): none of these four endpoints currently return an
// `Access-Control-Allow-Origin` header, so a browser-direct fetch always fails the CORS
// preflight and only adds console noise plus a wasted round trip. Every source therefore
// sets `corsFriendly: false` and the chain goes straight to the proxy. The browser-direct
// branch in client.ts is retained, so flipping this flag back to true is all that is
// needed if a feed starts sending the header.

import type { BBox, ProviderId } from '../types';
import { clamp } from '../geo';

export interface Region {
	lat: number;
	lon: number;
	/** Query radius in nautical miles. */
	radiusNm: number;
}

export const MAX_RADIUS_NM = 250;
export const MIN_RADIUS_NM = 25;

export interface SourceDef {
	id: ProviderId;
	label: string;
	kind: 'readsb' | 'opensky';
	/** Attempt a direct browser fetch first? Only for feeds that send CORS headers. */
	corsFriendly: boolean;
	url(region: Region): string;
	/** Seconds the server proxy may cache a response for. */
	cacheSeconds: number;
}

export const SOURCES: SourceDef[] = [
	{
		id: 'adsb.lol',
		label: 'adsb.lol',
		kind: 'readsb',
		corsFriendly: false,
		cacheSeconds: 8,
		url: ({ lat, lon, radiusNm }) =>
			`https://api.adsb.lol/v2/point/${lat.toFixed(3)}/${lon.toFixed(3)}/${Math.round(radiusNm)}`
	},
	{
		id: 'adsb.fi',
		label: 'adsb.fi',
		kind: 'readsb',
		corsFriendly: false,
		cacheSeconds: 8,
		url: ({ lat, lon, radiusNm }) =>
			`https://opendata.adsb.fi/api/v2/lat/${lat.toFixed(3)}/lon/${lon.toFixed(3)}/dist/${Math.round(radiusNm)}`
	},
	{
		id: 'airplanes.live',
		label: 'airplanes.live',
		kind: 'readsb',
		corsFriendly: false,
		cacheSeconds: 8,
		url: ({ lat, lon, radiusNm }) =>
			`https://api.airplanes.live/v2/point/${lat.toFixed(3)}/${lon.toFixed(3)}/${Math.round(Math.min(radiusNm, 250))}`
	},
	{
		id: 'opensky',
		label: 'OpenSky Network',
		kind: 'opensky',
		// Anonymous OpenSky does not send Access-Control-Allow-Origin, so it is proxy-only.
		corsFriendly: false,
		cacheSeconds: 12,
		url: (region) => {
			const b = regionToBBox(region);
			return (
				`https://opensky-network.org/api/states/all` +
				`?lamin=${b.south.toFixed(3)}&lomin=${b.west.toFixed(3)}` +
				`&lamax=${b.north.toFixed(3)}&lomax=${b.east.toFixed(3)}`
			);
		}
	}
];

export const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]));

/** Order the chain is attempted in. Demo mode is the final, always-available fallback. */
export const PROVIDER_CHAIN: ProviderId[] = ['adsb.lol', 'adsb.fi', 'airplanes.live', 'opensky'];

export function normaliseRegion(region: Region): Region {
	return {
		lat: clamp(region.lat, -85, 85),
		lon: ((((region.lon + 180) % 360) + 360) % 360) - 180,
		radiusNm: clamp(Math.round(region.radiusNm), MIN_RADIUS_NM, MAX_RADIUS_NM)
	};
}

export function regionToBBox({ lat, lon, radiusNm }: Region): BBox {
	const degLat = (radiusNm * 1.852) / 111.32;
	const degLon = degLat / Math.max(0.15, Math.cos((lat * Math.PI) / 180));
	return {
		south: clamp(lat - degLat, -90, 90),
		north: clamp(lat + degLat, -90, 90),
		west: clamp(lon - degLon, -180, 180),
		east: clamp(lon + degLon, -180, 180)
	};
}

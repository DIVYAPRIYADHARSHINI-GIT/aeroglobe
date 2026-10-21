// Optional ADS-B proxy. Used only when a browser-direct fetch is blocked by CORS
// (always the case for anonymous OpenSky) or when the direct call failed.
//
// Good-API-citizen behaviour lives here:
//  - region-scoped upstream queries only, radius clamped to 250 NM
//  - short in-memory response cache keyed by provider + rounded region
//  - a 6 s upstream timeout so a hanging feed cannot hold a Vercel function open
//  - Cache-Control so Vercel's edge can also absorb repeat hits
//
// No API keys, no accounts: every upstream here is free anonymous open data.

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SOURCE_BY_ID, normaliseRegion } from '#lib/providers/sources';
import type { ProviderId } from '#lib/types';

const UPSTREAM_TIMEOUT_MS = 6000;

interface CacheEntry {
	expires: number;
	body: unknown;
}
const cache = new Map<string, CacheEntry>();

function sweep(now: number) {
	if (cache.size < 64) return;
	for (const [k, v] of cache) if (v.expires <= now) cache.delete(k);
}

export const GET: RequestHandler = async ({ url, fetch, setHeaders }) => {
	const providerId = (url.searchParams.get('provider') ?? '') as ProviderId;
	const source = SOURCE_BY_ID.get(providerId);
	if (!source) throw error(400, 'Unknown provider');

	const lat = Number(url.searchParams.get('lat'));
	const lon = Number(url.searchParams.get('lon'));
	const radiusNm = Number(url.searchParams.get('radius'));
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw error(400, 'lat/lon required');

	const region = normaliseRegion({ lat, lon, radiusNm: Number.isFinite(radiusNm) ? radiusNm : 150 });

	// Round the cache key so nearby cameras share one upstream call.
	const key = `${providerId}:${region.lat.toFixed(1)}:${region.lon.toFixed(1)}:${region.radiusNm}`;
	const now = Date.now();
	sweep(now);

	const hit = cache.get(key);
	if (hit && hit.expires > now) {
		setHeaders({ 'cache-control': `public, max-age=${source.cacheSeconds}`, 'x-aeroglobe-cache': 'hit' });
		return json(hit.body);
	}

	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
	try {
		const res = await fetch(source.url(region), {
			signal: ctrl.signal,
			headers: {
				accept: 'application/json',
				// Identify ourselves politely to the community feeds.
				'user-agent': 'AeroGlobe/1.0 (open-source 3D flight tracker demo)'
			}
		});
		if (!res.ok) throw error(res.status === 429 ? 429 : 502, `Upstream ${res.status}`);

		const body = await res.json();
		if (body && typeof body === 'object' && 'error' in body) throw error(502, 'Upstream error payload');

		cache.set(key, { body, expires: now + source.cacheSeconds * 1000 });
		setHeaders({ 'cache-control': `public, max-age=${source.cacheSeconds}`, 'x-aeroglobe-cache': 'miss' });
		return json(body);
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(504, 'Upstream timeout');
	} finally {
		clearTimeout(timer);
	}
};

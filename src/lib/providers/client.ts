// Provider fallback chain, browser side.
//
//   for each provider:  direct browser fetch (CORS) -> /api/adsb proxy -> next provider
//   all providers fail / 5 s budget exceeded       -> SIMULATED DEMO MODE
//
// Failures are silent by design; the UI only ever shows the resulting status chip.

import type { Aircraft, ProviderId, ProviderResult } from '../types';
import { normaliseOpenSky, normaliseReadsb } from './normalise';
import { demoAircraft } from './demo';
import { PROVIDER_CHAIN, SOURCE_BY_ID, normaliseRegion, type Region } from './sources';

/** Hard budget for the very first live attempt before demo mode takes over. */
export const FIRST_LOAD_BUDGET_MS = 5000;
const PER_REQUEST_TIMEOUT_MS = 4000;

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const json = await res.json();
		// Some community feeds answer 200 with an { error } body when rate-limited.
		if (json && typeof json === 'object' && 'error' in (json as object)) {
			throw new Error(String((json as { error: unknown }).error).slice(0, 80));
		}
		return json;
	} finally {
		clearTimeout(timer);
	}
}

function parse(providerId: ProviderId, payload: unknown): Aircraft[] {
	const src = SOURCE_BY_ID.get(providerId);
	if (!src) return [];
	return src.kind === 'opensky' ? normaliseOpenSky(payload) : normaliseReadsb(payload);
}

/**
 * Did this provider actually answer?
 *
 * A well-formed response with zero aircraft is a SUCCESS, not a failure: large parts of the
 * world (oceans, the Sahara, the poles) genuinely have no ADS-B coverage, and the default
 * camera can easily sit over one. Treating "empty" as failure used to walk the whole chain
 * and drop into demo mode even though the feeds were perfectly healthy, so this checks for
 * the expected response *shape* instead of a non-zero count.
 */
function isUsable(providerId: ProviderId, payload: unknown): boolean {
	if (!payload || typeof payload !== 'object') return false;
	const src = SOURCE_BY_ID.get(providerId);
	if (!src) return false;
	if (src.kind === 'opensky') {
		// OpenSky sends states: null when a bbox has no traffic.
		return 'states' in payload || 'time' in payload;
	}
	const root = payload as { ac?: unknown; aircraft?: unknown };
	return Array.isArray(root.ac) || Array.isArray(root.aircraft);
}

/**
 * Try one provider: browser-direct when the feed is CORS-friendly, then our proxy.
 * Returns null when this provider cannot answer right now.
 */
async function tryProvider(providerId: ProviderId, region: Region, deadline: number): Promise<ProviderResult | null> {
	const src = SOURCE_BY_ID.get(providerId);
	if (!src) return null;

	const budget = () => Math.min(PER_REQUEST_TIMEOUT_MS, Math.max(0, deadline - Date.now()));

	if (src.corsFriendly && budget() > 250) {
		try {
			const data = await fetchJson(src.url(region), budget());
			if (isUsable(providerId, data)) {
				return { provider: providerId, aircraft: parse(providerId, data), via: 'browser' };
			}
		} catch {
			/* fall through to the proxy */
		}
	}

	if (budget() > 250) {
		try {
			const qs = new URLSearchParams({
				provider: providerId,
				lat: region.lat.toFixed(3),
				lon: region.lon.toFixed(3),
				radius: String(Math.round(region.radiusNm))
			});
			const data = await fetchJson(`/api/adsb?${qs}`, budget());
			if (isUsable(providerId, data)) {
				return { provider: providerId, aircraft: parse(providerId, data), via: 'proxy' };
			}
		} catch {
			/* provider exhausted */
		}
	}

	return null;
}

export function demoResult(): ProviderResult {
	return { provider: 'demo', aircraft: demoAircraft(), via: 'simulated' };
}

export interface FetchOptions {
	/** Skip every live provider (user chose demo mode explicitly). */
	forceDemo?: boolean;
	/** Total time budget for this round of the chain. */
	budgetMs?: number;
	/** Start the chain at the provider that worked last time. */
	preferred?: ProviderId | null;
}

/** Run the whole chain once and always return something renderable. */
export async function fetchAircraft(region: Region, opts: FetchOptions = {}): Promise<ProviderResult> {
	if (opts.forceDemo) return demoResult();

	const r = normaliseRegion(region);
	const deadline = Date.now() + (opts.budgetMs ?? FIRST_LOAD_BUDGET_MS);

	const chain = [...PROVIDER_CHAIN];
	if (opts.preferred && opts.preferred !== 'demo') {
		const i = chain.indexOf(opts.preferred);
		if (i > 0) chain.splice(0, 0, ...chain.splice(i, 1));
	}

	for (const id of chain) {
		if (Date.now() >= deadline) break;
		const result = await tryProvider(id, r, deadline);
		if (result) return result;
	}

	return demoResult();
}

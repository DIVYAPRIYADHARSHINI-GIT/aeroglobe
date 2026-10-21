// Traffic store: polling, dead reckoning, trails and selection.
//
// Design notes:
//  - Reactive state is deliberately COARSE. Positions are dead-reckoned every animation
//    frame inside the Three.js renderer, not through Svelte reactivity, so a 400-aircraft
//    sky cannot trigger a reactive loop or freeze the page.
//  - `$state` here holds the slow-changing things the UI binds to (status, counts,
//    selection, the selected aircraft's own numbers, throttled to ~4 Hz).

import type { Aircraft, ProviderId, ProviderMode, TrackPoint } from '../types';
import { FIRST_LOAD_BUDGET_MS, fetchAircraft, demoResult } from '../providers/client';
import type { Region } from '../providers/sources';
import { angleDelta, destinationPoint } from '../geo';

const POLL_MS = 12_000;
const MAX_BACKOFF_MS = 120_000;
const STALE_MS = 90_000;
export const MAX_RENDERED = 400;
const TRAIL_POINTS = 24;
const SELECTED_TRAIL_POINTS = 240;

/** A live aircraft plus the client-side extrapolation state used between updates. */
export interface LiveAircraft extends Aircraft {
	/** Dead-reckoned display position, advanced every frame. */
	dLat: number;
	dLon: number;
	dAltFt: number;
	dHeading: number;
	/** Epoch ms the last fix was applied at (basis for dead reckoning). */
	fixAt: number;
	/** Recent positions for the fading trail. */
	trail: TrackPoint[];
}

export class TrafficStore {
	/** hex -> live aircraft. A plain Map: mutated per frame, never deep-reactive. */
	readonly byHex = new Map<string, LiveAircraft>();

	// --- reactive surface (coarse) ---
	mode = $state<ProviderMode>('connecting');
	provider = $state<ProviderId | null>(null);
	via = $state<'browser' | 'proxy' | 'simulated'>('simulated');
	count = $state(0);
	renderedCount = $state(0);
	lastUpdate = $state(0);
	selectedHex = $state<string | null>(null);
	/** Bumped whenever the selected aircraft's numbers change, so panels re-render. */
	selectionTick = $state(0);
	forceDemo = $state(false);
	errorStreak = $state(0);

	/** Altitude history for the selected aircraft's mini graph (this session only). */
	selectedHistory: TrackPoint[] = [];

	private region: Region = { lat: 20, lon: 10, radiusNm: 250 };
	private timer: ReturnType<typeof setTimeout> | null = null;
	private inFlight = false;
	private stopped = true;
	private lastSelectionPush = 0;

	setRegion(region: Region) {
		this.region = region;
	}

	getSelected(): LiveAircraft | null {
		return this.selectedHex ? (this.byHex.get(this.selectedHex) ?? null) : null;
	}

	select(hex: string | null) {
		if (hex === this.selectedHex) return;
		this.selectedHex = hex;
		this.selectedHistory = [];
		if (hex) {
			const ac = this.byHex.get(hex);
			if (ac) {
				// Seed the graph with the trail we already collected.
				this.selectedHistory = ac.trail.slice(-SELECTED_TRAIL_POINTS);
			}
		}
		this.selectionTick++;
	}

	start() {
		if (!this.stopped) return;
		this.stopped = false;
		void this.poll(true);
		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', this.onVisibility);
		}
	}

	stop() {
		this.stopped = true;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', this.onVisibility);
		}
	}

	/** Pause polling while the tab is hidden; resume immediately when it returns. */
	private onVisibility = () => {
		if (typeof document === 'undefined') return;
		if (document.hidden) {
			if (this.timer) clearTimeout(this.timer);
			this.timer = null;
		} else if (!this.stopped && !this.timer) {
			void this.poll(false);
		}
	};

	setForceDemo(on: boolean) {
		this.forceDemo = on;
		this.errorStreak = 0;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		if (!this.stopped) void this.poll(false);
	}

	/** Force one refresh now (used after a big camera move). */
	refreshSoon() {
		if (this.stopped || this.inFlight) return;
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => void this.poll(false), 400);
	}

	private schedule() {
		if (this.stopped) return;
		if (typeof document !== 'undefined' && document.hidden) return; // resumed by visibilitychange
		// Exponential backoff after consecutive failures, capped.
		const delay =
			this.errorStreak > 0
				? Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** Math.min(5, this.errorStreak))
				: POLL_MS + Math.random() * 3000; // jitter inside the 10-15 s window
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => void this.poll(false), delay);
	}

	private async poll(first: boolean) {
		if (this.stopped || this.inFlight) return;
		this.inFlight = true;
		try {
			const result = await fetchAircraft(this.region, {
				forceDemo: this.forceDemo,
				budgetMs: first ? FIRST_LOAD_BUDGET_MS : 9000,
				preferred: this.provider
			});

			if (result.provider === 'demo') {
				this.errorStreak = this.forceDemo ? 0 : Math.min(6, this.errorStreak + 1);
				this.mode = 'demo';
			} else {
				this.errorStreak = 0;
				this.mode = 'live';
			}
			this.provider = result.provider;
			this.via = result.via;
			this.apply(result.aircraft);
			this.lastUpdate = Date.now();
		} catch {
			// Never leave the user with an empty sky.
			this.errorStreak = Math.min(6, this.errorStreak + 1);
			this.mode = 'demo';
			const fallback = demoResult();
			this.provider = fallback.provider;
			this.via = fallback.via;
			this.apply(fallback.aircraft);
			this.lastUpdate = Date.now();
		} finally {
			this.inFlight = false;
			this.schedule();
		}
	}

	/** Merge a fresh fix set into the live map, keeping trails and dropping stale traffic. */
	private apply(list: Aircraft[]) {
		const now = Date.now();
		const seen = new Set<string>();

		for (const ac of list) {
			if (!Number.isFinite(ac.lat) || !Number.isFinite(ac.lon)) continue;
			seen.add(ac.hex);
			const prev = this.byHex.get(ac.hex);
			const point: TrackPoint = { t: now, lat: ac.lat, lon: ac.lon, altFt: ac.altFt, gsKt: ac.gsKt };

			if (prev) {
				Object.assign(prev, ac);
				prev.fixAt = now;
				// Snap the display position to the new fix; the renderer eases visually.
				prev.dLat = ac.lat;
				prev.dLon = ac.lon;
				prev.dAltFt = ac.altFt;
				prev.dHeading = ac.heading;
				prev.trail.push(point);
				const cap = ac.hex === this.selectedHex ? SELECTED_TRAIL_POINTS : TRAIL_POINTS;
				if (prev.trail.length > cap) prev.trail.splice(0, prev.trail.length - cap);
			} else {
				this.byHex.set(ac.hex, {
					...ac,
					dLat: ac.lat,
					dLon: ac.lon,
					dAltFt: ac.altFt,
					dHeading: ac.heading,
					fixAt: now,
					trail: [point]
				});
			}

			if (ac.hex === this.selectedHex) {
				this.selectedHistory.push(point);
				if (this.selectedHistory.length > SELECTED_TRAIL_POINTS) this.selectedHistory.shift();
			}
		}

		// Drop aircraft we have not heard from in a while.
		for (const [hex, ac] of this.byHex) {
			if (!seen.has(hex) && now - ac.fixAt > STALE_MS) this.byHex.delete(hex);
		}

		this.count = this.byHex.size;
		if (this.selectedHex && !this.byHex.has(this.selectedHex)) this.select(null);
		this.selectionTick++;
	}

	/**
	 * Advance every aircraft by dead reckoning. Called once per animation frame by the
	 * globe; deliberately allocation-free and outside Svelte reactivity.
	 */
	deadReckon(now: number) {
		for (const ac of this.byHex.values()) {
			const dt = (now - ac.fixAt) / 1000;
			if (dt <= 0 || dt > 180) continue;
			// Advance along the last known track at the last known ground speed.
			const distKm = (ac.gsKt * 1.852 * dt) / 3600;
			const [lat, lon] = destinationPoint(ac.lat, ac.lon, ac.heading, distKm);
			ac.dLat = lat;
			ac.dLon = lon;
			ac.dAltFt = Math.max(0, ac.altFt + (ac.vertRate * dt) / 60);
			// Ease the rendered heading toward the reported one so turns look smooth.
			ac.dHeading += angleDelta(ac.dHeading, ac.heading) * 0.12;
		}

		// Push selected-aircraft numbers to the UI at ~4 Hz, not every frame.
		if (this.selectedHex && now - this.lastSelectionPush > 250) {
			this.lastSelectionPush = now;
			this.selectionTick++;
		}
	}
}

export const traffic = new TrafficStore();

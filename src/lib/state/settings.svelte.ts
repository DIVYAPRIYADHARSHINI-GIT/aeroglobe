// Settings, filters and watchlist. Persisted to localStorage only - no accounts,
// no server, no tracking. Everything stays in the user's browser.

import type { AircraftCategory, Filters, UnitSystem } from '../types';

const KEY_SETTINGS = 'aeroglobe.settings.v1';
const KEY_WATCHLIST = 'aeroglobe.watchlist.v1';

export const DEFAULT_FILTERS: Filters = {
	altMinFt: 0,
	altMaxFt: 50000,
	speedMinKt: 0,
	speedMaxKt: 700,
	categories: { airliner: true, light: true, heli: true, military: true, unknown: true },
	airborneOnly: true,
	showTrails: true,
	showAirports: true
};

export class SettingsStore {
	units = $state<UnitSystem>('aviation');
	/** Panel theme. The globe always stays dark. */
	panelTheme = $state<'dark' | 'light'>('dark');
	filters = $state<Filters>({ ...DEFAULT_FILTERS, categories: { ...DEFAULT_FILTERS.categories } });
	watchlist = $state<string[]>([]);
	loaded = $state(false);

	load() {
		if (typeof localStorage === 'undefined' || this.loaded) return;
		try {
			const raw = localStorage.getItem(KEY_SETTINGS);
			if (raw) {
				const s = JSON.parse(raw) as Partial<{
					units: UnitSystem;
					panelTheme: 'dark' | 'light';
					filters: Partial<Filters>;
				}>;
				if (s.units === 'metric' || s.units === 'aviation') this.units = s.units;
				if (s.panelTheme === 'light' || s.panelTheme === 'dark') this.panelTheme = s.panelTheme;
				if (s.filters) {
					this.filters = {
						...DEFAULT_FILTERS,
						...s.filters,
						categories: { ...DEFAULT_FILTERS.categories, ...(s.filters.categories ?? {}) }
					};
				}
			}
			const w = localStorage.getItem(KEY_WATCHLIST);
			if (w) {
				const parsed = JSON.parse(w);
				if (Array.isArray(parsed)) this.watchlist = parsed.filter((x) => typeof x === 'string').slice(0, 50);
			}
		} catch {
			/* corrupt storage is not worth crashing over */
		}
		this.loaded = true;
	}

	private persist() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(
				KEY_SETTINGS,
				JSON.stringify({ units: this.units, panelTheme: this.panelTheme, filters: this.filters })
			);
		} catch {
			/* quota / private mode */
		}
	}

	private persistWatchlist() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(KEY_WATCHLIST, JSON.stringify(this.watchlist));
		} catch {
			/* ignore */
		}
	}

	setUnits(u: UnitSystem) {
		this.units = u;
		this.persist();
	}

	toggleUnits() {
		this.setUnits(this.units === 'aviation' ? 'metric' : 'aviation');
	}

	setPanelTheme(t: 'dark' | 'light') {
		this.panelTheme = t;
		this.persist();
	}

	togglePanelTheme() {
		this.setPanelTheme(this.panelTheme === 'dark' ? 'light' : 'dark');
	}

	updateFilters(patch: Partial<Filters>) {
		this.filters = { ...this.filters, ...patch };
		this.persist();
	}

	toggleCategory(cat: AircraftCategory) {
		this.filters = {
			...this.filters,
			categories: { ...this.filters.categories, [cat]: !this.filters.categories[cat] }
		};
		this.persist();
	}

	resetFilters() {
		this.filters = { ...DEFAULT_FILTERS, categories: { ...DEFAULT_FILTERS.categories } };
		this.persist();
	}

	isWatched(hex: string) {
		return this.watchlist.includes(hex);
	}

	toggleWatch(hex: string) {
		this.watchlist = this.isWatched(hex)
			? this.watchlist.filter((h) => h !== hex)
			: [...this.watchlist, hex].slice(-50);
		this.persistWatchlist();
	}
}

export const settings = new SettingsStore();

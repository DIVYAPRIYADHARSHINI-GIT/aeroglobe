<script lang="ts">
	// Collapsible left panel: altitude/speed ranges, categories, toggles, watchlist,
	// and the "busiest airports nearby" list.

	import Icon from './Icon.svelte';
	import { settings } from '#lib/state/settings.svelte';
	import { traffic } from '#lib/state/traffic.svelte';
	import { airportsNear } from '#lib/search';
	import { fmtInt } from '#lib/format';
	import type { AircraftCategory } from '#lib/types';
	import type { Airport } from '#lib/data/airports';

	interface Props {
		region: { lat: number; lon: number; radiusNm: number };
		planesInView: number;
		onFlyToAircraft: (hex: string) => void;
		onFlyToAirport: (airport: Airport) => void;
		onClose: () => void;
	}
	let { region, planesInView, onFlyToAircraft, onFlyToAirport, onClose }: Props = $props();

	const CATEGORIES: { id: AircraftCategory; label: string }[] = [
		{ id: 'airliner', label: 'Airliner' },
		{ id: 'light', label: 'Light' },
		{ id: 'heli', label: 'Helicopter' },
		{ id: 'military', label: 'Military' },
		{ id: 'unknown', label: 'Unknown' }
	];

	// Use a generous floor on the search radius. The data radius can be as small as 25 NM
	// when zoomed right in, and large parts of the world have no major airport inside a
	// few hundred km, which left this list permanently empty over e.g. central India.
	let nearby = $derived(
		airportsNear(region.lat, region.lon, Math.max(1200, region.radiusNm * 1.852), 5)
	);

	// Watchlist entries that are currently in the feed.
	let watched = $derived.by(() => {
		traffic.selectionTick;
		return settings.watchlist
			.map((hex) => ({ hex, ac: traffic.byHex.get(hex) }))
			.sort((a, b) => (a.ac ? 0 : 1) - (b.ac ? 0 : 1));
	});
</script>

<aside class="glass panel scroll-y" aria-label="Filters and watchlist">
	<header class="head">
		<h2><Icon name="filter" size={16} /> Filters</h2>
		<button class="icon-btn" onclick={onClose} aria-label="Close filters panel">
			<Icon name="chevron-left" size={18} />
		</button>
	</header>

	<!-- counters -->
	<div class="counters">
		<div class="counter">
			<span class="mono num">{fmtInt(planesInView)}</span>
			<span class="label">Planes in view</span>
		</div>
		<div class="counter">
			<span class="mono num">{fmtInt(traffic.count)}</span>
			<span class="label">Tracked total</span>
		</div>
	</div>

	<!-- altitude -->
	<section>
		<div class="row-label">
			<span class="label">Altitude</span>
			<span class="mono val">{fmtInt(settings.filters.altMinFt)}&ndash;{fmtInt(settings.filters.altMaxFt)} ft</span>
		</div>
		<label class="sr-only" for="alt-min">Minimum altitude</label>
		<input
			id="alt-min"
			type="range"
			min="0"
			max="50000"
			step="1000"
			value={settings.filters.altMinFt}
			oninput={(e) =>
				settings.updateFilters({
					altMinFt: Math.min(+e.currentTarget.value, settings.filters.altMaxFt - 1000)
				})}
		/>
		<label class="sr-only" for="alt-max">Maximum altitude</label>
		<input
			id="alt-max"
			type="range"
			min="0"
			max="50000"
			step="1000"
			value={settings.filters.altMaxFt}
			oninput={(e) =>
				settings.updateFilters({
					altMaxFt: Math.max(+e.currentTarget.value, settings.filters.altMinFt + 1000)
				})}
		/>
	</section>

	<!-- speed -->
	<section>
		<div class="row-label">
			<span class="label">Ground speed</span>
			<span class="mono val">{fmtInt(settings.filters.speedMinKt)}&ndash;{fmtInt(settings.filters.speedMaxKt)} kt</span>
		</div>
		<label class="sr-only" for="spd-min">Minimum speed</label>
		<input
			id="spd-min"
			type="range"
			min="0"
			max="700"
			step="10"
			value={settings.filters.speedMinKt}
			oninput={(e) =>
				settings.updateFilters({
					speedMinKt: Math.min(+e.currentTarget.value, settings.filters.speedMaxKt - 10)
				})}
		/>
		<label class="sr-only" for="spd-max">Maximum speed</label>
		<input
			id="spd-max"
			type="range"
			min="0"
			max="700"
			step="10"
			value={settings.filters.speedMaxKt}
			oninput={(e) =>
				settings.updateFilters({
					speedMaxKt: Math.max(+e.currentTarget.value, settings.filters.speedMinKt + 10)
				})}
		/>
	</section>

	<!-- categories -->
	<section>
		<span class="label">Category</span>
		<div class="cat-grid">
			{#each CATEGORIES as c}
				<button
					class="btn btn-sm cat"
					aria-pressed={settings.filters.categories[c.id]}
					onclick={() => settings.toggleCategory(c.id)}
				>
					{c.label}
				</button>
			{/each}
		</div>
	</section>

	<!-- toggles -->
	<section class="toggles">
		<label class="toggle">
			<input
				type="checkbox"
				checked={settings.filters.airborneOnly}
				onchange={(e) => settings.updateFilters({ airborneOnly: e.currentTarget.checked })}
			/>
			<span>Show airborne only</span>
		</label>
		<label class="toggle">
			<input
				type="checkbox"
				checked={settings.filters.showTrails}
				onchange={(e) => settings.updateFilters({ showTrails: e.currentTarget.checked })}
			/>
			<span>Show trails</span>
		</label>
		<label class="toggle">
			<input
				type="checkbox"
				checked={settings.filters.showAirports}
				onchange={(e) => settings.updateFilters({ showAirports: e.currentTarget.checked })}
			/>
			<span>Show airports</span>
		</label>
		<button class="btn btn-sm btn-ghost reset" onclick={() => settings.resetFilters()}>
			<Icon name="refresh" size={15} />
			Reset filters
		</button>
	</section>

	<!-- watchlist -->
	<section>
		<span class="label">Watchlist</span>
		{#if watched.length === 0}
			<p class="empty">Star a flight in its panel to pin it here. Saved in your browser only.</p>
		{:else}
			<ul class="list">
				{#each watched as w (w.hex)}
					<li>
						<button
							class="list-btn"
							disabled={!w.ac}
							onclick={() => onFlyToAircraft(w.hex)}
							title={w.ac ? 'Fly camera to this flight' : 'Not currently in the feed'}
						>
							<span class="mono list-title">{w.ac?.callsign ?? w.hex.toUpperCase()}</span>
							<span class="list-sub">
								{#if w.ac}{fmtInt(w.ac.dAltFt)} ft{:else}out of range{/if}
							</span>
						</button>
						<button
							class="icon-btn sm"
							onclick={() => settings.toggleWatch(w.hex)}
							aria-label="Remove {w.ac?.callsign ?? w.hex} from watchlist"
						>
							<Icon name="close" size={14} />
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- nearby airports -->
	<section>
		<span class="label">Busiest airports nearby</span>
		{#if nearby.length === 0}
			<p class="empty">No major airports inside the current view.</p>
		{:else}
			<ul class="list">
				{#each nearby as ap (ap.iata)}
					<li>
						<button class="list-btn" onclick={() => onFlyToAirport(ap)} title="Fly camera to {ap.name}">
							<span class="mono list-title">{ap.iata}</span>
							<span class="list-sub">{ap.city || ap.name} &middot; {fmtInt(ap.distKm)} km</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</aside>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 1.05rem;
		padding: 1rem;
		width: 100%;
		max-height: 100%;
		animation: fade-up 0.3s cubic-bezier(0.2, 0.7, 0.3, 1) both;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.head h2 {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.95rem;
	}
	.icon-btn {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: var(--r-sm);
		color: var(--panel-text-dim);
	}
	.icon-btn:hover {
		background: var(--panel-raise);
		color: var(--panel-text);
	}
	.icon-btn.sm {
		width: 28px;
		height: 28px;
	}

	.counters {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.counter {
		display: flex;
		flex-direction: column;
		padding: 0.55rem 0.65rem;
		border-radius: var(--r-md);
		background: var(--panel-raise);
		border: 1px solid var(--panel-border);
	}
	.num {
		font-size: 1.3rem;
		font-weight: 700;
		color: var(--cyan);
		line-height: 1.1;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.row-label {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}
	.val {
		font-size: 0.7rem;
		color: var(--panel-text-dim);
	}

	.cat-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.32rem;
	}
	.cat {
		min-height: 32px;
		font-size: 0.76rem;
	}

	.toggles {
		gap: 0.55rem;
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.83rem;
		color: var(--panel-text);
		cursor: pointer;
		min-height: 28px;
	}
	.toggle input {
		width: 18px;
		height: 18px;
		accent-color: var(--cyan);
		cursor: pointer;
	}
	.reset {
		align-self: flex-start;
		color: var(--panel-text-dim);
		margin-top: 0.1rem;
	}

	.empty {
		margin: 0;
		font-size: 0.76rem;
		color: var(--panel-text-dim);
		line-height: 1.55;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.22rem;
	}
	.list li {
		display: flex;
		align-items: center;
		gap: 0.2rem;
	}
	.list-btn {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.08rem;
		padding: 0.42rem 0.55rem;
		border-radius: var(--r-sm);
		text-align: left;
		min-height: 40px;
		transition: background 0.15s ease;
	}
	.list-btn:hover:not(:disabled) {
		background: rgba(56, 208, 255, 0.1);
	}
	.list-btn:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.list-title {
		font-size: 0.84rem;
		font-weight: 600;
		color: var(--panel-text);
	}
	.list-sub {
		font-size: 0.68rem;
		color: var(--panel-text-dim);
	}
</style>

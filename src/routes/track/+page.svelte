<script lang="ts">
	// /track - the 3D tracker shell.
	// Slim top bar, full-screen globe, collapsible left filters, right flight panel,
	// bottom-left legend. On mobile the flight panel becomes a bottom sheet and the
	// search collapses behind a floating button.

	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import GlobeCanvas from '#lib/components/GlobeCanvas.svelte';
	import FlightPanel from '#lib/components/FlightPanel.svelte';
	import FilterPanel from '#lib/components/FilterPanel.svelte';
	import SearchBox from '#lib/components/SearchBox.svelte';
	import StatusChip from '#lib/components/StatusChip.svelte';
	import AltitudeLegend from '#lib/components/AltitudeLegend.svelte';
	import LoadingOverlay from '#lib/components/LoadingOverlay.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { traffic } from '#lib/state/traffic.svelte';
	import { settings } from '#lib/state/settings.svelte';
	import type { Airport } from '#lib/data/airports';
	import type { CameraMode } from '#lib/three/globe';

	let globeRef: ReturnType<typeof GlobeCanvas> | undefined = $state();
	let filtersOpen = $state(false);
	let mobileSearchOpen = $state(false);
	let cameraMode = $state<CameraMode>('free');
	let fps = $state(60);
	let loading = $state(true);
	let selectedAirport = $state<Airport | null>(null);
	let region = $state({ lat: 22, lon: 78, radiusNm: 250 });
	let planesInView = $state(0);
	let deepLinkTarget: string | null = null;

	// The overlay hides as soon as the first data round lands (live or demo).
	$effect(() => {
		if (traffic.lastUpdate > 0) loading = false;
	});

	// Keep the region readout in sync for the "nearby airports" list.
	$effect(() => {
		traffic.selectionTick;
		planesInView = traffic.renderedCount || traffic.count;
	});

	function applyDeepLink() {
		// /track#CALLSIGN or /track#HEX, also used by /flight/[id].
		// Read from location directly: a hashchange does not update page.url immediately.
		const hash = typeof location !== 'undefined' ? location.hash : page.url.hash;
		const raw = decodeURIComponent((hash || '').replace(/^#/, '')).trim();
		if (!raw) return;
		deepLinkTarget = raw.toLowerCase();
		tryResolveDeepLink();
	}

	function tryResolveDeepLink() {
		if (!deepLinkTarget) return;
		for (const ac of traffic.byHex.values()) {
			if (ac.hex === deepLinkTarget || ac.callsign.trim().toLowerCase() === deepLinkTarget) {
				traffic.select(ac.hex);
				globeRef?.flyTo(ac.dLat, ac.dLon, 135);
				deepLinkTarget = null;
				return;
			}
		}
	}

	// Retry the deep link on each data round until the aircraft shows up.
	$effect(() => {
		traffic.lastUpdate;
		if (deepLinkTarget) tryResolveDeepLink();
	});

	onMount(() => {
		traffic.start();
		applyDeepLink();

		// A share link opened while already on /track only changes the hash, so the
		// component never remounts. Without this, deep links silently do nothing for
		// anyone who is already in the tracker.
		const onHashChange = () => applyDeepLink();
		window.addEventListener('hashchange', onHashChange);

		const onKey = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement | null)?.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA') return;
			// Keyboard-friendly globe controls.
			if (e.key === 'ArrowLeft') globeRef?.nudge(0, -6);
			else if (e.key === 'ArrowRight') globeRef?.nudge(0, 6);
			else if (e.key === 'ArrowUp') globeRef?.nudge(5, 0);
			else if (e.key === 'ArrowDown') globeRef?.nudge(-5, 0);
			else if (e.key === '+' || e.key === '=') globeRef?.nudge(0, 0, 0.82);
			else if (e.key === '-' || e.key === '_') globeRef?.nudge(0, 0, 1.22);
			else if (e.key === 'Escape') {
				if (cameraMode !== 'free') exitFollow();
				else traffic.select(null);
			} else if (e.key.toLowerCase() === 'f' && traffic.selectedHex) follow();
			else return;
			e.preventDefault();
		};
		window.addEventListener('keydown', onKey);

		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('hashchange', onHashChange);
			traffic.stop();
		};
	});

	function follow() {
		if (!traffic.selectedHex) return;
		cameraMode = 'follow';
		globeRef?.setCameraMode('follow', traffic.selectedHex);
	}
	function exitFollow() {
		cameraMode = 'free';
		globeRef?.setCameraMode('free');
	}
	function toggleCockpit() {
		if (!traffic.selectedHex) return;
		cameraMode = cameraMode === 'cockpit' ? 'follow' : 'cockpit';
		globeRef?.setCameraMode(cameraMode, traffic.selectedHex);
	}

	function flyToAircraft(hex: string) {
		const ac = traffic.byHex.get(hex);
		traffic.select(hex);
		selectedAirport = null;
		if (ac) globeRef?.flyTo(ac.dLat, ac.dLon, 140);
		cameraMode = 'free';
	}

	function flyToAirport(ap: Airport) {
		selectedAirport = ap;
		globeRef?.flyTo(ap.lat, ap.lon, 150);
		cameraMode = 'free';
		// Ask for traffic around the new centre right away.
		traffic.setRegion({ lat: ap.lat, lon: ap.lon, radiusNm: 180 });
		traffic.refreshSoon();
	}

	function onRegionReport(lat: number, lon: number, radiusNm: number) {
		region = { lat, lon, radiusNm };
	}
</script>

<svelte:head>
	<title>Tracker - AeroGlobe</title>
	<meta name="description" content="Live 3D flight tracker. Drag the globe, click a plane, follow it." />
</svelte:head>

<div class="shell">
	<!-- TOP BAR ---------------------------------------------------------- -->
	<header class="glass topbar">
		<a class="brand" href="/" aria-label="AeroGlobe home">
			<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
				<circle cx="16" cy="16" r="13" fill="none" stroke="#38D0FF" stroke-width="1.4" opacity="0.8" />
				<ellipse cx="16" cy="16" rx="13" ry="5.4" fill="none" stroke="#38D0FF" stroke-width="1" opacity="0.45" />
				<path d="M15.4 8.6l1.1 4.6 5.6 1.7-5.6 1.8-1.1 4.6-1.1-4.6-5.6-1.8 5.6-1.7z" fill="#FFB020" />
			</svg>
			<span class="brand-text">Aero<span class="accent">Globe</span></span>
		</a>

		<div class="searchbar">
			<SearchBox onPickAircraft={flyToAircraft} onPickAirport={flyToAirport} />
		</div>

		<div class="bar-actions">
			<StatusChip />

			<button
				class="btn btn-sm icon-only filters-btn"
				onclick={() => (filtersOpen = !filtersOpen)}
				aria-pressed={filtersOpen}
				aria-label="Toggle filters panel"
				title="Filters"
			>
				<Icon name="filter" size={17} />
			</button>

			<button
				class="btn btn-sm unit-btn"
				onclick={() => settings.toggleUnits()}
				aria-label="Switch units, currently {settings.units}"
				title="Unit system"
			>
				<span class="mono">{settings.units === 'aviation' ? 'ft/kt' : 'm/kmh'}</span>
			</button>

			<button
				class="btn btn-sm icon-only"
				onclick={() => settings.togglePanelTheme()}
				aria-label="Toggle light or dark panels"
				title="Panel theme"
			>
				<Icon name={settings.panelTheme === 'dark' ? 'sun' : 'moon'} size={17} />
			</button>
		</div>
	</header>

	<!-- GLOBE ------------------------------------------------------------ -->
	<div class="stage">
		<GlobeCanvas
			bind:this={globeRef}
			onSelectAircraft={(hex) => {
				selectedAirport = null;
				if (hex && cameraMode !== 'free') {
					globeRef?.setCameraMode(cameraMode, hex);
				}
			}}
			onSelectAirport={(ap) => (selectedAirport = ap)}
			onFps={(v) => (fps = v)}
			onReady={(g) => onRegionReport(...([g.getRegion().lat, g.getRegion().lon, g.getRegion().radiusNm] as const))}
		/>

		<!-- HUD corner brackets (decorative) -->
		<div class="hud" aria-hidden="true">
			<span class="bracket tl"></span>
			<span class="bracket tr"></span>
			<span class="bracket bl"></span>
			<span class="bracket br"></span>
		</div>

		<LoadingOverlay visible={loading} />

		<!-- left filter panel -->
		{#if filtersOpen}
			<div class="left-dock">
				<FilterPanel
					{region}
					{planesInView}
					onFlyToAircraft={flyToAircraft}
					onFlyToAirport={flyToAirport}
					onClose={() => (filtersOpen = false)}
				/>
			</div>
		{/if}

		<!-- right flight panel / mobile bottom sheet -->
		{#if traffic.selectedHex}
			<div class="right-dock">
				<FlightPanel
					{cameraMode}
					onFollow={follow}
					onExitFollow={exitFollow}
					onCockpit={toggleCockpit}
					onClose={() => {
						traffic.select(null);
						exitFollow();
					}}
				/>
			</div>
		{:else if selectedAirport}
			<div class="right-dock">
				<aside class="glass airport-card" aria-label="Airport information">
					<header>
						<span class="label">Airport</span>
						<button class="icon-btn" onclick={() => (selectedAirport = null)} aria-label="Close airport card">
							<Icon name="close" size={17} />
						</button>
					</header>
					<h2 class="mono">{selectedAirport.iata}</h2>
					<p class="ap-name">{selectedAirport.name}</p>
					<dl>
						<div><dt>City</dt><dd>{selectedAirport.city || '\u2014'}</dd></div>
						<div><dt>Country</dt><dd>{selectedAirport.country}</dd></div>
						<div><dt>ICAO</dt><dd class="mono">{selectedAirport.icao || '\u2014'}</dd></div>
						<div>
							<dt>Position</dt>
							<dd class="mono">{selectedAirport.lat.toFixed(2)}, {selectedAirport.lon.toFixed(2)}</dd>
						</div>
					</dl>
					<button class="btn btn-sm" onclick={() => selectedAirport && flyToAirport(selectedAirport)}>
						<Icon name="target" size={15} />
						Centre camera here
					</button>
				</aside>
			</div>
		{/if}

		<!-- bottom-left legend -->
		<div class="legend-dock">
			<AltitudeLegend {fps} />
		</div>

		<!-- demo-mode notice + switch -->
		{#if traffic.mode === 'demo' && !loading}
			<div class="glass demo-banner" role="status">
				<Icon name="warning" size={16} />
				<div>
					<strong>Simulated data</strong>
					<span>
						{traffic.forceDemo
							? 'Demo mode is on. These aircraft are generated, not real traffic.'
							: 'Live providers are unreachable right now. Showing a simulated sky.'}
					</span>
				</div>
				{#if traffic.forceDemo}
					<button class="btn btn-sm" onclick={() => traffic.setForceDemo(false)}>Try live data</button>
				{:else}
					<button class="btn btn-sm" onclick={() => traffic.setForceDemo(true)}>Stay in demo mode</button>
				{/if}
			</div>
		{/if}

		<!-- mobile floating search -->
		<button
			class="btn btn-primary fab-search"
			onclick={() => (mobileSearchOpen = !mobileSearchOpen)}
			aria-label="Search flights and airports"
			aria-expanded={mobileSearchOpen}
		>
			<Icon name="search" size={19} />
		</button>

		{#if mobileSearchOpen}
			<div class="mobile-search">
				<SearchBox
					autofocus
					onPickAircraft={(hex) => {
						flyToAircraft(hex);
						mobileSearchOpen = false;
					}}
					onPickAirport={(ap) => {
						flyToAirport(ap);
						mobileSearchOpen = false;
					}}
				/>
			</div>
		{/if}
	</div>
</div>

<style>
	.shell {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* --- top bar --- */
	.topbar {
		position: relative;
		z-index: 30;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0;
		border-left: none;
		border-right: none;
		border-top: none;
		flex-shrink: 0;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		color: var(--panel-text);
		flex-shrink: 0;
	}
	.brand:hover {
		text-decoration: none;
	}
	.brand-text {
		font-family: var(--font-head);
		font-weight: 700;
		font-size: 0.98rem;
	}
	.accent {
		color: var(--cyan);
	}

	.searchbar {
		flex: 1;
		max-width: 26rem;
	}

	.bar-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-left: auto;
		flex-shrink: 0;
	}
	.icon-only {
		width: 40px;
		padding: 0;
		min-height: 40px;
	}
	.unit-btn {
		min-height: 40px;
		font-size: 0.72rem;
	}

	/* --- stage --- */
	.stage {
		position: relative;
		flex: 1;
		min-height: 0;
	}

	.hud {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 5;
		background-image:
			linear-gradient(rgba(56, 208, 255, 0.045) 1px, transparent 1px),
			linear-gradient(90deg, rgba(56, 208, 255, 0.045) 1px, transparent 1px);
		background-size: 68px 68px;
	}
	.bracket {
		position: absolute;
		width: 26px;
		height: 26px;
		border: 2px solid rgba(56, 208, 255, 0.4);
	}
	.bracket.tl {
		top: 14px;
		left: 14px;
		border-right: none;
		border-bottom: none;
	}
	.bracket.tr {
		top: 14px;
		right: 14px;
		border-left: none;
		border-bottom: none;
	}
	.bracket.bl {
		bottom: 14px;
		left: 14px;
		border-right: none;
		border-top: none;
	}
	.bracket.br {
		bottom: 14px;
		right: 14px;
		border-left: none;
		border-top: none;
	}

	.left-dock {
		position: absolute;
		top: 1rem;
		left: 1rem;
		bottom: 7.5rem;
		width: 18rem;
		max-width: calc(100vw - 2rem);
		z-index: 20;
		display: flex;
	}

	.right-dock {
		position: absolute;
		top: 1rem;
		right: 1rem;
		bottom: 1rem;
		width: 21rem;
		max-width: calc(100vw - 2rem);
		z-index: 20;
		display: flex;
		pointer-events: auto;
	}

	.legend-dock {
		position: absolute;
		left: 1rem;
		bottom: 1rem;
		z-index: 15;
	}

	.demo-banner {
		position: absolute;
		bottom: 1rem;
		/* Centred in the gap between the legend (left) and the flight panel (right).
		   Plain offsets rather than :has(), so the position is predictable. */
		left: 13rem;
		right: 23rem;
		margin: 0 auto;
		width: fit-content;
		z-index: 25;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.7rem 0.9rem;
		border-radius: var(--r-md);
		max-width: 34rem;
		color: var(--amber);
		border-color: rgba(255, 176, 32, 0.35);
		animation: fade-up 0.4s ease both;
	}
	.demo-banner div {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.demo-banner strong {
		font-size: 0.8rem;
		font-family: var(--font-head);
	}
	.demo-banner span {
		font-size: 0.72rem;
		color: var(--panel-text-dim);
		line-height: 1.45;
	}
	.demo-banner .btn {
		flex-shrink: 0;
		color: var(--panel-text);
	}

	/* --- airport card --- */
	.airport-card {
		padding: 1rem;
		height: fit-content;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		animation: fade-up 0.3s ease both;
	}
	.airport-card header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.airport-card h2 {
		font-size: 1.7rem;
		font-weight: 700;
		color: var(--cyan);
		line-height: 1;
	}
	.ap-name {
		margin: 0;
		font-size: 0.85rem;
		color: var(--panel-text);
	}
	.airport-card dl {
		margin: 0.3rem 0 0.5rem;
		display: flex;
		flex-direction: column;
	}
	.airport-card dl > div {
		display: flex;
		justify-content: space-between;
		gap: 0.6rem;
		padding: 0.25rem 0;
		font-size: 0.78rem;
		border-bottom: 1px solid var(--panel-border);
	}
	.airport-card dt {
		color: var(--panel-text-dim);
	}
	.airport-card dd {
		margin: 0;
		text-align: right;
	}
	.icon-btn {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: var(--r-sm);
		color: var(--panel-text-dim);
	}
	.icon-btn:hover {
		background: var(--panel-raise);
		color: var(--panel-text);
	}

	/* --- mobile --- */
	.fab-search {
		display: none;
		position: absolute;
		right: 1rem;
		bottom: 1rem;
		z-index: 28;
		width: 52px;
		height: 52px;
		min-height: 52px;
		padding: 0;
		border-radius: 50%;
	}
	.mobile-search {
		display: none;
		position: absolute;
		top: 0.6rem;
		left: 0.6rem;
		right: 0.6rem;
		z-index: 35;
	}

	@media (max-width: 860px) {
		.searchbar {
			display: none;
		}
		.fab-search {
			display: grid;
			place-items: center;
		}
		.mobile-search {
			display: block;
		}

		/* flight panel becomes a bottom sheet */
		.right-dock {
			top: auto;
			left: 0;
			right: 0;
			bottom: 0;
			width: auto;
			max-width: none;
			max-height: 68dvh;
		}
		.right-dock :global(.panel),
		.right-dock :global(.airport-card) {
			border-radius: var(--r-lg) var(--r-lg) 0 0;
			border-bottom: none;
			padding-bottom: calc(1rem + env(safe-area-inset-bottom));
		}

		.left-dock {
			top: 0.6rem;
			bottom: 0.6rem;
			width: calc(100vw - 1.2rem);
			z-index: 26;
		}

		.legend-dock {
			bottom: 4.6rem;
			left: 0.6rem;
			transform: scale(0.92);
			transform-origin: bottom left;
		}
		.demo-banner {
			bottom: auto;
			top: 4.2rem;
			left: 0.6rem;
			right: 0.6rem;
			max-width: none;
			width: auto;
			flex-wrap: wrap;
		}
		.brand-text {
			display: none;
		}
	}

	@media (max-width: 420px) {
		.unit-btn {
			display: none;
		}
	}
</style>

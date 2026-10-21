<script lang="ts">
	// Boarding-pass style flight panel: right side on desktop, bottom sheet on mobile.

	import Icon from './Icon.svelte';
	import CompassDial from './CompassDial.svelte';
	import AltitudeGraph from './AltitudeGraph.svelte';
	import { traffic, type LiveAircraft } from '#lib/state/traffic.svelte';
	import { settings } from '#lib/state/settings.svelte';
	import { AIRPORT_BY_IATA } from '#lib/data/airports';
	import {
		flightPhase,
		fmtAgo,
		fmtAltitude,
		fmtAltitudeBoth,
		fmtCoord,
		fmtHeading,
		fmtSpeed,
		fmtSpeedBoth,
		fmtVerticalRate
	} from '#lib/format';
	import { compassLabel, haversineKm } from '#lib/geo';
	import { altitudeTextCss } from '#lib/three/helpers';

	interface Props {
		onFollow: () => void;
		onExitFollow: () => void;
		onCockpit: () => void;
		onClose: () => void;
		cameraMode: 'free' | 'follow' | 'cockpit';
	}
	let { onFollow, onExitFollow, onCockpit, onClose, cameraMode }: Props = $props();

	// Re-read the aircraft whenever the traffic store ticks (throttled to ~4 Hz).
	let ac = $derived.by<LiveAircraft | null>(() => {
		traffic.selectionTick;
		return traffic.getSelected();
	});

	let origin = $derived(ac?.origin ? AIRPORT_BY_IATA.get(ac.origin) : undefined);
	let destination = $derived(ac?.destination ? AIRPORT_BY_IATA.get(ac.destination) : undefined);

	// Route progress: use the simulated value when present, else derive it from distance flown.
	let progress = $derived.by(() => {
		if (!ac) return null;
		if (typeof ac.progress === 'number') return Math.min(1, Math.max(0, ac.progress));
		if (!origin || !destination) return null;
		const total = haversineKm(origin.lat, origin.lon, destination.lat, destination.lon);
		if (total < 1) return null;
		const done = haversineKm(origin.lat, origin.lon, ac.dLat, ac.dLon);
		return Math.min(1, Math.max(0, done / total));
	});

	let remainingKm = $derived.by(() => {
		if (!ac || !destination) return null;
		return haversineKm(ac.dLat, ac.dLon, destination.lat, destination.lon);
	});

	let etaMin = $derived.by(() => {
		if (remainingKm === null || !ac || ac.gsKt < 40) return null;
		return Math.round((remainingKm / (ac.gsKt * 1.852)) * 60);
	});

	let shareState = $state<'idle' | 'copied' | 'failed'>('idle');

	async function share() {
		if (!ac) return;
		const url = `${location.origin}/track#${ac.callsign.trim() || ac.hex}`;
		try {
			await navigator.clipboard.writeText(url);
			shareState = 'copied';
		} catch {
			// Clipboard API needs a secure context / permission; fall back to a prompt.
			shareState = 'failed';
		}
		setTimeout(() => (shareState = 'idle'), 2200);
	}

	let altUnits = $derived(ac ? fmtAltitude(ac.dAltFt, settings.units) : null);
	let spdUnits = $derived(ac ? fmtSpeed(ac.gsKt, settings.units) : null);
	let vsUnits = $derived(ac ? fmtVerticalRate(ac.vertRate, settings.units) : null);
</script>

{#if ac}
	<aside class="glass panel" aria-label="Selected flight details">
		<!-- boarding-pass header -->
		<header class="pass-head" style="--alt-color:{altitudeTextCss(ac.dAltFt, settings.panelTheme)}">
			<div class="pass-head-top">
				<div>
					<span class="label">Callsign</span>
					<h2 class="mono callsign">{ac.callsign}</h2>
				</div>
				<div class="head-actions">
					<button
						class="icon-btn"
						onclick={() => settings.toggleWatch(ac.hex)}
						aria-pressed={settings.isWatched(ac.hex)}
						aria-label={settings.isWatched(ac.hex) ? 'Remove from watchlist' : 'Add to watchlist'}
						title={settings.isWatched(ac.hex) ? 'Remove from watchlist' : 'Add to watchlist'}
					>
						<Icon name={settings.isWatched(ac.hex) ? 'star-filled' : 'star'} size={18} />
					</button>
					<button class="icon-btn" onclick={onClose} aria-label="Close flight panel" title="Close">
						<Icon name="close" size={18} />
					</button>
				</div>
			</div>

			<p class="phase">
				<span class="phase-dot" aria-hidden="true"></span>
				{flightPhase(ac.dAltFt, ac.vertRate, ac.onGround)}
				{#if traffic.mode === 'demo'}<span class="sim-tag">Simulated</span>{/if}
			</p>
		</header>

		<!-- route strip -->
		<div class="route">
			<div class="endpoint">
				<span class="mono code">{ac.origin ?? '???'}</span>
				<span class="city">{origin?.city || origin?.name || 'Unknown origin'}</span>
			</div>
			<div class="route-line" aria-hidden="true">
				<svg viewBox="0 0 120 28" preserveAspectRatio="none">
					<line x1="4" y1="14" x2="116" y2="14" stroke="var(--panel-border)" stroke-width="2" stroke-dasharray="4 4" />
					{#if progress !== null}
						<line x1="4" y1="14" x2={4 + progress * 112} y2="14" stroke="var(--cyan)" stroke-width="2.4" />
						<g transform="translate({4 + progress * 112}, 14)">
							<path
								d="M-5.5 0 L4 -3.4 L4 -1.2 L8.5 0 L4 1.2 L4 3.4 Z"
								fill="var(--amber)"
								transform="rotate(0)"
							/>
						</g>
					{/if}
				</svg>
			</div>
			<div class="endpoint right">
				<span class="mono code">{ac.destination ?? '???'}</span>
				<span class="city">{destination?.city || destination?.name || 'Unknown destination'}</span>
			</div>
		</div>

		{#if progress !== null || etaMin !== null}
			<p class="route-meta mono">
				{#if progress !== null}{Math.round(progress * 100)}% complete{/if}
				{#if etaMin !== null}&nbsp;&middot;&nbsp;{etaMin} min remaining{/if}
			</p>
		{:else}
			<p class="route-meta dim">
				Route not published by this feed &mdash; community ADS-B gives position, not schedule.
			</p>
		{/if}

		<!-- camera controls -->
		<div class="cam-row">
			{#if cameraMode === 'free'}
				<button class="btn btn-amber btn-sm grow" onclick={onFollow}>
					<Icon name="target" size={16} />
					Follow
				</button>
			{:else}
				<button class="btn btn-sm grow" onclick={onExitFollow}>
					<Icon name="exit" size={16} />
					Exit follow
				</button>
			{/if}
			<button
				class="btn btn-sm"
				onclick={onCockpit}
				aria-pressed={cameraMode === 'cockpit'}
				title="Forward view from the aircraft"
			>
				<Icon name="cockpit" size={16} />
				Cockpit
			</button>
			<button class="btn btn-sm" onclick={share} title="Copy a link to this flight">
				<Icon name="share" size={16} />
				{shareState === 'copied' ? 'Copied' : shareState === 'failed' ? 'Copy failed' : 'Share'}
			</button>
		</div>
		{#if shareState === 'failed'}
			<p class="share-fallback mono">{`${location.origin}/track#${ac.callsign.trim() || ac.hex}`}</p>
		{/if}

		<!-- live tiles -->
		<div class="tiles">
			<div class="tile">
				<span class="label">Altitude</span>
				<strong class="mono" style="color:{altitudeTextCss(ac.dAltFt, settings.panelTheme)}">
					{altUnits?.value}<small>{altUnits?.unit}</small>
				</strong>
				<span class="tile-sub mono">{fmtAltitudeBoth(ac.dAltFt)}</span>
			</div>

			<div class="tile">
				<span class="label">Ground speed</span>
				<strong class="mono">{spdUnits?.value}<small>{spdUnits?.unit}</small></strong>
				<span class="tile-sub mono">{fmtSpeedBoth(ac.gsKt)}</span>
			</div>

			<div class="tile">
				<span class="label">Vertical rate</span>
				<strong class="mono vs" class:up={ac.vertRate > 100} class:down={ac.vertRate < -100}>
					{#if ac.vertRate > 100}
						<Icon name="arrow-up" size={15} />
					{:else if ac.vertRate < -100}
						<Icon name="arrow-down" size={15} />
					{/if}
					{vsUnits?.value}<small>{vsUnits?.unit}</small>
				</strong>
				<span class="tile-sub mono">{flightPhase(ac.dAltFt, ac.vertRate, ac.onGround)}</span>
			</div>

			<div class="tile tile-compass">
				<span class="label">Heading</span>
				<div class="compass-row">
					<CompassDial heading={ac.dHeading} size={74} />
					<div>
						<strong class="mono">{fmtHeading(ac.dHeading)}</strong>
						<span class="tile-sub mono">{compassLabel(ac.dHeading)}</span>
					</div>
				</div>
			</div>
		</div>

		<!-- altitude graph -->
		<section class="graph-sec">
			<span class="label">Altitude &mdash; this session</span>
			<AltitudeGraph points={traffic.selectedHistory} />
		</section>

		<!-- identity table -->
		<dl class="ident">
			<div><dt>Aircraft</dt><dd class="mono">{ac.aircraftType ?? 'Unknown'}</dd></div>
			<div><dt>Registration</dt><dd class="mono">{ac.registration ?? '\u2014'}</dd></div>
			<div><dt>ICAO24 hex</dt><dd class="mono">{ac.hex.toUpperCase()}</dd></div>
			<div><dt>Squawk</dt><dd class="mono">{ac.squawk ?? '\u2014'}</dd></div>
			<div><dt>Category</dt><dd class="mono cap">{ac.category}</dd></div>
			<div><dt>Position</dt><dd class="mono">{fmtCoord(ac.dLat, ac.dLon)}</dd></div>
			<div><dt>Last fix</dt><dd class="mono">{fmtAgo(ac.fixAt)}</dd></div>
		</dl>
	</aside>
{/if}

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 0.95rem;
		padding: 1.05rem;
		width: 100%;
		max-height: 100%;
		overflow-y: auto;
		scrollbar-width: thin;
		animation: fade-up 0.3s cubic-bezier(0.2, 0.7, 0.3, 1) both;
	}

	.pass-head {
		border-bottom: 1px dashed var(--panel-border);
		padding-bottom: 0.8rem;
	}
	.pass-head-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.callsign {
		font-size: 1.6rem;
		font-weight: 700;
		letter-spacing: 0.01em;
		line-height: 1.1;
		margin-top: 0.12rem;
		color: var(--alt-color, var(--panel-text));
	}
	.head-actions {
		display: flex;
		gap: 0.2rem;
	}
	.icon-btn {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: var(--r-sm);
		color: var(--panel-text-dim);
		transition: background 0.15s ease;
	}
	.icon-btn:hover {
		background: var(--panel-raise);
		color: var(--panel-text);
	}
	.icon-btn[aria-pressed='true'] {
		color: var(--amber);
	}

	.phase {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin: 0.5rem 0 0;
		font-size: 0.8rem;
		color: var(--panel-text-dim);
	}
	.phase-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--cyan);
		box-shadow: 0 0 7px var(--cyan);
		animation: pulse-dot 2s ease-in-out infinite;
	}
	.sim-tag {
		margin-left: 0.2rem;
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
		background: rgba(255, 176, 32, 0.16);
		border: 1px solid rgba(255, 176, 32, 0.4);
		color: var(--amber);
		font-size: 0.64rem;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.route {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.6rem;
	}
	.endpoint {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.endpoint.right {
		text-align: right;
		align-items: flex-end;
	}
	.code {
		font-size: 1.22rem;
		font-weight: 700;
		color: var(--panel-text);
	}
	.city {
		font-size: 0.7rem;
		color: var(--panel-text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 8.5rem;
	}
	.route-line svg {
		width: 100%;
		height: 28px;
		display: block;
	}
	.route-meta {
		margin: -0.5rem 0 0;
		font-size: 0.71rem;
		color: var(--panel-text-dim);
		text-align: center;
	}
	.route-meta.dim {
		font-family: var(--font-body);
		opacity: 0.8;
		line-height: 1.5;
	}

	.cam-row {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.grow {
		flex: 1 1 7rem;
	}
	.share-fallback {
		margin: -0.6rem 0 0;
		font-size: 0.68rem;
		color: var(--panel-text-dim);
		word-break: break-all;
	}

	.tiles {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.55rem;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.6rem 0.7rem;
		border-radius: var(--r-md);
		background: var(--panel-raise);
		border: 1px solid var(--panel-border);
	}
	.tile strong {
		font-size: 1.22rem;
		font-weight: 700;
		line-height: 1.15;
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}
	.tile strong small {
		font-size: 0.62rem;
		font-weight: 500;
		opacity: 0.65;
		margin-left: 0.15rem;
	}
	.tile-sub {
		font-size: 0.63rem;
		color: var(--panel-text-dim);
	}
	.vs.up {
		color: var(--ok);
	}
	.vs.down {
		color: var(--amber);
	}
	.tile-compass {
		grid-column: 1 / -1;
	}
	.compass-row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
	}

	.graph-sec {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.ident {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		border-top: 1px dashed var(--panel-border);
		padding-top: 0.75rem;
	}
	.ident > div {
		display: flex;
		justify-content: space-between;
		gap: 0.7rem;
		padding: 0.26rem 0;
		font-size: 0.78rem;
	}
	.ident dt {
		color: var(--panel-text-dim);
	}
	.ident dd {
		margin: 0;
		text-align: right;
		color: var(--panel-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 60%;
	}
	.cap {
		text-transform: capitalize;
	}
</style>

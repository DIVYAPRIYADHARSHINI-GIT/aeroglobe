<script lang="ts">
	// Svelte wrapper around the AeroGlobe Three.js engine.
	// Owns the canvas element, the WebGL capability check, and the frame-driven
	// dead reckoning tick. All heavy work stays inside the engine.

	import { onMount } from 'svelte';
	import { AeroGlobe, type CameraMode } from '#lib/three/globe';
	import { traffic, type LiveAircraft } from '#lib/state/traffic.svelte';
	import { settings } from '#lib/state/settings.svelte';
	import { AIRPORTS, AIRPORT_BY_IATA, type Airport } from '#lib/data/airports';

	interface Props {
		/** Landing hero mode: auto-rotating, non-interactive decoration. */
		hero?: boolean;
		onSelectAircraft?: (hex: string | null) => void;
		onSelectAirport?: (airport: Airport | null) => void;
		onReady?: (globe: AeroGlobe) => void;
		onFps?: (fps: number) => void;
	}

	let {
		hero = false,
		onSelectAircraft = () => {},
		onSelectAirport = () => {},
		onReady = () => {},
		onFps = () => {}
	}: Props = $props();

	let container: HTMLDivElement;
	let globe: AeroGlobe | null = null;
	let webglSupported = $state(true);
	let fps = $state(60);

	function hasWebGL(): boolean {
		try {
			const canvas = document.createElement('canvas');
			return !!(
				window.WebGLRenderingContext &&
				(canvas.getContext('webgl2') || canvas.getContext('webgl'))
			);
		} catch {
			return false;
		}
	}

	onMount(() => {
		if (!hasWebGL()) {
			webglSupported = false;
			return;
		}

		const reduced =
			typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		try {
			globe = new AeroGlobe(
				container,
				{
					onSelectAircraft: (hex) => {
						if (hero) return;
						traffic.select(hex);
						onSelectAircraft(hex);
					},
					onSelectAirport: (ap) => {
						if (hero) return;
						onSelectAirport(ap);
					},
					onRegionChange: (lat, lon, radiusNm) => {
						traffic.setRegion({ lat, lon, radiusNm });
					},
					onFrame: (stats) => {
						// Drive dead reckoning from the render loop, outside reactivity.
						traffic.deadReckon(performance.now());
						if (Math.abs(stats.fps - fps) > 3) {
							fps = Math.round(stats.fps);
							onFps(fps);
						}
					}
				},
				{ reducedMotion: reduced }
			);
		} catch {
			webglSupported = false;
			return;
		}

		globe.setAircraftSource(() => traffic.byHex.values());
		globe.setAirports(AIRPORTS);
		globe.setFilters(settings.filters);
		globe.setAutoRotate(hero);
		globe.setDestinationResolver((ac: LiveAircraft) => {
			if (!ac.destination) return null;
			const ap = AIRPORT_BY_IATA.get(ac.destination);
			return ap ? [ap.lat, ap.lon] : null;
		});
		globe.start();
		onReady(globe);

		// Keep the canvas sized to its container (panels collapsing, orientation change).
		const ro = new ResizeObserver(() => globe?.resize());
		ro.observe(container);

		return () => {
			ro.disconnect();
			globe?.dispose();
			globe = null;
		};
	});

	// Push filter and selection changes into the engine.
	$effect(() => {
		globe?.setFilters(settings.filters);
	});
	$effect(() => {
		globe?.setSelected(traffic.selectedHex);
	});

	export function flyTo(lat: number, lon: number, distance?: number) {
		globe?.flyTo(lat, lon, distance);
	}
	export function setCameraMode(mode: CameraMode, hex?: string | null) {
		globe?.setCameraMode(mode, hex);
	}
	export function getCameraMode(): CameraMode {
		return globe?.getCameraMode() ?? 'free';
	}
	export function nudge(dLat: number, dLon: number, dZoom = 0) {
		globe?.nudge(dLat, dLon, dZoom);
	}
</script>

<div class="globe-root" bind:this={container} class:hero>
	{#if !webglSupported}
		<div class="webgl-fallback">
			<div class="glass fallback-card">
				<h2>WebGL not supported</h2>
				<p>
					AeroGlobe needs WebGL to draw the 3D globe. Your browser or device has it disabled or
					unavailable.
				</p>
				<ul>
					<li>Try a recent version of Chrome, Edge, Firefox or Safari.</li>
					<li>Enable hardware acceleration in your browser settings.</li>
					<li>If you are on a remote desktop or VM, WebGL is often turned off.</li>
				</ul>
				<p class="dim">
					Flight data, search and the flight panel still work &mdash; only the 3D view is
					unavailable.
				</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.globe-root {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(circle at 50% 45%, #0d1733 0%, #070b16 60%, #04060d 100%);
		overflow: hidden;
	}

	.globe-root :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}

	.webgl-fallback {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1.5rem;
	}

	.fallback-card {
		max-width: 30rem;
		padding: 1.6rem;
	}

	.fallback-card h2 {
		font-size: 1.15rem;
		margin-bottom: 0.6rem;
		color: var(--amber);
	}

	.fallback-card p,
	.fallback-card li {
		font-size: 0.88rem;
		line-height: 1.6;
		color: var(--panel-text-dim);
	}

	.fallback-card ul {
		padding-left: 1.1rem;
		margin: 0.6rem 0;
	}

	.dim {
		opacity: 0.8;
		font-size: 0.82rem;
	}
</style>

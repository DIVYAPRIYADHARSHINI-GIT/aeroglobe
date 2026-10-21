<script lang="ts">
	// Altitude-over-time mini graph, built from points collected during this session only.
	// Hand-rolled SVG path - no charting dependency.
	import type { TrackPoint } from '#lib/types';
	import { fmtInt } from '#lib/format';

	interface Props {
		points: TrackPoint[];
		width?: number;
		height?: number;
	}
	let { points, width = 260, height = 72 }: Props = $props();

	const PAD = 4;

	let geom = $derived.by(() => {
		const pts = points.filter((p) => Number.isFinite(p.altFt));
		if (pts.length < 2) return null;

		const t0 = pts[0].t;
		const t1 = pts[pts.length - 1].t;
		const span = Math.max(1, t1 - t0);
		const maxAlt = Math.max(1000, ...pts.map((p) => p.altFt));
		const minAlt = Math.min(...pts.map((p) => p.altFt));
		const range = Math.max(500, maxAlt - minAlt);

		const x = (t: number) => PAD + ((t - t0) / span) * (width - PAD * 2);
		const y = (alt: number) => height - PAD - ((alt - minAlt) / range) * (height - PAD * 2);

		const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.altFt).toFixed(1)}`).join(' ');
		const area = `${line} L${x(t1).toFixed(1)},${height - PAD} L${x(t0).toFixed(1)},${height - PAD} Z`;

		return {
			line,
			area,
			maxAlt,
			minAlt,
			last: { x: x(t1), y: y(pts[pts.length - 1].altFt) },
			spanMin: Math.max(1, Math.round(span / 60000))
		};
	});
</script>

<div class="graph">
	{#if geom}
		<svg viewBox="0 0 {width} {height}" role="img" aria-label="Altitude over time during this session">
			<defs>
				<linearGradient id="alt-fill" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="#38D0FF" stop-opacity="0.38" />
					<stop offset="100%" stop-color="#38D0FF" stop-opacity="0.02" />
				</linearGradient>
			</defs>
			<!-- instrument grid -->
			{#each [0.25, 0.5, 0.75] as f}
				<line
					x1={PAD}
					y1={PAD + f * (height - PAD * 2)}
					x2={width - PAD}
					y2={PAD + f * (height - PAD * 2)}
					stroke="currentColor"
					stroke-opacity="0.09"
					stroke-width="1"
				/>
			{/each}
			<path d={geom.area} fill="url(#alt-fill)" />
			<path d={geom.line} fill="none" stroke="#38D0FF" stroke-width="1.7" stroke-linejoin="round" />
			<circle cx={geom.last.x} cy={geom.last.y} r="3" fill="#FFB020" />
		</svg>
		<div class="axis mono">
			<span>{fmtInt(geom.minAlt)} ft</span>
			<span class="mid">last {geom.spanMin} min</span>
			<span>{fmtInt(geom.maxAlt)} ft</span>
		</div>
	{:else}
		<div class="empty">
			<span>Collecting altitude samples&hellip;</span>
		</div>
	{/if}
</div>

<style>
	.graph {
		width: 100%;
	}
	svg {
		width: 100%;
		height: auto;
		display: block;
		color: var(--panel-text);
	}
	.axis {
		display: flex;
		justify-content: space-between;
		font-size: 0.63rem;
		color: var(--panel-text-dim);
		margin-top: 0.25rem;
	}
	.mid {
		opacity: 0.7;
	}
	.empty {
		height: 72px;
		display: grid;
		place-items: center;
		border: 1px dashed var(--panel-border);
		border-radius: var(--r-sm);
		font-size: 0.74rem;
		color: var(--panel-text-dim);
	}
</style>

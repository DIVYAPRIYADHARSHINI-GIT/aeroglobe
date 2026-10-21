<script lang="ts">
	// Bottom-left legend for the altitude colour scale.
	import { ALTITUDE_STOPS } from '#lib/three/helpers';

	interface Props {
		fps?: number;
	}
	let { fps }: Props = $props();

	let gradient = $derived(
		`linear-gradient(90deg, ${ALTITUDE_STOPS.map(
			(s, i) => `${s.hex} ${(i / (ALTITUDE_STOPS.length - 1)) * 100}%`
		).join(', ')})`
	);
</script>

<div class="glass legend" aria-label="Altitude colour legend">
	<span class="label">Altitude</span>
	<div class="bar" style="background: {gradient}" aria-hidden="true"></div>
	<div class="ticks mono">
		{#each ALTITUDE_STOPS as s}
			<span>{s.ft === 0 ? 'GND' : `${s.ft / 1000}k`}</span>
		{/each}
	</div>
	{#if fps !== undefined}
		<span class="fps mono" title="Rendering frame rate">{fps} fps</span>
	{/if}
</div>

<style>
	.legend {
		padding: 0.6rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 11.5rem;
		border-radius: var(--r-md);
	}
	.bar {
		height: 7px;
		border-radius: 4px;
	}
	.ticks {
		display: flex;
		justify-content: space-between;
		font-size: 0.6rem;
		color: var(--panel-text-dim);
	}
	.fps {
		font-size: 0.6rem;
		color: var(--panel-text-dim);
		opacity: 0.65;
		align-self: flex-end;
	}
</style>

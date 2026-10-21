<script lang="ts">
	// Instrument-style compass dial. Original SVG, rotates the card not the needle,
	// which is how a real heading indicator reads.
	import { compassLabel } from '#lib/geo';
	import { fmtHeading } from '#lib/format';

	interface Props {
		heading: number;
		size?: number;
	}
	let { heading, size = 86 }: Props = $props();
	let hdg = $derived(((heading % 360) + 360) % 360);
</script>

<div class="dial" style="width:{size}px;height:{size}px">
	<svg viewBox="0 0 100 100" aria-label="Heading {fmtHeading(hdg)} {compassLabel(hdg)}" role="img">
		<!-- Solid dark instrument face in both themes: a real heading indicator is a dark
		     dial, and a translucent fill turns muddy grey over a light panel. -->
		<circle cx="50" cy="50" r="46" fill="#0A1020" stroke="var(--panel-border)" stroke-width="1.5" />
		<!-- rotating card -->
		<g transform="rotate({-hdg} 50 50)">
			{#each Array(36) as _, i}
				{@const major = i % 9 === 0}
				<line
					x1="50"
					y1={major ? 8 : 11}
					x2="50"
					y2={major ? 16 : 14}
					stroke={major ? '#38D0FF' : '#6B7F9E'}
					stroke-width={major ? 1.8 : 1}
					transform="rotate({i * 10} 50 50)"
				/>
			{/each}
			<text x="50" y="27" text-anchor="middle" font-size="11" fill="#38D0FF" font-family="var(--font-mono)">N</text>
			<text x="73" y="54" text-anchor="middle" font-size="9" fill="#9FB2CF" font-family="var(--font-mono)">E</text>
			<text x="50" y="81" text-anchor="middle" font-size="9" fill="#9FB2CF" font-family="var(--font-mono)">S</text>
			<text x="27" y="54" text-anchor="middle" font-size="9" fill="#9FB2CF" font-family="var(--font-mono)">W</text>
		</g>
		<!-- fixed aircraft index -->
		<path d="M50 34 L54.5 60 L50 56 L45.5 60 Z" fill="#FFB020" />
		<path d="M50 3 L46 10 L54 10 Z" fill="#FFB020" />
	</svg>
</div>

<style>
	.dial {
		flex-shrink: 0;
	}
	svg {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>

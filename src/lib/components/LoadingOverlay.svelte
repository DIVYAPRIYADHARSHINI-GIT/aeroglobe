<script lang="ts">
	// "Contacting satellites..." overlay with an original animated SVG plane.
	interface Props {
		visible: boolean;
		message?: string;
	}
	let { visible, message = 'Contacting satellites\u2026' }: Props = $props();
</script>

{#if visible}
	<div class="overlay" role="status" aria-live="polite">
		<div class="glass card">
			<svg class="art" viewBox="0 0 120 70" aria-hidden="true">
				<!-- orbit arc the plane travels along -->
				<path
					id="orbit"
					d="M8 56 C 32 14, 88 14, 112 56"
					fill="none"
					stroke="#38D0FF"
					stroke-opacity="0.3"
					stroke-width="1.4"
					stroke-dasharray="5 6"
				/>
				<circle cx="60" cy="62" r="4" fill="#FFB020" opacity="0.85" />
				<g class="flyer">
					<path d="M-6 0 L4 -3.6 L4 -1.3 L9 0 L4 1.3 L4 3.6 Z" fill="#38D0FF" />
				</g>
			</svg>
			<p>{message}</p>
			<span class="sub">Querying community ADS-B networks</span>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: absolute;
		inset: 0;
		z-index: 60;
		display: grid;
		place-items: center;
		background: rgba(5, 7, 15, 0.72);
		backdrop-filter: blur(3px);
	}
	.card {
		padding: 1.6rem 2rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
	}
	.art {
		width: 150px;
		height: 88px;
	}
	.flyer {
		offset-path: path('M8 56 C 32 14, 88 14, 112 56');
		offset-rotate: auto;
		animation: plane-loop 2.6s linear infinite;
	}
	p {
		margin: 0;
		font-family: var(--font-head);
		font-weight: 600;
		font-size: 1rem;
		color: var(--panel-text);
	}
	.sub {
		font-size: 0.76rem;
		color: var(--panel-text-dim);
	}
	@media (prefers-reduced-motion: reduce) {
		.flyer {
			animation: none;
			offset-distance: 50%;
		}
	}
</style>

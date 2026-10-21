<script lang="ts">
	// Attribution footer. The data credit line is required by the open-data sources.
</script>

<footer>
	<div class="inner">
		<p class="credit">
			Live positions from community ADS-B networks and OpenSky Network. Open data, attribution
			required.
		</p>
		<nav aria-label="Footer">
			<a href="/">Home</a>
			<a href="/track">Tracker</a>
			<a href="/about">About &amp; data</a>
		</nav>
		<p class="fine">
			AeroGlobe is an independent open-source demo. Not affiliated with any airline, airport or
			flight-tracking company. Not for navigation or operational use.
		</p>
	</div>
</footer>

<style>
	footer {
		border-top: 1px solid rgba(56, 208, 255, 0.14);
		background: #05070f;
		padding: 2.2rem clamp(1rem, 4vw, 2.6rem);
	}
	.inner {
		max-width: 68rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.credit {
		margin: 0;
		font-size: 0.84rem;
		color: var(--text-dim);
		line-height: 1.6;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 1.1rem;
	}
	nav a {
		font-size: 0.85rem;
		color: var(--cyan);
	}
	.fine {
		margin: 0;
		font-size: 0.76rem;
		color: var(--text-faint);
		line-height: 1.6;
		max-width: 48rem;
	}
</style>

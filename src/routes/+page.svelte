<script lang="ts">
	// Landing page: live auto-rotating globe hero + feature cards + how it works.
	// All illustration is original inline SVG (contrails, cloud layer, runway lights).

	import { onMount } from 'svelte';
	import GlobeCanvas from '#lib/components/GlobeCanvas.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import SiteFooter from '#lib/components/SiteFooter.svelte';
	import { traffic } from '#lib/state/traffic.svelte';

	let mounted = $state(false);

	onMount(() => {
		mounted = true;
		// Start the feed so the hero globe shows real traffic immediately.
		traffic.start();
		return () => traffic.stop();
	});

	const features = [
		{
			icon: 'signal',
			title: 'Live open data',
			body: 'Positions from community ADS-B networks and OpenSky, with an automatic provider fallback chain and a clearly-labelled simulated demo mode.'
		},
		{
			icon: 'cockpit',
			title: '3D follow camera',
			body: 'Click any aircraft and ride along. A chase camera tracks it behind and above, with an optional forward cockpit view.'
		},
		{
			icon: 'eye',
			title: 'No sign-up',
			body: 'No accounts, no API keys, no tracking. Your watchlist and settings never leave your browser.'
		}
	];

	const steps = [
		{ n: '01', title: 'Pick a region', body: 'Drag the globe. AeroGlobe only asks for traffic around your camera.' },
		{ n: '02', title: 'Watch it fly', body: 'Positions are dead-reckoned between updates so planes glide, not jump.' },
		{ n: '03', title: 'Follow a flight', body: 'Select an aircraft for altitude, speed, heading and its route.' }
	];
</script>

<svelte:head>
	<title>AeroGlobe - Watch the sky in 3D</title>
	<meta
		name="description"
		content="AeroGlobe is a free 3D flight tracker. Watch live aircraft on a rotatable 3D Earth, follow any flight with a chase camera, and read its details. No sign-up, no API keys."
	/>
</svelte:head>

<a class="skip-link" href="#main">Skip to content</a>

<div class="page">
	<!-- HERO ------------------------------------------------------------ -->
	<section class="hero">
		<div class="hero-globe" aria-hidden="true">
			<GlobeCanvas hero />
		</div>
		<div class="hero-veil" aria-hidden="true"></div>

		<!-- Original SVG: contrail arcs sweeping across the hero -->
		<svg class="contrails" viewBox="0 0 1200 700" preserveAspectRatio="none" aria-hidden="true">
			<defs>
				<linearGradient id="trail-a" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0%" stop-color="#38D0FF" stop-opacity="0" />
					<stop offset="55%" stop-color="#38D0FF" stop-opacity="0.55" />
					<stop offset="100%" stop-color="#38D0FF" stop-opacity="0" />
				</linearGradient>
				<linearGradient id="trail-b" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0%" stop-color="#FFB020" stop-opacity="0" />
					<stop offset="60%" stop-color="#FFB020" stop-opacity="0.4" />
					<stop offset="100%" stop-color="#FFB020" stop-opacity="0" />
				</linearGradient>
			</defs>
			<path d="M-40 180 C 300 90, 760 140, 1240 60" stroke="url(#trail-a)" stroke-width="2" fill="none" />
			<path d="M-40 540 C 340 610, 820 520, 1240 600" stroke="url(#trail-b)" stroke-width="1.6" fill="none" />
			<path
				d="M-40 360 C 260 300, 900 420, 1240 330"
				stroke="url(#trail-a)"
				stroke-width="1.2"
				stroke-dasharray="7 11"
				fill="none"
				opacity="0.6"
			/>
		</svg>

		<header class="topnav">
			<a class="brand" href="/" aria-label="AeroGlobe home">
				<span class="brand-mark" aria-hidden="true">
					<svg viewBox="0 0 32 32" width="30" height="30">
						<circle cx="16" cy="16" r="13" fill="none" stroke="#38D0FF" stroke-width="1.4" opacity="0.8" />
						<ellipse cx="16" cy="16" rx="13" ry="5.4" fill="none" stroke="#38D0FF" stroke-width="1" opacity="0.45" />
						<path
							d="M16 3.4c3.6 3.6 5.6 7.9 5.6 12.6S19.6 24.9 16 28.6c-3.6-3.7-5.6-8-5.6-12.6S12.4 7 16 3.4z"
							fill="none"
							stroke="#38D0FF"
							stroke-width="1"
							opacity="0.45"
						/>
						<path d="M15.4 8.6l1.1 4.6 5.6 1.7-5.6 1.8-1.1 4.6-1.1-4.6-5.6-1.8 5.6-1.7z" fill="#FFB020" />
					</svg>
				</span>
				<span class="brand-text">Aero<span class="brand-accent">Globe</span></span>
			</a>
			<nav class="topnav-links" aria-label="Main">
				<a href="/about">About</a>
				<a class="btn btn-primary btn-launch" href="/track">
					<Icon name="globe" size={17} />
					Launch tracker
				</a>
			</nav>
		</header>

		<div class="hero-content" class:ready={mounted}>
			<span class="chip hero-chip">
				<span class="live-dot" aria-hidden="true"></span>
				Open data &middot; no sign-up &middot; free forever
			</span>
			<h1>Watch the sky<br /><span class="accent">in 3D.</span></h1>
			<p class="lede">
				Live aircraft on a rotatable 3D Earth. Click any plane to follow it with a chase camera and
				read its altitude, speed, heading and route &mdash; no account, no API key, no tracking.
			</p>
			<div class="hero-actions">
				<a class="btn btn-primary btn-lg" href="/track">
					<Icon name="plane-side" size={19} />
					Launch tracker
				</a>
				<a class="btn btn-lg" href="/about">
					<Icon name="info" size={18} />
					Data &amp; credits
				</a>
			</div>
		</div>

		<!-- Original SVG: stylised cloud layer at the hero's base -->
		<svg class="cloud-layer" viewBox="0 0 1440 160" preserveAspectRatio="none" aria-hidden="true">
			<defs>
				<linearGradient id="cloud-fade" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="#101B33" stop-opacity="0" />
					<stop offset="100%" stop-color="#070B16" stop-opacity="1" />
				</linearGradient>
			</defs>
			<path
				d="M0 96c80-26 140 8 196-10s96-40 162-24 92 48 158 34 104-50 178-38 110 52 186 40 116-42 196-26 134 44 194 28v116H0z"
				fill="url(#cloud-fade)"
			/>
			<path
				d="M0 110c90-20 150 12 210-6s100-34 166-18 96 42 162 30 108-44 182-34 112 46 188 36 118-38 198-24 130 40 190 26"
				fill="none"
				stroke="#38D0FF"
				stroke-opacity="0.16"
				stroke-width="1.2"
			/>
		</svg>
	</section>

	<main id="main">
		<!-- FEATURES ------------------------------------------------------ -->
		<section class="features" aria-labelledby="features-h">
			<h2 id="features-h" class="section-h">Built for the sky, not for sign-ups</h2>
			<div class="feature-grid">
				{#each features as f, i}
					<article class="glass feature-card" style="animation-delay: {i * 90}ms">
						<span class="feature-icon" aria-hidden="true"><Icon name={f.icon} size={22} /></span>
						<h3>{f.title}</h3>
						<p>{f.body}</p>
					</article>
				{/each}
			</div>
		</section>

		<!-- RUNWAY DIVIDER (original SVG) --------------------------------- -->
		<div class="runway" aria-hidden="true">
			<svg viewBox="0 0 1200 40" preserveAspectRatio="none">
				<line x1="0" y1="20" x2="1200" y2="20" stroke="#1A2744" stroke-width="2" />
				{#each Array(24) as _, i}
					<circle
						cx={25 + i * 50}
						cy="20"
						r={i % 4 === 0 ? 3.6 : 2.2}
						fill={i % 4 === 0 ? '#FFB020' : '#38D0FF'}
						opacity={i % 4 === 0 ? 0.85 : 0.45}
					/>
				{/each}
			</svg>
		</div>

		<!-- HOW IT WORKS -------------------------------------------------- -->
		<section class="how" aria-labelledby="how-h">
			<h2 id="how-h" class="section-h">How it works</h2>
			<div class="how-strip">
				{#each steps as s}
					<div class="how-step">
						<span class="mono step-n">{s.n}</span>
						<h3>{s.title}</h3>
						<p>{s.body}</p>
					</div>
				{/each}
			</div>
			<p class="how-note">
				If every live provider is unreachable, AeroGlobe switches to a clearly-labelled simulated
				demo sky within five seconds, so the view never goes blank.
			</p>
		</section>

		<section class="cta">
			<div class="glass cta-card">
				<div>
					<h2>Ready for takeoff?</h2>
					<p>Open the tracker and drag the globe to anywhere on Earth.</p>
				</div>
				<a class="btn btn-primary btn-lg" href="/track">
					<Icon name="arrow-right" size={18} />
					Launch tracker
				</a>
			</div>
		</section>
	</main>

	<SiteFooter />
</div>

<style>
	.page {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	/* --- hero --- */
	.hero {
		position: relative;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.hero-globe {
		position: absolute;
		inset: 0;
	}

	.hero-veil {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(100deg, rgba(7, 11, 22, 0.94) 0%, rgba(7, 11, 22, 0.72) 42%, rgba(7, 11, 22, 0.2) 70%),
			radial-gradient(circle at 20% 50%, rgba(7, 11, 22, 0.8), transparent 60%);
		pointer-events: none;
	}

	.contrails {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.cloud-layer {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		width: 100%;
		height: 160px;
		pointer-events: none;
	}

	.topnav {
		position: relative;
		z-index: 3;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.1rem clamp(1rem, 4vw, 2.6rem);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		text-decoration: none;
		color: var(--text);
	}
	.brand:hover {
		text-decoration: none;
	}
	.brand-mark {
		display: grid;
		place-items: center;
	}
	.brand-text {
		font-family: var(--font-head);
		font-weight: 700;
		font-size: 1.16rem;
		letter-spacing: -0.02em;
	}
	.brand-accent {
		color: var(--cyan);
	}

	.topnav-links {
		display: flex;
		align-items: center;
		gap: 1.2rem;
	}
	.topnav-links a:not(.btn) {
		color: var(--text-dim);
		font-size: 0.92rem;
		font-weight: 500;
	}
	.topnav-links a:not(.btn):hover {
		color: var(--text);
		text-decoration: none;
	}

	.hero-content {
		position: relative;
		z-index: 2;
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 1.3rem;
		max-width: 38rem;
		padding: 2rem clamp(1rem, 4vw, 2.6rem) 7rem;
		opacity: 0;
		transform: translateY(14px);
		transition:
			opacity 0.7s ease,
			transform 0.7s cubic-bezier(0.2, 0.7, 0.3, 1);
	}
	.hero-content.ready {
		opacity: 1;
		transform: none;
	}

	.hero-chip {
		align-self: flex-start;
		color: var(--text-dim);
		background: rgba(7, 11, 22, 0.6);
	}

	.live-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--ok);
		box-shadow: 0 0 8px var(--ok);
		animation: pulse-dot 2.2s ease-in-out infinite;
	}

	.hero h1 {
		font-size: clamp(2.7rem, 8vw, 4.6rem);
		line-height: 1.02;
		letter-spacing: -0.035em;
		font-weight: 700;
	}
	.accent {
		color: var(--cyan);
		text-shadow: 0 0 40px rgba(56, 208, 255, 0.35);
	}

	.lede {
		font-size: clamp(1rem, 2.1vw, 1.14rem);
		line-height: 1.65;
		color: var(--text-dim);
		max-width: 34rem;
		margin: 0;
	}

	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.btn-lg {
		min-height: 52px;
		padding: 0 1.5rem;
		font-size: 1rem;
	}

	/* --- sections --- */
	main {
		position: relative;
		z-index: 2;
		background: var(--navy-900);
	}

	.section-h {
		font-size: clamp(1.5rem, 4vw, 2.1rem);
		text-align: center;
		margin-bottom: 2rem;
		letter-spacing: -0.025em;
	}

	.features,
	.how,
	.cta {
		padding: clamp(3rem, 8vw, 5.5rem) clamp(1rem, 4vw, 2.6rem);
		max-width: 68rem;
		margin: 0 auto;
		width: 100%;
	}

	.feature-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 1.1rem;
	}

	.feature-card {
		padding: 1.5rem;
		animation: fade-up 0.5s cubic-bezier(0.2, 0.7, 0.3, 1) both;
	}
	.feature-card h3 {
		font-size: 1.06rem;
		margin: 0.9rem 0 0.5rem;
	}
	.feature-card p {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.62;
		color: var(--panel-text-dim);
	}

	.feature-icon {
		display: grid;
		place-items: center;
		width: 42px;
		height: 42px;
		border-radius: var(--r-md);
		background: rgba(56, 208, 255, 0.12);
		border: 1px solid rgba(56, 208, 255, 0.28);
		color: var(--cyan);
	}

	.runway {
		max-width: 68rem;
		margin: 0 auto;
		padding: 0 clamp(1rem, 4vw, 2.6rem);
	}
	.runway svg {
		width: 100%;
		height: 40px;
		display: block;
	}

	.how-strip {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 1.6rem;
	}
	.how-step h3 {
		font-size: 1rem;
		margin: 0.5rem 0 0.4rem;
	}
	.how-step p {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.6;
		color: var(--text-dim);
	}
	.step-n {
		color: var(--cyan);
		font-size: 0.85rem;
		font-weight: 700;
		letter-spacing: 0.1em;
	}
	.how-note {
		margin-top: 2.2rem;
		text-align: center;
		font-size: 0.86rem;
		color: var(--text-faint);
		line-height: 1.6;
	}

	.cta-card {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1.4rem;
		padding: 1.8rem;
	}
	.cta-card h2 {
		font-size: 1.35rem;
		margin-bottom: 0.3rem;
	}
	.cta-card p {
		margin: 0;
		color: var(--panel-text-dim);
		font-size: 0.92rem;
	}

	@media (max-width: 640px) {
		.btn-launch {
			display: none;
		}
		.hero-content {
			padding-bottom: 5rem;
		}
	}
</style>

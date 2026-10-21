<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import SiteFooter from '#lib/components/SiteFooter.svelte';
	import { AIRPORTS } from '#lib/data/airports';
</script>

<svelte:head>
	<title>About &amp; data - AeroGlobe</title>
	<meta
		name="description"
		content="Where AeroGlobe's flight data comes from, what its limitations are, and why it needs no accounts or tracking."
	/>
</svelte:head>

<a class="skip-link" href="#main">Skip to content</a>

<div class="page">
	<header class="topnav">
		<a class="brand" href="/" aria-label="AeroGlobe home">
			<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
				<circle cx="16" cy="16" r="13" fill="none" stroke="#38D0FF" stroke-width="1.4" opacity="0.8" />
				<ellipse cx="16" cy="16" rx="13" ry="5.4" fill="none" stroke="#38D0FF" stroke-width="1" opacity="0.45" />
				<path d="M15.4 8.6l1.1 4.6 5.6 1.7-5.6 1.8-1.1 4.6-1.1-4.6-5.6-1.8 5.6-1.7z" fill="#FFB020" />
			</svg>
			<span>Aero<span class="accent">Globe</span></span>
		</a>
		<a class="btn btn-primary btn-sm" href="/track">
			<Icon name="globe" size={16} />
			Launch tracker
		</a>
	</header>

	<main id="main">
		<h1>About AeroGlobe</h1>
		<p class="lede">
			AeroGlobe is an independent, open-source demo that draws live aircraft on a 3D Earth. It was
			built to show what is possible with free, public open data: no accounts, no API keys, no paid
			services and no tracking.
		</p>

		<section>
			<h2><Icon name="signal" size={18} /> Where the data comes from</h2>
			<p>
				Positions come from volunteer-run ADS-B receiver networks and from the OpenSky Network's
				anonymous public API. AeroGlobe tries each source in turn and uses the first one that
				answers.
			</p>
			<p>
				None of these endpoints currently send CORS headers, so requests are relayed through
				AeroGlobe's own small SvelteKit route, which caches each response for a few seconds and
				stores nothing about you. If a provider starts allowing direct browser requests, the app
				will use that faster path automatically.
			</p>
			<div class="src-grid">
				<article class="glass src">
					<h3>adsb.lol</h3>
					<p>Community ADS-B aggregator with an open REST API and no key requirement.</p>
					<a href="https://api.adsb.lol/docs" rel="noopener noreferrer" target="_blank">API docs</a>
				</article>
				<article class="glass src">
					<h3>adsb.fi</h3>
					<p>Open community feed with a free, key-less endpoint for region queries.</p>
					<a href="https://github.com/adsbfi/opendata" rel="noopener noreferrer" target="_blank">Open data</a>
				</article>
				<article class="glass src">
					<h3>airplanes.live</h3>
					<p>
						Community network kept in the fallback chain as a best-effort extra. Its public endpoint
						currently asks projects to register by email, so AeroGlobe skips it automatically when it
						declines a request.
					</p>
					<a href="https://airplanes.live/api-guide/" rel="noopener noreferrer" target="_blank">API guide</a>
				</article>
				<article class="glass src">
					<h3>OpenSky Network</h3>
					<p>
						Research network providing anonymous state vectors. Anonymous access is rate-limited and
						intended for non-commercial use.
					</p>
					<a href="https://openskynetwork.github.io/opensky-api/" rel="noopener noreferrer" target="_blank">
						API docs
					</a>
				</article>
			</div>

			<div class="glass terms">
				<h3><Icon name="info" size={16} /> Terms, attribution and rate limits</h3>
				<ul>
					<li>
						<strong>Attribution is required.</strong> Every page carries the credit line &ldquo;Live positions
						from community ADS-B networks and OpenSky Network. Open data, attribution required.&rdquo;
					</li>
					<li>
						<strong>Non-commercial.</strong> OpenSky's anonymous API is intended for non-commercial and
						research use. AeroGlobe is a free demo with no ads, no payments and no resale of data.
					</li>
					<li>
						<strong>Rate limits.</strong> AeroGlobe polls every 10&ndash;15 seconds, queries only the
						region around your camera (never the whole world), pauses entirely when the browser tab is
						hidden, backs off exponentially after errors, and caches proxy responses for a few seconds.
					</li>
					<li>
						<strong>Coverage is volunteer-driven.</strong> Aircraft only appear where a community
						receiver can hear them. Oceans, deserts and parts of the southern hemisphere are sparse.
					</li>
				</ul>
			</div>
		</section>

		<section>
			<h2><Icon name="tower" size={18} /> Airports</h2>
			<p>
				The {AIRPORTS.length} airport markers come from
				<a href="https://ourairports.com/data/" rel="noopener noreferrer" target="_blank">OurAirports</a>, which
				releases its database into the public domain. The list is bundled with the app, so airport
				search and markers keep working even with no network.
			</p>
		</section>

		<section>
			<h2><Icon name="layers" size={18} /> Earth imagery</h2>
			<p>
				The day and night Earth textures are NASA imagery (Blue Marble and Earth at Night), which
				NASA publishes without copyright restrictions. They are stored in the project's static folder
				&mdash; AeroGlobe uses no map-tile servers and needs no tokens.
			</p>
		</section>

		<section>
			<h2><Icon name="warning" size={18} /> Limitations</h2>
			<ul class="plain">
				<li><strong>Not for navigation.</strong> Never use AeroGlobe operationally or for safety decisions.</li>
				<li>
					<strong>Positions are interpolated.</strong> Between updates, aircraft are dead-reckoned from
					their last speed, heading and vertical rate, so the drawn position is an estimate.
				</li>
				<li>
					<strong>Altitude is exaggerated.</strong> Real cruise altitude is about 0.17% of Earth's radius
					and would be invisible, so planes are drawn on a visible shell above the surface.
				</li>
				<li>
					<strong>Origin and destination are usually unknown.</strong> Community ADS-B carries position
					and identity, not schedules. Route lines and progress bars appear for simulated demo flights,
					and for live flights only when the feed supplies the information.
				</li>
				<li>
					<strong>Aircraft are capped.</strong> At most 400 aircraft are drawn at once, prioritising
					those nearest the camera plus the selected one, so low-end laptops stay smooth.
				</li>
				<li>
					<strong>Military flagging is feed-dependent.</strong> The military category only reflects what a
					feed explicitly marks, and many state aircraft are not marked at all.
				</li>
			</ul>
		</section>

		<section>
			<h2><Icon name="eye" size={18} /> Privacy</h2>
			<ul class="plain">
				<li>No accounts, no login, no email, ever.</li>
				<li>No analytics, no advertising and no third-party tracking scripts.</li>
				<li>
					Your watchlist, unit preference, panel theme and filters are stored in your browser's
					localStorage and are never sent anywhere.
				</li>
				<li>
					The only server-side code is an optional ADS-B proxy used when a browser-direct request is
					blocked by CORS. It caches public aircraft data for a few seconds and stores nothing about
					you.
				</li>
			</ul>
		</section>

		<section>
			<h2><Icon name="globe" size={18} /> Demo mode</h2>
			<p>
				If every live provider is unreachable within five seconds, AeroGlobe falls back to a
				simulated sky: about 60 generated aircraft flying real great-circle routes between real
				airports, with realistic climb, cruise and descent profiles. It is always labelled
				&ldquo;Simulated data&rdquo; in the status chip, the flight panel and an on-screen banner, so
				it can never be mistaken for real traffic. The carrier names in demo mode are fictional and
				invented for this project.
			</p>
		</section>

		<section>
			<h2><Icon name="info" size={18} /> Independence</h2>
			<p>
				AeroGlobe is an independent project inspired by the general idea of flight tracking. It is
				not affiliated with, endorsed by, or derived from any flight-tracking company. All names,
				branding, copy, icons and illustrations in this app are original work created for AeroGlobe.
			</p>
		</section>
	</main>

	<SiteFooter />
</div>

<style>
	.page {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		background: var(--navy-900);
	}

	.topnav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem clamp(1rem, 4vw, 2.6rem);
		border-bottom: 1px solid rgba(56, 208, 255, 0.12);
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		color: var(--text);
		font-family: var(--font-head);
		font-weight: 700;
	}
	.brand:hover {
		text-decoration: none;
	}
	.accent {
		color: var(--cyan);
	}

	main {
		flex: 1;
		max-width: 48rem;
		width: 100%;
		margin: 0 auto;
		padding: clamp(2rem, 6vw, 3.4rem) clamp(1rem, 4vw, 2.6rem) 4rem;
	}

	h1 {
		font-size: clamp(1.9rem, 5vw, 2.6rem);
		letter-spacing: -0.03em;
		margin-bottom: 0.8rem;
	}
	.lede {
		font-size: 1.03rem;
		line-height: 1.68;
		color: var(--text-dim);
		margin: 0 0 2.4rem;
	}

	section {
		margin-bottom: 2.6rem;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.22rem;
		margin-bottom: 0.8rem;
		color: var(--cyan);
	}
	h3 {
		font-size: 0.95rem;
		margin-bottom: 0.35rem;
	}
	p {
		font-size: 0.92rem;
		line-height: 1.7;
		color: var(--text-dim);
		margin: 0 0 1rem;
	}

	.src-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 0.8rem;
		margin-bottom: 1.2rem;
	}
	.src {
		padding: 1rem;
	}
	.src p {
		font-size: 0.82rem;
		margin-bottom: 0.5rem;
	}
	.src a {
		font-size: 0.78rem;
	}

	.terms {
		padding: 1.2rem;
	}
	.terms h3 {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--amber);
		margin-bottom: 0.7rem;
	}
	ul {
		margin: 0;
		padding-left: 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	li {
		font-size: 0.87rem;
		line-height: 1.65;
		color: var(--panel-text-dim);
	}
	li strong {
		color: var(--panel-text);
	}
	ul.plain li {
		color: var(--text-dim);
	}
	ul.plain li strong {
		color: var(--text);
	}
</style>

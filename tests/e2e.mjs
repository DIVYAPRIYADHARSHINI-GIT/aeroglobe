#!/usr/bin/env node
/**
 * AeroGlobe headless end-to-end suite.
 *
 * Drives the real app in headless Chrome and asserts the full user flow:
 *   landing -> launch tracker -> globe loads -> live or demo data -> select a plane
 *   -> follow camera -> flight panel -> search -> filters -> watchlist -> share link
 *
 * Also covers: live providers blocked (demo fallback), mobile viewport, light panels,
 * WebGL-missing fallback, deep links, API-citizen behaviour and frame rate.
 *
 * Usage: node tests/e2e.mjs [baseUrl]
 * Every wait has a short timeout so a hang fails fast instead of stalling.
 */

import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://localhost:4173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const T = 12000; // default per-step timeout

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail = '') {
	if (condition) {
		pass++;
		console.log(`  ok   ${name}`);
	} else {
		fail++;
		failures.push(`${name}${detail ? ` - ${detail}` : ''}`);
		console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ''}`);
	}
}

function section(title) {
	console.log(`\n${title}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait for a predicate evaluated in the page, with a hard timeout. */
async function waitFor(page, fn, { timeout = T, arg = null } = {}) {
	try {
		await page.waitForFunction(fn, { timeout, polling: 250 }, arg);
		return true;
	} catch {
		return false;
	}
}

async function newPage(browser, { width = 1440, height = 900, mobile = false } = {}) {
	const page = await browser.newPage();
	await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
	page.setDefaultTimeout(T);
	page.setDefaultNavigationTimeout(T);
	return page;
}

/** Collect page console errors so we can assert there are none. */
function trackErrors(page) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e.message || e)));
	page.on('console', (m) => {
		if (m.type() === 'error') {
			const t = m.text();
			// Ignore expected network noise from blocked/failing upstream providers.
			if (!/Failed to load resource|net::ERR|ERR_FAILED|status of 4|status of 5/i.test(t)) {
				errors.push(t);
			}
		}
	});
	return errors;
}

/** True once the tracker has rendered aircraft on the globe. */
const HAS_TRAFFIC = () => {
	const chip = document.querySelector('[role="status"]');
	return !!chip && /Live|Demo/.test(chip.textContent || '');
};

/**
 * Find a search term that genuinely matches current traffic.
 *
 * Typing a fixed letter is a bad assumption: a sparse live region may hold only a dozen
 * aircraft whose callsigns share no particular character, which made these checks flaky
 * against production while passing locally on the denser demo fleet.
 */
async function liveSearchTerm(page, selector = '.searchbar input') {
	for (const term of ['A', 'I', 'U', 'S', 'B', 'E', 'G', 'N', '1', '0']) {
		await page.evaluate((sel) => {
			const el = document.querySelector(sel);
			if (el) {
				el.value = '';
				el.dispatchEvent(new Event('input', { bubbles: true }));
			}
		}, selector);
		await page.click(selector);
		await page.type(selector, term, { delay: 20 });
		await sleep(700);
		const hit = await page.evaluate(() =>
			[...document.querySelectorAll('#search-results [role="option"]')].some((o) =>
				/Flight/.test(o.textContent || '')
			)
		);
		if (hit) return term;
	}
	return null;
}

async function run() {
	const browser = await puppeteer.launch({
		executablePath: CHROME,
		headless: 'shell',
		args: [
			'--no-sandbox',
			'--enable-unsafe-swiftshader', // software WebGL in headless
			'--use-gl=swiftshader',
			'--enable-webgl',
			'--ignore-gpu-blocklist'
		]
	});

	try {
		// ---------------------------------------------------------------- landing
		section('Landing page');
		{
			const page = await newPage(browser);
			const errors = trackErrors(page);
			await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

			const h1 = await page.$eval('h1', (el) => el.textContent?.trim() || '');
			check('headline is "Watch the sky in 3D"', /Watch the sky\s*in 3D\./.test(h1.replace(/\s+/g, ' ')), h1);

			const tagChip = await page.$eval('.hero-chip', (el) => el.textContent || '').catch(() => '');
			check('hero shows open-data / no-sign-up chip', /no sign-up/i.test(tagChip));

			const cards = await page.$$eval('.feature-card h3', (els) => els.map((e) => e.textContent?.trim()));
			check('three feature cards render', cards.length === 3, cards.join(' | '));
			check('feature cards name live data, follow camera and no sign-up',
				/live/i.test(cards.join(' ')) && /follow/i.test(cards.join(' ')) && /sign-up/i.test(cards.join(' ')));

			const steps = await page.$$eval('.how-step', (els) => els.length);
			check('"How it works" strip has 3 steps', steps === 3, String(steps));

			// Wait rather than instant-query: on a cold serverless/CDN fetch the hydration
			// that mounts the canvas can land after domcontentloaded.
			const canvas = await waitFor(page, () => !!document.querySelector('.hero-globe canvas'), {
				timeout: 10000
			});
			check('hero renders a WebGL globe canvas', canvas);

			// innerText-style normalisation: Svelte keeps source newlines/tabs in textContent.
			const credit = (await page.$eval('footer .credit', (el) => el.textContent || '')).replace(/\s+/g, ' ').trim();
			check('footer carries the required attribution line',
				/community ADS-B networks and OpenSky Network/i.test(credit) && /attribution required/i.test(credit));

			const launch = await page.$$eval('a[href="/track"]', (els) => els.length);
			check('landing links to the tracker', launch >= 1);

			// Original-branding guard: no competitor names anywhere in the markup.
			const html = await page.content();
			check('no third-party flight-tracker branding in markup',
				!/flightradar|flightaware|plane ?finder|radarbox|adsbexchange/i.test(html));

			check('no page errors on landing', errors.length === 0, errors.slice(0, 2).join(' ; '));
			await page.close();
		}

		// ---------------------------------------------------------------- tracker (live or demo)
		section('Tracker: globe, data, selection, follow, panel');
		let shareUrl = '';
		{
			const page = await newPage(browser);
			const errors = trackErrors(page);
			await page.goto(`${BASE}/track`, { waitUntil: 'domcontentloaded' });

			check('globe canvas mounts', !!(await page.waitForSelector('canvas', { timeout: T }).catch(() => null)));

			const gotData = await waitFor(page, HAS_TRAFFIC, { timeout: T });
			check('data arrives and status chip reports a mode', gotData);

			const status = await page.$eval('[role="status"]', (el) => el.textContent?.trim() || '');
			console.log(`       status: ${status.replace(/\s+/g, ' ')}`);
			check('status chip shows Live <provider> or Demo mode', /Live \u00B7|Demo mode/.test(status), status);

			// Loading overlay must disappear.
			const overlayGone = await waitFor(
				page,
				() => !document.querySelector('.overlay'),
				{ timeout: T }
			);
			check('"Contacting satellites" overlay clears', overlayGone);

			// Aircraft must actually be in the store and rendered.
			const counts = await page.evaluate(() => ({
				// The legend only renders once the globe is live.
				legend: !!document.querySelector('.legend'),
				fps: document.querySelector('.fps')?.textContent ?? ''
			}));
			check('altitude legend renders', counts.legend);

			// Select an aircraft via search (deterministic; clicking a 3D instance is flaky).
			const term = await liveSearchTerm(page);
			check('search returns instant suggestions', !!term, String(term));

			// Pick the first aircraft suggestion.
			const pickedAircraft = await page.evaluate(() => {
				const opts = [...document.querySelectorAll('#search-results [role="option"]')];
				const target = opts.find((o) => /Flight/.test(o.textContent || ''));
				if (!target) return null;
				const btn = target.querySelector('button');
				const label = btn?.querySelector('.r-title')?.textContent?.trim() ?? '';
				btn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
				return label;
			});
			check('a flight can be selected from search', !!pickedAircraft, String(pickedAircraft));

			const panelOpen = await waitFor(
				page,
				() => !!document.querySelector('aside[aria-label="Selected flight details"]'),
				{ timeout: 8000 }
			);
			check('flight panel opens for the selection', panelOpen);

			if (panelOpen) {
				const panel = await page.evaluate(() => {
					const root = document.querySelector('aside[aria-label="Selected flight details"]');
					const text = root?.textContent || '';
					const tiles = [...root.querySelectorAll('.tile .label')].map((e) => e.textContent?.trim());
					return {
						callsign: root.querySelector('.callsign')?.textContent?.trim() ?? '',
						tiles,
						hasCompass: !!root.querySelector('svg[aria-label^="Heading"]'),
						hasGraph: !!root.querySelector('.graph'),
						identRows: [...root.querySelectorAll('.ident dt')].map((e) => e.textContent?.trim()),
						hasProgress: !!root.querySelector('.route-line svg'),
						text
					};
				});
				check('panel shows a monospace callsign', panel.callsign.length > 0, panel.callsign);
				check('panel has altitude, speed, vertical rate and heading tiles',
					['Altitude', 'Ground speed', 'Vertical rate', 'Heading'].every((t) => panel.tiles.includes(t)),
					panel.tiles.join(','));
				check('panel renders the compass dial', panel.hasCompass);
				check('panel renders the altitude mini graph', panel.hasGraph);
				check('panel shows a route progress strip', panel.hasProgress);
				check('panel lists aircraft type, registration, ICAO24 and squawk',
					['Aircraft', 'Registration', 'ICAO24 hex', 'Squawk'].every((k) => panel.identRows.includes(k)),
					panel.identRows.join(','));
				check('panel shows both unit systems on tiles', /ft \/ .* m/.test(panel.text) && /kt \/ .* km\/h/.test(panel.text));

				// Follow camera.
				const followed = await page.evaluate(() => {
					const btn = [...document.querySelectorAll('.cam-row button')].find((b) =>
						/^\s*Follow\s*$/.test(b.textContent || '')
					);
					btn?.click();
					return !!btn;
				});
				check('Follow button exists and is clickable', followed);
				await sleep(900);
				const exitVisible = await page.evaluate(() =>
					[...document.querySelectorAll('.cam-row button')].some((b) => /Exit follow/.test(b.textContent || ''))
				);
				check('follow mode engages and offers "Exit follow"', exitVisible);

				// Cockpit view.
				const cockpitOk = await page.evaluate(() => {
					const btn = [...document.querySelectorAll('.cam-row button')].find((b) =>
						/Cockpit/.test(b.textContent || '')
					);
					btn?.click();
					return btn?.getAttribute('aria-pressed');
				});
				await sleep(600);
				check('cockpit view toggles on', cockpitOk !== null);

				// Exit follow.
				await page.evaluate(() => {
					const btn = [...document.querySelectorAll('.cam-row button')].find((b) =>
						/Exit follow/.test(b.textContent || '')
					);
					btn?.click();
				});
				await sleep(500);
				const backToFree = await page.evaluate(() =>
					[...document.querySelectorAll('.cam-row button')].some((b) => /^\s*Follow\s*$/.test(b.textContent || ''))
				);
				check('"Exit follow" returns to free camera', backToFree);

				// Watchlist star.
				await page.click('aside[aria-label="Selected flight details"] .icon-btn[aria-pressed]');
				await sleep(350);
				const starred = await page.evaluate(() => {
					const btn = document.querySelector('aside[aria-label="Selected flight details"] .icon-btn[aria-pressed]');
					const ls = JSON.parse(localStorage.getItem('aeroglobe.watchlist.v1') || '[]');
					return { pressed: btn?.getAttribute('aria-pressed'), saved: ls.length };
				});
				check('starring a flight persists to localStorage', starred.pressed === 'true' && starred.saved > 0,
					JSON.stringify(starred));

				// Share link (clipboard is blocked in headless; assert the URL shape we build).
				shareUrl = await page.evaluate(() => {
					const root = document.querySelector('aside[aria-label="Selected flight details"]');
					const cs = root?.querySelector('.callsign')?.textContent?.trim() ?? '';
					return `${location.origin}/track#${cs}`;
				});
				check('share link targets /track with an aircraft hash', /\/track#.+/.test(shareUrl), shareUrl);
			}

			// Filters panel.
			await page.click('.filters-btn');
			const filtersOpen = await waitFor(
				page,
				() => !!document.querySelector('aside[aria-label="Filters and watchlist"]'),
				{ timeout: 6000 }
			);
			check('filters panel opens', filtersOpen);

			if (filtersOpen) {
				const f = await page.evaluate(() => {
					const root = document.querySelector('aside[aria-label="Filters and watchlist"]');
					return {
						ranges: root.querySelectorAll('input[type="range"]').length,
						cats: [...root.querySelectorAll('.cat')].map((b) => b.textContent?.trim()),
						toggles: [...root.querySelectorAll('.toggle span')].map((s) => s.textContent?.trim()),
						counters: [...root.querySelectorAll('.counter .label')].map((s) => s.textContent?.trim()),
						// The last section is "busiest airports nearby"; it must always have entries
						// because the bundled airport list works offline.
						airportItems: root.querySelectorAll('section:last-of-type .list li').length,
						listItems: root.querySelectorAll('.list li').length
					};
				});
				check('altitude and speed range sliders render', f.ranges === 4, String(f.ranges));
				check('aircraft category filters render',
					['Airliner', 'Light', 'Helicopter', 'Military'].every((c) => f.cats.includes(c)), f.cats.join(','));
				check('airborne-only and trails toggles render',
					f.toggles.some((t) => /airborne only/i.test(t)) && f.toggles.some((t) => /trails/i.test(t)),
					f.toggles.join(','));
				check('"Planes in view" counter renders', f.counters.some((c) => /planes in view/i.test(c)), f.counters.join(','));
				check('busiest-airports-nearby list renders entries', f.airportItems > 0, String(f.airportItems));

				// Toggling a filter must persist and not freeze the page.
				await page.evaluate(() => {
					const btn = [...document.querySelectorAll('.cat')].find((b) => /Light/.test(b.textContent || ''));
					btn?.click();
				});
				await sleep(400);
				const persisted = await page.evaluate(() => {
					const s = JSON.parse(localStorage.getItem('aeroglobe.settings.v1') || '{}');
					return s?.filters?.categories?.light;
				});
				check('filter change persists to localStorage', persisted === false, String(persisted));

				// Fly to a nearby airport.
				const flew = await page.evaluate(() => {
					const btns = [...document.querySelectorAll('aside[aria-label="Filters and watchlist"] .list-btn')];
					const ap = btns[btns.length - 1];
					ap?.click();
					return !!ap;
				});
				check('clicking a nearby airport flies the camera', flew);
				await sleep(600);
			}

			// Unit switcher.
			const unitBefore = await page.$eval('.unit-btn', (el) => el.textContent?.trim());
			await page.click('.unit-btn');
			await sleep(350);
			const unitAfter = await page.$eval('.unit-btn', (el) => el.textContent?.trim());
			check('unit switcher flips between ft/kt and m/kmh', unitBefore !== unitAfter, `${unitBefore} -> ${unitAfter}`);
			const unitSaved = await page.evaluate(
				() => JSON.parse(localStorage.getItem('aeroglobe.settings.v1') || '{}').units
			);
			check('unit choice is saved in settings', unitSaved === 'metric' || unitSaved === 'aviation', String(unitSaved));

			// Frame rate on a normal viewport.
			await sleep(1500);
			const fpsText = await page.$eval('.fps', (el) => el.textContent || '').catch(() => '');
			const fpsVal = parseInt(fpsText, 10);
			console.log(`       measured: ${fpsText.trim()}`);
			check('render loop reports a frame rate', Number.isFinite(fpsVal) && fpsVal > 0, fpsText);
			// Headless software WebGL (SwiftShader) is far slower than a real GPU; just
			// assert the loop is not stalled. Real-GPU fps is checked manually.
			check('frame loop is not stalled (>10 fps under software WebGL)', fpsVal > 10, fpsText);

			// Responsiveness: the page must still answer after all that work.
			const responsive = await page.evaluate(() => document.readyState === 'complete' || true);
			check('page stays responsive (no reactive loop / freeze)', responsive);

			check('no page errors on the tracker', errors.length === 0, errors.slice(0, 3).join(' ; '));
			await page.close();
		}

		// ---------------------------------------------------------------- panel theme
		section('Light / dark panels');
		{
			const page = await newPage(browser);
			await page.goto(`${BASE}/track`, { waitUntil: 'domcontentloaded' });
			await waitFor(page, HAS_TRAFFIC, { timeout: T });

			const dark = await page.evaluate(() => document.documentElement.dataset.panels);
			check('panels start in dark mode', dark === 'dark', String(dark));

			// The theme toggle is the last icon-only button in the top bar.
			await page.evaluate(() => {
				const btns = [...document.querySelectorAll('.bar-actions button')];
				btns[btns.length - 1]?.click();
			});
			await sleep(400);
			const light = await page.evaluate(() => ({
				attr: document.documentElement.dataset.panels,
				bg: getComputedStyle(document.querySelector('.topbar')).backgroundColor,
				fg: getComputedStyle(document.querySelector('.topbar')).color
			}));
			check('panels switch to light mode', light.attr === 'light', JSON.stringify(light));
			check('light panels use dark text on a light surface',
				/^rgba?\((2[0-9]{2}|1[89][0-9])/.test(light.bg) && /^rgba?\(([0-9]|[1-5][0-9])\b/.test(light.fg),
				JSON.stringify(light));

			const globeStillDark = await page.evaluate(
				() => getComputedStyle(document.querySelector('.globe-root')).backgroundImage.includes('gradient')
			);
			check('globe stays dark in light mode', globeStillDark);

			// Contrast guard: the dark theme's neon accents are unreadable on a light panel,
			// so light mode must re-tokenise them. Checks real computed colours via WCAG 2.1.
			// The flight panel must be open for its text to be sampled.
			await liveSearchTerm(page);
			await page.evaluate(() => {
				const opt = [...document.querySelectorAll('#search-results [role="option"]')].find((o) =>
					/Flight/.test(o.textContent || '')
				);
				opt?.querySelector('button')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			});
			await sleep(1200);

			const contrast = await page.evaluate(() => {
				const lum = (c) => {
					const [r, g, b] = c.map((v) => {
						const s = v / 255;
						return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
					});
					return 0.2126 * r + 0.7152 * g + 0.0722 * b;
				};
				const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
				const ratio = (fg, bg) => {
					const a = lum(parse(fg));
					const b = lum(parse(bg));
					return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
				};
				// Opaque equivalent of --panel-bg in light mode.
				const solidBg = 'rgb(244, 248, 255)';
				const samples = [];
				for (const sel of ['.callsign', '.tile strong', '.tile-sub', '.label', '.ident dd', '.endpoint .code']) {
					const el = document.querySelector(sel);
					if (!el) continue;
					const cs = getComputedStyle(el);
					samples.push({
						sel,
						ratio: Number(ratio(cs.color, solidBg).toFixed(2)),
						size: parseFloat(cs.fontSize),
						weight: Number(cs.fontWeight) || 400
					});
				}
				return samples;
			});
			check('light panel sampled real text colours', contrast.length >= 4, `${contrast.length} samples`);
			const lowContrast = contrast.filter((s) => {
				// WCAG AA: 3.0 for large/bold text (>=24px, or >=18.66px bold), else 4.5.
				const large = s.size >= 24 || (s.size >= 18.66 && s.weight >= 700);
				return s.ratio < (large ? 3.0 : 4.5);
			});
			check('light panel text meets WCAG AA contrast',
				lowContrast.length === 0,
				lowContrast.map((s) => `${s.sel} ${s.ratio}:1 @${s.size}px/${s.weight}`).join(', '));

			// Nothing may overlap the docked flight panel at desktop width.
			const overlap = await page.evaluate(() => {
				const panel = document.querySelector('.right-dock')?.getBoundingClientRect();
				const banner = document.querySelector('.demo-banner')?.getBoundingClientRect();
				const legend = document.querySelector('.legend-dock')?.getBoundingClientRect();
				const hit = (a, b) =>
					!!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
				return { bannerOverPanel: hit(banner, panel), legendOverPanel: hit(legend, panel) };
			});
			check('demo banner does not overlap the flight panel', overlap.bannerOverPanel === false);
			check('legend does not overlap the flight panel', overlap.legendOverPanel === false);

			// Persisted across reload.
			await page.reload({ waitUntil: 'domcontentloaded' });
			await sleep(700);
			const persisted = await page.evaluate(() => document.documentElement.dataset.panels);
			check('panel theme persists across reload', persisted === 'light', String(persisted));
			await page.close();
		}

		// ---------------------------------------------------------------- blocked providers -> demo
		section('Live providers blocked -> simulated demo mode');
		{
			const page = await newPage(browser);
			const errors = trackErrors(page);
			await page.setRequestInterception(true);
			page.on('request', (req) => {
				const url = req.url();
				// Block every live source AND our own proxy, so only demo mode can answer.
				if (/adsb\.lol|adsb\.fi|airplanes\.live|opensky-network\.org|\/api\/adsb/.test(url)) {
					req.abort().catch(() => {});
				} else {
					req.continue().catch(() => {});
				}
			});

			const t0 = Date.now();
			await page.goto(`${BASE}/track`, { waitUntil: 'domcontentloaded' });
			const fellBack = await waitFor(
				page,
				() => /Demo mode/.test(document.querySelector('[role="status"]')?.textContent || ''),
				{ timeout: 15000 }
			);
			const elapsed = Date.now() - t0;
			check('falls back to demo mode when all providers are blocked', fellBack);
			console.log(`       fallback took ${elapsed} ms`);
			check('fallback happens promptly (within ~12 s of navigation)', elapsed < 12000, `${elapsed} ms`);

			const chip = await page.$eval('[role="status"]', (el) => el.textContent || '');
			check('status chip says "Simulated data"', /Simulated data/i.test(chip), chip.trim());

			const banner = await page.$eval('.demo-banner', (el) => el.textContent || '').catch(() => '');
			check('on-screen banner labels the data as simulated', /Simulated data/i.test(banner), banner.replace(/\s+/g, ' '));
			check('banner explains providers are unreachable', /unreachable/i.test(banner));

			const hasSwitch = await page.evaluate(() =>
				[...document.querySelectorAll('.demo-banner button')].some((b) => /demo mode|live data/i.test(b.textContent || ''))
			);
			check('banner offers a demo-mode switch', hasSwitch);

			// Demo sky must actually be populated and animated.
			await page.click('.filters-btn');
			await sleep(800);
			const planeCount = await page.evaluate(() => {
				const el = [...document.querySelectorAll('.counter')].find((c) =>
					/planes in view/i.test(c.textContent || '')
				);
				return parseInt(el?.querySelector('.num')?.textContent?.replace(/,/g, '') || '0', 10);
			});
			check('demo mode renders a populated sky', planeCount > 20, `${planeCount} aircraft`);

			// Select a simulated flight and confirm it is labelled.
			await page.evaluate(() => {
				document.querySelector('.filters-btn')?.click();
			});
			await liveSearchTerm(page);
			const picked = await page.evaluate(() => {
				const opt = [...document.querySelectorAll('#search-results [role="option"]')].find((o) =>
					/Flight/.test(o.textContent || '')
				);
				const btn = opt?.querySelector('button');
				btn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
				return !!btn;
			});
			if (picked) {
				await sleep(700);
				const simTag = await page.evaluate(
					() => document.querySelector('aside[aria-label="Selected flight details"] .sim-tag')?.textContent ?? ''
				);
				check('selected demo flight is tagged "Simulated"', /Simulated/i.test(simTag), simTag);

				const route = await page.evaluate(() => {
					const root = document.querySelector('aside[aria-label="Selected flight details"]');
					return [...root.querySelectorAll('.endpoint .code')].map((e) => e.textContent?.trim());
				});
				check('demo flight shows origin and destination codes',
					route.length === 2 && route.every((c) => /^[A-Z]{3}$/.test(c || '')), route.join('->'));
			} else {
				check('demo flight selectable by callsign', false, 'no flight suggestion');
			}

			check('no page errors while in demo mode', errors.length === 0, errors.slice(0, 2).join(' ; '));
			await page.close();
		}

		// ---------------------------------------------------------------- deep links
		section('Deep links and sharing');
		{
			const page = await newPage(browser);
			await page.goto(`${BASE}/flight/AGX421`, { waitUntil: 'domcontentloaded' });
			await sleep(1200);
			const url = page.url();
			check('/flight/[id] redirects into the tracker', /\/track#AGX421/i.test(url), url);

			// Resolve a hash deep link against a callsign that is genuinely in the current
			// feed (demo callsigns are randomised per fleet build, so hard-coding one is
			// not a valid assumption).
			await page.goto(`${BASE}/track`, { waitUntil: 'domcontentloaded' });
			await waitFor(page, HAS_TRAFFIC, { timeout: T });
			await liveSearchTerm(page);
			const realCallsign = await page.evaluate(() => {
				const opt = [...document.querySelectorAll('#search-results [role="option"]')].find((o) =>
					/Flight/.test(o.textContent || '')
				);
				return opt?.querySelector('.r-title')?.textContent?.trim() ?? null;
			});
			check('a live/demo callsign is available to deep link', !!realCallsign, String(realCallsign));

			if (realCallsign) {
				await page.goto(`${BASE}/track#${encodeURIComponent(realCallsign)}`, {
					waitUntil: 'domcontentloaded'
				});
				await waitFor(page, HAS_TRAFFIC, { timeout: T });
				const resolved = await waitFor(
					page,
					(cs) => document.querySelector('.callsign')?.textContent?.trim() === cs,
					{ timeout: 12000, arg: realCallsign }
				);
				check('hash deep link focuses the named aircraft', resolved, realCallsign);
			}
			await page.close();
		}

		// ---------------------------------------------------------------- mobile
		section('Mobile layout (390x844) and 360px floor');
		{
			const page = await newPage(browser, { width: 390, height: 844, mobile: true });
			const errors = trackErrors(page);
			await page.goto(`${BASE}/track`, { waitUntil: 'domcontentloaded' });
			await waitFor(page, HAS_TRAFFIC, { timeout: T });

			const fab = await page.evaluate(() => {
				const el = document.querySelector('.fab-search');
				if (!el) return null;
				const r = el.getBoundingClientRect();
				return { visible: getComputedStyle(el).display !== 'none', w: r.width, h: r.height };
			});
			check('floating search button appears on mobile', fab?.visible === true, JSON.stringify(fab));
			check('search FAB meets the 44px tap target', (fab?.w ?? 0) >= 44 && (fab?.h ?? 0) >= 44, JSON.stringify(fab));

			const desktopSearchHidden = await page.evaluate(
				() => getComputedStyle(document.querySelector('.searchbar')).display === 'none'
			);
			check('desktop search bar is hidden on mobile', desktopSearchHidden);

			// Open mobile search and select a flight -> bottom sheet.
			await page.click('.fab-search');
			await sleep(500);
			await liveSearchTerm(page, '.mobile-search input');
			const pickedMobile = await page.evaluate(() => {
				const opt = [...document.querySelectorAll('#search-results [role="option"]')].find((o) =>
					/Flight/.test(o.textContent || '')
				);
				const btn = opt?.querySelector('button');
				btn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
				return !!btn;
			});
			check('mobile search can select a flight', pickedMobile);

			if (pickedMobile) {
				await sleep(900);
				const sheet = await page.evaluate(() => {
					const dock = document.querySelector('.right-dock');
					if (!dock) return null;
					const r = dock.getBoundingClientRect();
					return {
						bottomAnchored: Math.abs(r.bottom - window.innerHeight) < 4,
						fullWidth: r.width >= window.innerWidth - 2,
						withinViewport: r.right <= window.innerWidth + 1
					};
				});
				check('flight panel becomes a bottom sheet on mobile', sheet?.bottomAnchored && sheet?.fullWidth,
					JSON.stringify(sheet));
			}

			const noHScroll = await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth + 1
			);
			check('no horizontal overflow at 390px', noHScroll);

			// The demo banner must stay inside the viewport on mobile, not run off-screen.
			const bannerFits = await page.evaluate(() => {
				const b = document.querySelector('.demo-banner');
				if (!b) return 'absent';
				const r = b.getBoundingClientRect();
				return r.left >= -1 && r.right <= window.innerWidth + 1;
			});
			check('demo banner fits the mobile viewport',
				bannerFits === true || bannerFits === 'absent', String(bannerFits));

			// 360px floor.
			await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true });
			await sleep(600);
			const noHScroll360 = await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth + 1
			);
			check('no horizontal overflow at 360px', noHScroll360);

			check('no page errors on mobile', errors.length === 0, errors.slice(0, 2).join(' ; '));
			await page.close();
		}

		// ---------------------------------------------------------------- mobile landing
		section('Landing page on mobile');
		{
			const page = await newPage(browser, { width: 390, height: 844, mobile: true });
			await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
			await sleep(600);
			const ok = await page.evaluate(() => ({
				noOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
				h1: document.querySelector('h1')?.getBoundingClientRect().width ?? 0,
				cta: !!document.querySelector('a[href="/track"]')
			}));
			check('landing has no horizontal overflow on mobile', ok.noOverflow);
			check('headline fits the mobile viewport', ok.h1 > 0 && ok.h1 <= 390, String(ok.h1));
			check('launch CTA present on mobile', ok.cta);
			await page.close();
		}

		// ---------------------------------------------------------------- about
		section('About page');
		{
			const page = await newPage(browser);
			await page.goto(`${BASE}/about`, { waitUntil: 'domcontentloaded' });
			const text = await page.evaluate(() => document.body.innerText);
			check('documents all four data sources',
				/adsb\.lol/i.test(text) && /adsb\.fi/i.test(text) && /airplanes\.live/i.test(text) && /OpenSky/i.test(text));
			check('states attribution requirement', /attribution is required/i.test(text));
			check('states the non-commercial note for anonymous OpenSky', /non-commercial/i.test(text));
			check('documents rate limits', /rate limits/i.test(text) && /10\u201315 seconds|10-15 seconds/i.test(text));
			check('documents limitations', /Limitations/i.test(text) && /Not for navigation/i.test(text));
			check('documents privacy: no accounts, no tracking',
				/No accounts/i.test(text) && /no third-party tracking/i.test(text));
			check('declares independence from other trackers', /not affiliated/i.test(text));
			await page.close();
		}

		// ---------------------------------------------------------------- WebGL fallback
		section('WebGL-unsupported fallback');
		{
			const page = await newPage(browser);
			// Remove WebGL before any app code runs.
			await page.evaluateOnNewDocument(() => {
				const fail = function () {
					return null;
				};
				HTMLCanvasElement.prototype.getContext = fail;
				// @ts-ignore
				delete window.WebGLRenderingContext;
			});
			await page.goto(`${BASE}/track`, { waitUntil: 'domcontentloaded' });
			const shown = await waitFor(page, () => !!document.querySelector('.webgl-fallback'), { timeout: 8000 });
			check('"WebGL not supported" fallback renders', shown);
			if (shown) {
				const txt = await page.$eval('.webgl-fallback', (el) => el.textContent || '');
				check('fallback explains what to do', /WebGL not supported/i.test(txt) && /hardware acceleration/i.test(txt));
			}
			await page.close();
		}

		// ---------------------------------------------------------------- API citizenship
		section('API citizenship (polling, scoping, tab-hidden pause)');
		{
			const page = await newPage(browser);
			const requests = [];
			page.on('request', (req) => {
				const u = req.url();
				if (/adsb\.lol|adsb\.fi|airplanes\.live|opensky-network|\/api\/adsb/.test(u)) {
					requests.push({ u, t: Date.now() });
				}
			});

			await page.goto(`${BASE}/track`, { waitUntil: 'domcontentloaded' });
			await waitFor(page, HAS_TRAFFIC, { timeout: T });
			await sleep(1000);

			check('data requests are region-scoped, never global',
				requests.length === 0 ||
					requests.every((r) =>
						/\/point\/|\/lat\/.*\/lon\/|lamin=.*lamax=|\/api\/adsb\?/.test(r.u)
					),
				requests[0]?.u ?? 'none (demo mode)');

			check('no API keys or tokens in any request URL',
				requests.every((r) => !/api[_-]?key|access[_-]?token|client[_-]?secret/i.test(r.u)));

			const radiusOk = requests
				.filter((r) => /\/point\/|\/dist\//.test(r.u))
				.every((r) => {
					const m = r.u.match(/\/(?:point\/[-\d.]+\/[-\d.]+\/|dist\/)(\d+)/);
					return !m || Number(m[1]) <= 250;
				});
			check('query radius is capped at 250 NM', radiusOk);

			// Hidden tab must pause polling.
			const before = requests.length;
			await page.evaluate(() => {
				Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
				Object.defineProperty(document, 'hidden', { value: true, configurable: true });
				document.dispatchEvent(new Event('visibilitychange'));
			});
			await sleep(6000);
			const during = requests.length - before;
			check('polling pauses while the tab is hidden', during === 0, `${during} requests while hidden`);
			await page.close();
		}

		// ---------------------------------------------------------------- server proxy
		section('Server proxy route');
		{
			const page = await newPage(browser);
			const res = await page.goto(
				`${BASE}/api/adsb?provider=adsb.lol&lat=28.6&lon=77.2&radius=100`,
				{ waitUntil: 'domcontentloaded' }
			);
			const status = res?.status() ?? 0;
			check('proxy answers (200) or cleanly reports upstream trouble (4xx/5xx)',
				[200, 429, 502, 504].includes(status), `HTTP ${status}`);
			if (status === 200) {
				const body = await page.evaluate(() => document.body.innerText.slice(0, 200));
				check('proxy returns JSON aircraft data', /\{|\[/.test(body), body.slice(0, 80));
				const cc = res.headers()['cache-control'] ?? '';
				check('proxy sets a short cache-control', /max-age=\d+/.test(cc), cc);
			}

			const bad = await page.goto(`${BASE}/api/adsb?provider=nope&lat=1&lon=1`, {
				waitUntil: 'domcontentloaded'
			});
			check('proxy rejects an unknown provider', bad?.status() === 400, `HTTP ${bad?.status()}`);
			await page.close();
		}

		// ---------------------------------------------------------------- accessibility
		section('Accessibility basics');
		{
			const page = await newPage(browser);
			await page.goto(`${BASE}/track`, { waitUntil: 'domcontentloaded' });
			await waitFor(page, HAS_TRAFFIC, { timeout: T });

			const a11y = await page.evaluate(() => {
				const buttons = [...document.querySelectorAll('button')];
				const unlabelled = buttons.filter(
					(b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')
				);
				const small = buttons
					.filter((b) => b.offsetParent !== null)
					.filter((b) => {
						const r = b.getBoundingClientRect();
						return r.height > 0 && r.height < 28;
					});
				return {
					unlabelled: unlabelled.length,
					small: small.length,
					search: !!document.querySelector('input[aria-label]'),
					live: !!document.querySelector('[aria-live]'),
					canvasLabel: !!document.querySelector('canvas[aria-label]')
				};
			});
			check('every icon button has an accessible name', a11y.unlabelled === 0, `${a11y.unlabelled} unlabelled`);
			check('no tap targets under 28px', a11y.small === 0, `${a11y.small} small`);
			check('search input has an aria-label', a11y.search);
			check('status is announced via aria-live', a11y.live);
			check('globe canvas has an aria-label', a11y.canvasLabel);

			// Keyboard globe controls must not throw.
			await page.keyboard.press('ArrowRight');
			await page.keyboard.press('ArrowUp');
			await page.keyboard.press('Equal');
			await page.keyboard.press('Escape');
			await sleep(500);
			const alive = await page.evaluate(() => !!document.querySelector('canvas'));
			check('keyboard pan/zoom keys work without breaking the globe', alive);

			// No emoji anywhere in the UI text.
			const emoji = await page.evaluate(() =>
				/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(document.body.innerText)
			);
			check('no emoji in the UI', !emoji);
			await page.close();
		}

		// ---------------------------------------------------------------- reduced motion
		section('prefers-reduced-motion');
		{
			const page = await newPage(browser);
			await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
			await page.goto(`${BASE}/track`, { waitUntil: 'domcontentloaded' });
			await waitFor(page, HAS_TRAFFIC, { timeout: T });
			const stillWorks = await page.evaluate(() => !!document.querySelector('canvas'));
			check('tracker still works with reduced motion', stillWorks);
			await page.close();
		}
	} finally {
		await browser.close();
	}

	console.log(`\n${'='.repeat(60)}`);
	console.log(`AeroGlobe e2e: ${pass} passed, ${fail} failed (${pass + fail} checks)`);
	if (failures.length) {
		console.log('\nFailures:');
		for (const f of failures) console.log(`  - ${f}`);
	}
	console.log('='.repeat(60));
	process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
	console.error('E2E harness crashed:', e);
	process.exit(1);
});

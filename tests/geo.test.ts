// Geodesy, normalisation, demo-fleet and search unit tests.
import { describe, expect, it } from 'vitest';
import {
	angleDelta,
	bearingDeg,
	destinationPoint,
	greatCirclePath,
	haversineKm,
	interpolateGreatCircle,
	ktToKmh,
	ftToM,
	compassLabel
} from '../src/lib/geo';
import { normaliseOpenSky, normaliseReadsb } from '../src/lib/providers/normalise';
import { demoAircraft } from '../src/lib/providers/demo';
import { normaliseRegion, regionToBBox, SOURCES } from '../src/lib/providers/sources';
import { AIRPORTS, AIRPORT_BY_IATA } from '../src/lib/data/airports';
import {
	altitudeToRadius,
	altitudeTextCss,
	contrastRatio,
	GLOBE_RADIUS,
	subsolarPoint
} from '../src/lib/three/helpers';
import { search } from '../src/lib/search';

describe('geo', () => {
	it('computes known great-circle distances', () => {
		// London Heathrow -> New York JFK is ~5555 km.
		expect(haversineKm(51.47, -0.4543, 40.6413, -73.7781)).toBeGreaterThan(5500);
		expect(haversineKm(51.47, -0.4543, 40.6413, -73.7781)).toBeLessThan(5600);
		// Delhi -> Mumbai is ~1150 km.
		const d = haversineKm(28.5665, 77.1031, 19.0887, 72.8679);
		expect(d).toBeGreaterThan(1100);
		expect(d).toBeLessThan(1200);
	});

	it('returns zero distance for identical points', () => {
		expect(haversineKm(10, 20, 10, 20)).toBeCloseTo(0, 6);
	});

	it('computes bearings', () => {
		expect(bearingDeg(0, 0, 10, 0)).toBeCloseTo(0, 1); // due north
		expect(bearingDeg(0, 0, 0, 10)).toBeCloseTo(90, 1); // due east
		expect(bearingDeg(0, 0, -10, 0)).toBeCloseTo(180, 1); // due south
	});

	it('round-trips destinationPoint against haversine', () => {
		const [lat, lon] = destinationPoint(28.6, 77.2, 90, 500);
		expect(haversineKm(28.6, 77.2, lat, lon)).toBeCloseTo(500, 0);
	});

	it('interpolates endpoints exactly', () => {
		const a: [number, number] = [51.47, -0.4543];
		const b: [number, number] = [40.6413, -73.7781];
		const start = interpolateGreatCircle(a[0], a[1], b[0], b[1], 0);
		const end = interpolateGreatCircle(a[0], a[1], b[0], b[1], 1);
		expect(start[0]).toBeCloseTo(a[0], 4);
		expect(end[1]).toBeCloseTo(b[1], 4);
	});

	it('keeps the midpoint on the great circle', () => {
		const mid = interpolateGreatCircle(0, 0, 0, 90, 0.5);
		expect(mid[0]).toBeCloseTo(0, 4);
		expect(mid[1]).toBeCloseTo(45, 4);
	});

	it('samples a path of the requested length', () => {
		expect(greatCirclePath(0, 0, 10, 10, 32)).toHaveLength(33);
	});

	it('computes shortest angle deltas across the 0/360 seam', () => {
		expect(angleDelta(350, 10)).toBeCloseTo(20, 6);
		expect(angleDelta(10, 350)).toBeCloseTo(-20, 6);
	});

	it('converts units', () => {
		expect(ktToKmh(100)).toBeCloseTo(185.2, 3);
		expect(ftToM(1000)).toBeCloseTo(304.8, 1);
	});

	it('labels the compass', () => {
		expect(compassLabel(0)).toBe('N');
		expect(compassLabel(90)).toBe('E');
		expect(compassLabel(359)).toBe('N');
	});
});

describe('provider normalisation', () => {
	it('normalises a readsb/tar1090 payload', () => {
		const payload = {
			ac: [
				{
					hex: '896609',
					flight: 'FDB1134 ',
					r: 'A6-FKS',
					t: 'B38M',
					alt_baro: 34000,
					gs: 397.3,
					track: 283.09,
					baro_rate: 0,
					squawk: '2503',
					category: 'A3',
					lat: 28.4,
					lon: 77.1,
					seen_pos: 1.2
				}
			]
		};
		const [ac] = normaliseReadsb(payload);
		expect(ac.hex).toBe('896609');
		expect(ac.callsign).toBe('FDB1134');
		expect(ac.altFt).toBe(34000);
		expect(ac.registration).toBe('A6-FKS');
		expect(ac.category).toBe('airliner');
		expect(ac.onGround).toBe(false);
	});

	it('treats alt_baro "ground" as on-ground at zero feet', () => {
		const [ac] = normaliseReadsb({ aircraft: [{ hex: 'abc123', lat: 1, lon: 2, alt_baro: 'ground' }] });
		expect(ac.onGround).toBe(true);
		expect(ac.altFt).toBe(0);
	});

	it('skips records with no position', () => {
		expect(normaliseReadsb({ ac: [{ hex: 'abc123', alt_baro: 1000 }] })).toHaveLength(0);
	});

	it('tolerates garbage payloads', () => {
		expect(normaliseReadsb(null)).toEqual([]);
		expect(normaliseReadsb({ error: 'rate limited' })).toEqual([]);
		expect(normaliseOpenSky(undefined)).toEqual([]);
	});

	it('normalises OpenSky state vectors and converts units', () => {
		const payload = {
			time: 1792565420,
			states: [
				['801657', 'AIC3GN  ', 'India', 1792565419, 1792565419, 76.4807, 27.7446, 8412.48, false, 195.76, 213.86, 5.85, null, 8801.1, null, false, 0]
			]
		};
		const [ac] = normaliseOpenSky(payload);
		expect(ac.hex).toBe('801657');
		expect(ac.callsign).toBe('AIC3GN');
		expect(ac.lat).toBeCloseTo(27.7446, 4);
		expect(ac.lon).toBeCloseTo(76.4807, 4);
		// 8801.1 m geo altitude -> ~28,875 ft
		expect(ac.altFt).toBeGreaterThan(28000);
		expect(ac.altFt).toBeLessThan(29500);
		// 195.76 m/s -> ~380 kt
		expect(ac.gsKt).toBeGreaterThan(370);
		expect(ac.gsKt).toBeLessThan(390);
		expect(ac.heading).toBeCloseTo(213.86, 2);
	});
});

describe('region scoping (API citizenship)', () => {
	it('clamps the radius so we never ask for the whole world', () => {
		expect(normaliseRegion({ lat: 0, lon: 0, radiusNm: 9000 }).radiusNm).toBe(250);
		expect(normaliseRegion({ lat: 0, lon: 0, radiusNm: 1 }).radiusNm).toBe(25);
	});

	it('wraps longitude into -180..180', () => {
		expect(normaliseRegion({ lat: 0, lon: 190, radiusNm: 50 }).lon).toBeCloseTo(-170, 6);
	});

	it('builds a bbox that contains its centre', () => {
		const b = regionToBBox({ lat: 28.6, lon: 77.2, radiusNm: 150 });
		expect(b.south).toBeLessThan(28.6);
		expect(b.north).toBeGreaterThan(28.6);
		expect(b.west).toBeLessThan(77.2);
		expect(b.east).toBeGreaterThan(77.2);
	});

	it('builds region-scoped URLs for every provider, with no API key', () => {
		for (const s of SOURCES) {
			const url = s.url({ lat: 28.6, lon: 77.2, radiusNm: 150 });
			expect(url).toMatch(/^https:\/\//);
			expect(url.toLowerCase()).not.toMatch(/api[_-]?key|token|secret/);
		}
	});
});

describe('demo mode', () => {
	const fleet = demoAircraft();

	it('produces a believable fleet size', () => {
		expect(fleet.length).toBeGreaterThan(40);
		expect(fleet.length).toBeLessThanOrEqual(60);
	});

	it('gives every aircraft valid, labelled data', () => {
		for (const ac of fleet) {
			expect(ac.lat).toBeGreaterThanOrEqual(-90);
			expect(ac.lat).toBeLessThanOrEqual(90);
			expect(ac.lon).toBeGreaterThanOrEqual(-180);
			expect(ac.lon).toBeLessThanOrEqual(180);
			expect(ac.altFt).toBeGreaterThanOrEqual(0);
			expect(ac.altFt).toBeLessThan(45000);
			expect(ac.gsKt).toBeGreaterThan(0);
			expect(ac.heading).toBeGreaterThanOrEqual(0);
			expect(ac.heading).toBeLessThanOrEqual(360);
			expect(ac.origin).toBeTruthy();
			expect(ac.destination).toBeTruthy();
			expect(ac.hex).toMatch(/^[0-9a-f]{6}$/);
		}
	});

	it('covers India, Europe, the US and East Asia', () => {
		const codes = new Set(fleet.flatMap((a) => [a.origin!, a.destination!]));
		expect([...codes].some((c) => ['DEL', 'BOM', 'BLR', 'MAA', 'HYD', 'CCU'].includes(c))).toBe(true);
		expect([...codes].some((c) => ['LHR', 'CDG', 'AMS', 'FRA', 'MAD'].includes(c))).toBe(true);
		expect([...codes].some((c) => ['JFK', 'LAX', 'ORD', 'ATL', 'SFO'].includes(c))).toBe(true);
		expect([...codes].some((c) => ['HND', 'ICN', 'HKG', 'PVG', 'NRT'].includes(c))).toBe(true);
	});

	it('advances positions over time', () => {
		const t0 = Date.now();
		const a = demoAircraft(t0);
		const b = demoAircraft(t0 + 120_000);
		const byHex = new Map(b.map((x) => [x.hex, x]));
		const moved = a.filter((x) => {
			const later = byHex.get(x.hex);
			return later && haversineKm(x.lat, x.lon, later.lat, later.lon) > 1;
		});
		expect(moved.length).toBeGreaterThan(a.length * 0.8);
	});

	it('uses only fictional carrier callsign prefixes', () => {
		// Real-world prefixes that must never appear in our invented fleet.
		const real = ['AIC', 'IGO', 'BAW', 'UAL', 'DAL', 'AAL', 'UAE', 'QTR', 'SIA', 'DLH'];
		for (const ac of fleet) {
			expect(real).not.toContain(ac.callsign.slice(0, 3));
		}
	});
});

describe('airport dataset', () => {
	it('bundles a globally-spread set of major airports', () => {
		expect(AIRPORTS.length).toBeGreaterThan(300);
		const countries = new Set(AIRPORTS.map((a) => a.country));
		expect(countries.size).toBeGreaterThan(100);
	});

	it('has valid coordinates and IATA codes', () => {
		for (const a of AIRPORTS) {
			expect(a.iata).toMatch(/^[A-Z0-9]{3}$/);
			expect(Math.abs(a.lat)).toBeLessThanOrEqual(90);
			expect(Math.abs(a.lon)).toBeLessThanOrEqual(180);
		}
	});

	it('includes the hubs the demo routes depend on', () => {
		for (const code of ['DEL', 'BOM', 'LHR', 'JFK', 'HND', 'DXB', 'SIN', 'SYD']) {
			expect(AIRPORT_BY_IATA.get(code)).toBeTruthy();
		}
	});
});

describe('3D helpers', () => {
	it('maps altitude onto a visible shell above the globe', () => {
		expect(altitudeToRadius(0)).toBeGreaterThan(GLOBE_RADIUS);
		expect(altitudeToRadius(40000)).toBeGreaterThan(altitudeToRadius(10000));
		expect(altitudeToRadius(45000)).toBeLessThan(GLOBE_RADIUS + 15);
	});

	it('puts the subsolar point in the tropics', () => {
		const { lat, lon } = subsolarPoint(new Date('2026-06-21T12:00:00Z'));
		expect(Math.abs(lat)).toBeLessThan(23.5);
		expect(lat).toBeGreaterThan(20); // northern solstice
		expect(Math.abs(lon)).toBeLessThanOrEqual(180);
	});

	it('computes WCAG contrast ratios correctly', () => {
		// Known anchors: black on white is 21:1, white on white is 1:1.
		expect(contrastRatio('000000', 'ffffff')).toBeCloseTo(21, 1);
		expect(contrastRatio('ffffff', 'ffffff')).toBeCloseTo(1, 3);
		// The raw cyan accent is unreadable on a light panel - hence the darkening pass.
		expect(contrastRatio('38d0ff', 'f4f8ff')).toBeLessThan(2);
	});

	it('darkens altitude text colours to WCAG AA on light panels', () => {
		for (const ft of [0, 5000, 12000, 25000, 34000, 41000]) {
			const dark = altitudeTextCss(ft, 'dark').slice(1);
			const light = altitudeTextCss(ft, 'light').slice(1);
			// Dark panels keep the vivid instrument colour.
			expect(contrastRatio(dark, '0d1527')).toBeGreaterThan(3);
			// Light panels must clear 4.5:1 for normal-weight text.
			expect(contrastRatio(light, 'f4f8ff')).toBeGreaterThanOrEqual(4.5);
		}
	});

	it('keeps the subsolar longitude stable across a day', () => {
		const { lat, lon } = subsolarPoint(new Date('2026-06-21T12:00:00Z'));
		expect(Math.abs(lat)).toBeLessThan(23.5);
		expect(lat).toBeGreaterThan(20); // northern solstice
		expect(Math.abs(lon)).toBeLessThanOrEqual(180);
	});
});

describe('search', () => {
	const fakeAircraft = [
		{
			hex: 'a1b2c3',
			callsign: 'AGX421',
			registration: 'VT-ABC',
			aircraftType: 'A320neo',
			altFt: 32000,
			dLat: 0,
			dLon: 0,
			dAltFt: 32000,
			dHeading: 0,
			lat: 0,
			lon: 0,
			gsKt: 440,
			heading: 0,
			vertRate: 0,
			onGround: false,
			category: 'airliner' as const,
			seen: Date.now(),
			fixAt: Date.now(),
			trail: []
		}
	];

	it('finds aircraft by callsign and hex', () => {
		expect(search('AGX', fakeAircraft)[0]).toMatchObject({ kind: 'aircraft', hex: 'a1b2c3' });
		expect(search('a1b2c3', fakeAircraft)[0]).toMatchObject({ kind: 'aircraft' });
	});

	it('finds airports by IATA code and city', () => {
		const byCode = search('DEL', []);
		expect(byCode[0].kind).toBe('airport');
		expect(search('Mumbai', []).length).toBeGreaterThan(0);
	});

	it('returns nothing for an empty query', () => {
		expect(search('', fakeAircraft)).toEqual([]);
	});

	it('respects the result limit', () => {
		expect(search('a', fakeAircraft, 5).length).toBeLessThanOrEqual(5);
	});
});

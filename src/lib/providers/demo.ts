// Simulated demo fleet - the final, always-available link in the provider chain.
//
// ~60 aircraft fly real great-circle routes between real airports (India, Europe, US,
// East Asia, Middle East, Oceania, South America) with a believable vertical profile:
// takeoff climb -> cruise -> descent -> landing. Everything is deterministic from a seed
// plus wall-clock time, so a reload resumes a plausible sky rather than resetting it.
//
// Airline names/codes used here are ORIGINAL inventions for this demo. They are not real
// carriers and are not scraped from any flight-tracking service.

import type { Aircraft } from '../types';
import { AIRPORT_BY_IATA } from '../data/airports';
import { bearingDeg, haversineKm, interpolateGreatCircle } from '../geo';

/** Fictional demo carriers: ICAO-style prefix + name + typical fleet. */
const CARRIERS = [
	{ code: 'AGX', name: 'AeroGlobe Express', types: ['A320neo', 'B737 MAX 8'] },
	{ code: 'SKQ', name: 'Skyquill Airways', types: ['A321neo', 'B738'] },
	{ code: 'NVT', name: 'Novanet Air', types: ['B787-9', 'A350-900'] },
	{ code: 'ZPH', name: 'Zephyr Atlantic', types: ['A330-300', 'B777-300ER'] },
	{ code: 'MNS', name: 'Monsoon Air', types: ['A320', 'ATR 72-600'] },
	{ code: 'HLX', name: 'Helix Cargo', types: ['B767-300F', 'A330-200F'] },
	{ code: 'ORB', name: 'Orbital Connect', types: ['E190', 'A220-300'] },
	{ code: 'PLR', name: 'Polaris Pacific', types: ['B747-8F', 'B777F'] }
];

/** Route pairs by IATA. Chosen to cover every populated continent on the globe. */
const ROUTES: [string, string][] = [
	// India <-> world
	['DEL', 'DXB'], ['BOM', 'LHR'], ['BLR', 'SIN'], ['MAA', 'KUL'], ['HYD', 'DOH'],
	['CCU', 'BKK'], ['DEL', 'BOM'], ['BLR', 'DEL'], ['COK', 'AUH'], ['AMD', 'DXB'],
	['DEL', 'FRA'], ['BOM', 'SIN'], ['MAA', 'CMB'], ['DEL', 'KTM'], ['BLR', 'BOM'],
	// Europe
	['LHR', 'JFK'], ['CDG', 'DXB'], ['AMS', 'ICN'], ['FRA', 'PEK'], ['MAD', 'GRU'],
	['IST', 'DEL'], ['MUC', 'FCO'], ['BCN', 'LGW'], ['ZRH', 'SIN'], ['VIE', 'HND'],
	['CPH', 'ARN'], ['DUB', 'BOS'], ['LIS', 'EZE'], ['ATH', 'LHR'], ['WAW', 'AMS'],
	// North America
	['JFK', 'LAX'], ['ORD', 'SFO'], ['ATL', 'DEN'], ['DFW', 'SEA'], ['YYZ', 'LHR'],
	['MIA', 'BOG'], ['EWR', 'FRA'], ['LAX', 'HND'], ['SFO', 'SIN'], ['MEX', 'MAD'],
	// East / South-East Asia
	['HND', 'SIN'], ['ICN', 'BKK'], ['HKG', 'SYD'], ['PVG', 'LAX'], ['TPE', 'NRT'],
	['SIN', 'CGK'], ['BKK', 'DMK'], ['KUL', 'HKG'], ['CAN', 'DEL'], ['PEK', 'KIX'],
	// Middle East, Africa, Oceania, South America
	['DXB', 'JNB'], ['DOH', 'NBO'], ['AUH', 'SYD'], ['RUH', 'CAI'], ['JED', 'IST'],
	['JNB', 'CPT'], ['LOS', 'CMN'], ['SYD', 'AKL'], ['MEL', 'PER'], ['BNE', 'SIN'],
	['GRU', 'SCL'], ['GIG', 'LIM'], ['EZE', 'MIA'], ['BOG', 'MEX'], ['SCL', 'MAD']
];

interface DemoFlight {
	hex: string;
	callsign: string;
	registration: string;
	aircraftType: string;
	origin: string;
	destination: string;
	oLat: number;
	oLon: number;
	dLat: number;
	dLon: number;
	distKm: number;
	cruiseKt: number;
	cruiseFt: number;
	/** Seconds for the whole flight. */
	durationS: number;
	/** Epoch ms when this flight departed (may be in the past). */
	departedAt: number;
	squawk: string;
}

/** Deterministic PRNG (mulberry32) so the fleet is identical across reloads/SSR. */
function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const FLEET_SIZE = 60;
let fleet: DemoFlight[] | null = null;

function buildFleet(): DemoFlight[] {
	const rand = rng(20240617);
	const out: DemoFlight[] = [];
	const now = Date.now();

	for (let i = 0; i < FLEET_SIZE; i++) {
		const [o, d] = ROUTES[i % ROUTES.length];
		const a = AIRPORT_BY_IATA.get(o);
		const b = AIRPORT_BY_IATA.get(d);
		if (!a || !b) continue;

		const carrier = CARRIERS[Math.floor(rand() * CARRIERS.length)];
		const distKm = haversineKm(a.lat, a.lon, b.lat, b.lon);
		// Long haul cruises higher and slightly faster.
		const cruiseFt = distKm > 4000 ? 36000 + Math.floor(rand() * 6) * 1000 : 28000 + Math.floor(rand() * 8) * 1000;
		const cruiseKt = distKm > 4000 ? 460 + Math.round(rand() * 50) : 400 + Math.round(rand() * 60);
		// Block time = cruise leg + ~22 min of climb/descent overhead.
		const durationS = (distKm / (cruiseKt * 1.852)) * 3600 + 1320;

		out.push({
			hex: (0xa00000 + Math.floor(rand() * 0x5ffffe)).toString(16).padStart(6, '0'),
			callsign: `${carrier.code}${100 + Math.floor(rand() * 899)}`,
			registration: `VT-${String.fromCharCode(65 + Math.floor(rand() * 26))}${String.fromCharCode(65 + Math.floor(rand() * 26))}${String.fromCharCode(65 + Math.floor(rand() * 26))}`,
			aircraftType: carrier.types[Math.floor(rand() * carrier.types.length)],
			origin: o,
			destination: d,
			oLat: a.lat,
			oLon: a.lon,
			dLat: b.lat,
			dLon: b.lon,
			distKm,
			cruiseKt,
			cruiseFt,
			durationS,
			// Stagger departures across the whole block time so the sky is mid-flight at t=0.
			departedAt: now - rand() * durationS * 1000,
			squawk: String(1000 + Math.floor(rand() * 6000))
		});
	}
	return out;
}

/** Vertical profile: climb for the first 8%, descend over the last 12%, cruise between. */
function verticalProfile(f: DemoFlight, p: number) {
	const CLIMB_END = 0.08;
	const DESCENT_START = 0.88;
	if (p < CLIMB_END) {
		const k = p / CLIMB_END;
		return {
			altFt: Math.round(f.cruiseFt * Math.sin((k * Math.PI) / 2)),
			gsKt: Math.round(160 + (f.cruiseKt - 160) * k),
			vertRate: Math.round(2400 * (1 - k * 0.6)),
			phase: 'climb' as const
		};
	}
	if (p > DESCENT_START) {
		const k = (p - DESCENT_START) / (1 - DESCENT_START);
		return {
			altFt: Math.round(f.cruiseFt * Math.cos((k * Math.PI) / 2)),
			gsKt: Math.round(f.cruiseKt - (f.cruiseKt - 150) * k),
			vertRate: -Math.round(1900 * (0.5 + k * 0.5)),
			phase: 'descent' as const
		};
	}
	// Gentle cruise step-climb + small speed variation, deterministic from progress.
	const wob = Math.sin(p * 37.1 + f.cruiseKt);
	return {
		altFt: Math.round(f.cruiseFt + wob * 400),
		gsKt: Math.round(f.cruiseKt + wob * 12),
		vertRate: Math.round(wob * 120),
		phase: 'cruise' as const
	};
}

/**
 * Current simulated fleet state. Flights loop: when one lands, it departs again
 * after a short turnaround so the demo sky is never empty.
 */
export function demoAircraft(now = Date.now()): Aircraft[] {
	if (!fleet) fleet = buildFleet();
	const out: Aircraft[] = [];

	for (const f of fleet) {
		const cycleMs = (f.durationS + 1800) * 1000; // + 30 min turnaround
		let elapsed = (now - f.departedAt) % cycleMs;
		if (elapsed < 0) elapsed += cycleMs;

		const p = elapsed / (f.durationS * 1000);
		if (p > 1) continue; // currently on the ground between cycles

		const [lat, lon] = interpolateGreatCircle(f.oLat, f.oLon, f.dLat, f.dLon, p);
		// Heading from a point slightly ahead, so it tracks the great circle's curvature.
		const [aLat, aLon] = interpolateGreatCircle(f.oLat, f.oLon, f.dLat, f.dLon, Math.min(1, p + 0.002));
		const v = verticalProfile(f, p);

		out.push({
			hex: f.hex,
			callsign: f.callsign,
			lat,
			lon,
			altFt: v.altFt,
			gsKt: v.gsKt,
			heading: bearingDeg(lat, lon, aLat, aLon),
			vertRate: v.vertRate,
			onGround: false,
			squawk: f.squawk,
			registration: f.registration,
			aircraftType: f.aircraftType,
			category: f.aircraftType.startsWith('ATR') || f.aircraftType.startsWith('E1') ? 'light' : 'airliner',
			origin: f.origin,
			destination: f.destination,
			progress: p,
			seen: now
		});
	}
	return out;
}

/** Distance remaining + ETA for the flight panel, demo flights only. */
export function demoRouteFor(hex: string): { origin: string; destination: string } | null {
	if (!fleet) fleet = buildFleet();
	const f = fleet.find((x) => x.hex === hex);
	return f ? { origin: f.origin, destination: f.destination } : null;
}

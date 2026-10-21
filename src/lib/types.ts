// Shared aircraft/state types for AeroGlobe.
// One normalised Aircraft shape is produced by every provider (airplanes.live,
// adsb.lol, adsb.fi, OpenSky, demo) so the 3D layer never sees provider quirks.

export type ProviderId = 'airplanes.live' | 'adsb.lol' | 'adsb.fi' | 'opensky' | 'demo';

export type ProviderMode = 'live' | 'demo' | 'connecting' | 'error';

/** Rough category used by the filter panel. Derived, never authoritative. */
export type AircraftCategory = 'airliner' | 'light' | 'heli' | 'military' | 'unknown';

export interface Aircraft {
	/** ICAO24 transponder hex, lowercase. Stable primary key. */
	hex: string;
	callsign: string;
	lat: number;
	lon: number;
	/** Barometric/geometric altitude in feet. 0 == on ground. */
	altFt: number;
	/** Ground speed in knots. */
	gsKt: number;
	/** True track over ground in degrees (0 = north). */
	heading: number;
	/** Vertical rate in feet per minute. */
	vertRate: number;
	onGround: boolean;
	squawk?: string;
	registration?: string;
	aircraftType?: string;
	category: AircraftCategory;
	/** Origin/destination IATA codes. Only known for demo flights. */
	origin?: string;
	destination?: string;
	/** 0..1 progress along the planned route. Only known for demo flights. */
	progress?: number;
	/** Epoch ms of the last position fix. */
	seen: number;
}

export interface ProviderResult {
	provider: ProviderId;
	aircraft: Aircraft[];
	/** Where the data physically came from, for the status chip. */
	via: 'browser' | 'proxy' | 'simulated';
}

export interface BBox {
	south: number;
	north: number;
	west: number;
	east: number;
}

/** A single position sample kept for the altitude-over-time graph and trails. */
export interface TrackPoint {
	t: number;
	lat: number;
	lon: number;
	altFt: number;
	gsKt: number;
}

export type UnitSystem = 'aviation' | 'metric';

export interface Filters {
	altMinFt: number;
	altMaxFt: number;
	speedMinKt: number;
	speedMaxKt: number;
	categories: Record<AircraftCategory, boolean>;
	airborneOnly: boolean;
	showTrails: boolean;
	showAirports: boolean;
}

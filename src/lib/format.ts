// Display formatting. Unit-system aware so the panel can switch between
// aviation units (ft / kt) and metric (m / km/h).

import type { UnitSystem } from './types';
import { ftToM, ktToKmh } from './geo';

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export const fmtInt = (n: number) => nf0.format(Math.round(n));

export function fmtAltitude(altFt: number, units: UnitSystem): { value: string; unit: string } {
	return units === 'metric'
		? { value: fmtInt(ftToM(altFt)), unit: 'm' }
		: { value: fmtInt(altFt), unit: 'ft' };
}

export function fmtSpeed(gsKt: number, units: UnitSystem): { value: string; unit: string } {
	return units === 'metric'
		? { value: fmtInt(ktToKmh(gsKt)), unit: 'km/h' }
		: { value: fmtInt(gsKt), unit: 'kt' };
}

export function fmtVerticalRate(fpm: number, units: UnitSystem): { value: string; unit: string } {
	if (units === 'metric') {
		const ms = fpm / 3.280839895 / 60;
		return { value: `${ms >= 0 ? '+' : ''}${nf1.format(ms)}`, unit: 'm/s' };
	}
	return { value: `${fpm >= 0 ? '+' : ''}${fmtInt(fpm)}`, unit: 'ft/min' };
}

/** Both unit systems at once, for the secondary line on data tiles. */
export function fmtAltitudeBoth(altFt: number): string {
	return `${fmtInt(altFt)} ft / ${fmtInt(ftToM(altFt))} m`;
}

export function fmtSpeedBoth(gsKt: number): string {
	return `${fmtInt(gsKt)} kt / ${fmtInt(ktToKmh(gsKt))} km/h`;
}

export function fmtHeading(deg: number): string {
	return `${String(Math.round(((deg % 360) + 360) % 360)).padStart(3, '0')}\u00B0`;
}

export function fmtAgo(epochMs: number, now = Date.now()): string {
	const s = Math.max(0, Math.round((now - epochMs) / 1000));
	if (s < 5) return 'just now';
	if (s < 60) return `${s}s ago`;
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m ago`;
	return `${Math.round(m / 60)}h ago`;
}

export function fmtCoord(lat: number, lon: number): string {
	const ns = lat >= 0 ? 'N' : 'S';
	const ew = lon >= 0 ? 'E' : 'W';
	return `${Math.abs(lat).toFixed(2)}\u00B0${ns}  ${Math.abs(lon).toFixed(2)}\u00B0${ew}`;
}

/** Flight phase from vertical rate, used for the panel's status word. */
export function flightPhase(altFt: number, vertRate: number, onGround: boolean): string {
	if (onGround || altFt < 50) return 'On ground';
	if (vertRate > 300) return 'Climbing';
	if (vertRate < -300) return 'Descending';
	return 'Cruising';
}

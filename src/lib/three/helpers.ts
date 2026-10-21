// Three.js helpers shared by the globe: coordinate mapping, altitude colour scale,
// sun position for day/night shading, and the low-poly airplane geometry.

import * as THREE from 'three';
import { toRad } from '../geo';

/** Globe radius in scene units. All other scales derive from this. */
export const GLOBE_RADIUS = 100;

/**
 * Altitude exaggeration. Real cruise is ~11 km vs a 6371 km radius (0.17%), which would be
 * invisible, so altitude is mapped onto a visible shell above the surface instead.
 */
export const ALT_SHELL_MIN = 1.2; // ground traffic sits just above the texture
export const ALT_SHELL_MAX = 14; // ~45,000 ft
const ALT_REF_FT = 45000;

export function altitudeToRadius(altFt: number): number {
	const k = Math.min(1, Math.max(0, altFt / ALT_REF_FT));
	// sqrt so low-level traffic separates visibly from the ground.
	return GLOBE_RADIUS + ALT_SHELL_MIN + (ALT_SHELL_MAX - ALT_SHELL_MIN) * Math.sqrt(k);
}

/** lat/lon (deg) + radius -> scene vector. Y-up, lon 0 facing +Z. */
export function latLonToVector3(lat: number, lon: number, radius: number, out = new THREE.Vector3()): THREE.Vector3 {
	const phi = toRad(90 - lat);
	const theta = toRad(lon + 180);
	return out.set(
		-radius * Math.sin(phi) * Math.cos(theta),
		radius * Math.cos(phi),
		radius * Math.sin(phi) * Math.sin(theta)
	);
}

/** Inverse of latLonToVector3, for picking a point on the globe. */
export function vector3ToLatLon(v: THREE.Vector3): [number, number] {
	const r = v.length();
	if (r < 1e-6) return [0, 0];
	const lat = 90 - (Math.acos(v.y / r) * 180) / Math.PI;
	let lon = (Math.atan2(v.z, -v.x) * 180) / Math.PI - 180;
	lon = ((((lon + 180) % 360) + 360) % 360) - 180;
	return [lat, lon];
}

// --- altitude colour scale (low = warm, high = cool) -------------------------

export const ALTITUDE_STOPS: { ft: number; hex: string; label: string }[] = [
	{ ft: 0, hex: '#FF6B3D', label: 'Ground' },
	{ ft: 10000, hex: '#FFB020', label: '10k ft' },
	{ ft: 20000, hex: '#D7E34A', label: '20k ft' },
	{ ft: 30000, hex: '#5BE8C0', label: '30k ft' },
	{ ft: 40000, hex: '#38D0FF', label: '40k ft+' }
];

const STOP_COLORS = ALTITUDE_STOPS.map((s) => new THREE.Color(s.hex));

export function altitudeColor(altFt: number, out = new THREE.Color()): THREE.Color {
	const ft = Math.max(0, altFt);
	for (let i = ALTITUDE_STOPS.length - 1; i >= 0; i--) {
		if (ft >= ALTITUDE_STOPS[i].ft) {
			if (i === ALTITUDE_STOPS.length - 1) return out.copy(STOP_COLORS[i]);
			const a = ALTITUDE_STOPS[i];
			const b = ALTITUDE_STOPS[i + 1];
			const k = (ft - a.ft) / (b.ft - a.ft);
			return out.copy(STOP_COLORS[i]).lerp(STOP_COLORS[i + 1], k);
		}
	}
	return out.copy(STOP_COLORS[0]);
}

/** CSS colour for the same scale, used by the panel/legend. */
export function altitudeCss(altFt: number): string {
	return `#${altitudeColor(altFt).getHexString()}`;
}

/**
 * Relative luminance per WCAG 2.1, computed from a colour's *sRGB* hex.
 *
 * THREE.Color keeps its components in the linear working colour space, so reading
 * `.r/.g/.b` and then applying the sRGB transfer function decodes twice and badly
 * overestimates luminance. Going through `getHexString()` (which encodes back to sRGB)
 * is what makes the ratio agree with what a browser/contrast checker reports.
 */
function luminanceFromHex(hex: string): number {
	const n = parseInt(hex, 16);
	const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
	const f = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
	return 0.2126 * f(srgb[0]) + 0.7152 * f(srgb[1]) + 0.0722 * f(srgb[2]);
}

/** WCAG contrast ratio between two sRGB hex strings. */
export function contrastRatio(hexA: string, hexB: string): number {
	const a = luminanceFromHex(hexA);
	const b = luminanceFromHex(hexB);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Altitude colour that stays legible as *text*.
 *
 * The scale above is tuned for a #070B16 globe, where cyan/amber glow nicely. On a light
 * panel those same hues land around 1.4:1 against white, so they are darkened step by step
 * until they clear WCAG AA while keeping their hue identity.
 */
export function altitudeTextCss(altFt: number, theme: 'dark' | 'light'): string {
	const color = altitudeColor(altFt);
	if (theme === 'dark') return `#${color.getHexString()}`;

	// Panel background in light mode is ~#F4F8FF. Darken in sRGB space until the text
	// clears WCAG AA (4.5:1), keeping the hue so the altitude scale stays recognisable.
	let hex = color.getHexString();
	for (let i = 0; i < 40 && contrastRatio(hex, 'f4f8ff') < 4.5; i++) {
		const n = parseInt(hex, 16);
		const dark = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * 0.9));
		hex = dark.map((v) => v.toString(16).padStart(2, '0')).join('');
	}
	return `#${hex}`;
}

// --- sun position ------------------------------------------------------------

/**
 * Subsolar point for a given time (low-precision NOAA formulae; good to ~0.1 deg,
 * which is far more accuracy than a day/night terminator needs).
 */
export function subsolarPoint(date: Date): { lat: number; lon: number } {
	const ms = date.getTime();
	const jd = ms / 86400000 + 2440587.5;
	const n = jd - 2451545.0;
	const L = (280.46 + 0.9856474 * n) % 360; // mean longitude
	const g = toRad((357.528 + 0.9856003 * n) % 360); // mean anomaly
	const lambda = toRad(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)); // ecliptic longitude
	const eps = toRad(23.439 - 0.0000004 * n); // obliquity
	const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));

	// Greenwich hour angle -> subsolar longitude.
	const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
	const eqTime =
		4 *
		((L - 0.0057183 - (Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) * 180) / Math.PI + 180) %
			360 -
			180);
	const lon = -15 * (utcHours - 12 + eqTime / 60);

	return { lat: (dec * 180) / Math.PI, lon: ((((lon + 180) % 360) + 360) % 360) - 180 };
}

/** Unit vector from the globe centre toward the sun, in scene space. */
export function sunDirection(date: Date, out = new THREE.Vector3()): THREE.Vector3 {
	const { lat, lon } = subsolarPoint(date);
	return latLonToVector3(lat, lon, 1, out).normalize();
}

// --- airplane geometry -------------------------------------------------------

/**
 * Low-poly airliner built from Three.js primitives (no external model, no licence
 * questions). Nose points +Z, wings along X, so heading rotation is about Y.
 */
export function createAirplaneGeometry(): THREE.BufferGeometry {
	const parts: THREE.BufferGeometry[] = [];

	// Fuselage: a tapered box, longer than it is wide.
	const fuselage = new THREE.CylinderGeometry(0.16, 0.1, 2.0, 6);
	fuselage.rotateX(Math.PI / 2);
	parts.push(fuselage);

	// Nose cone.
	const nose = new THREE.ConeGeometry(0.16, 0.5, 6);
	nose.rotateX(Math.PI / 2);
	nose.translate(0, 0, 1.2);
	parts.push(nose);

	// Main wings: a thin swept box either side.
	const wing = new THREE.BoxGeometry(2.4, 0.06, 0.5);
	wing.translate(0, 0, -0.1);
	parts.push(wing);

	// Horizontal stabiliser.
	const tailplane = new THREE.BoxGeometry(0.95, 0.05, 0.28);
	tailplane.translate(0, 0.04, -0.88);
	parts.push(tailplane);

	// Vertical fin.
	const fin = new THREE.BoxGeometry(0.06, 0.5, 0.36);
	fin.translate(0, 0.28, -0.9);
	parts.push(fin);

	const merged = mergeGeometries(parts);
	for (const p of parts) p.dispose();
	merged.computeVertexNormals();
	return merged;
}

/** Minimal geometry merge (avoids pulling in the examples/ addon). */
function mergeGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
	let vertexCount = 0;
	let indexCount = 0;
	for (const g of geoms) {
		const pos = g.getAttribute('position');
		vertexCount += pos.count;
		indexCount += g.index ? g.index.count : pos.count;
	}

	const positions = new Float32Array(vertexCount * 3);
	const normals = new Float32Array(vertexCount * 3);
	const indices = new Uint16Array(indexCount);

	let vOff = 0;
	let iOff = 0;
	for (const g of geoms) {
		const pos = g.getAttribute('position') as THREE.BufferAttribute;
		const nor = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
		positions.set(pos.array as Float32Array, vOff * 3);
		if (nor) normals.set(nor.array as Float32Array, vOff * 3);

		if (g.index) {
			const src = g.index.array;
			for (let i = 0; i < src.length; i++) indices[iOff + i] = src[i] + vOff;
			iOff += src.length;
		} else {
			for (let i = 0; i < pos.count; i++) indices[iOff + i] = i + vOff;
			iOff += pos.count;
		}
		vOff += pos.count;
	}

	const out = new THREE.BufferGeometry();
	out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
	out.setIndex(new THREE.BufferAttribute(indices, 1));
	return out;
}

/** Procedural star field as a Points cloud on a large sphere. */
export function createStarField(count = 2400, radius = 900): THREE.Points {
	const positions = new Float32Array(count * 3);
	const sizes = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		// Uniform on a sphere.
		const u = Math.random() * 2 - 1;
		const t = Math.random() * Math.PI * 2;
		const s = Math.sqrt(1 - u * u);
		const r = radius * (0.85 + Math.random() * 0.15);
		positions[i * 3] = r * s * Math.cos(t);
		positions[i * 3 + 1] = r * u;
		positions[i * 3 + 2] = r * s * Math.sin(t);
		sizes[i] = Math.random() < 0.08 ? 3.2 : 1.1 + Math.random() * 1.1;
	}
	const geom = new THREE.BufferGeometry();
	geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

	const material = new THREE.PointsMaterial({
		color: 0xaecbe8,
		size: 2,
		sizeAttenuation: false,
		transparent: true,
		opacity: 0.85,
		depthWrite: false
	});
	const points = new THREE.Points(geom, material);
	points.frustumCulled = false;
	return points;
}

export function disposeObject(root: THREE.Object3D) {
	root.traverse((obj) => {
		const mesh = obj as THREE.Mesh;
		if (mesh.geometry) mesh.geometry.dispose();
		const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
		if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
		else mat?.dispose();
	});
}

// AeroGlobe 3D engine.
//
// One class owns the whole Three.js lifecycle: scene, Earth with day/night shading,
// atmosphere, stars, instanced aircraft, trails, routes, airports, camera modes and
// picking. Nothing here touches Svelte reactivity - the UI passes data in and receives
// events out through callbacks, so a 400-aircraft sky never re-renders a component.
//
// Performance contract:
//  - aircraft, ground dots and airports are InstancedMesh / Points, so one draw call each
//  - the aircraft count is capped (MAX_RENDERED) and sorted by camera distance, with the
//    selected aircraft always kept
//  - trails rebuild on a 500 ms throttle, not per frame
//  - dispose() tears down every geometry, material, texture and listener

import * as THREE from 'three';
import type { LiveAircraft } from '../state/traffic.svelte';
import type { Filters } from '../types';
import type { Airport } from '../data/airports';
import {
	ALT_SHELL_MAX,
	GLOBE_RADIUS,
	altitudeColor,
	altitudeToRadius,
	createAirplaneGeometry,
	createStarField,
	disposeObject,
	latLonToVector3,
	sunDirection,
	vector3ToLatLon
} from './helpers';
import { angleDelta, clamp, greatCirclePath, toRad } from '../geo';

export type CameraMode = 'free' | 'follow' | 'cockpit';

export interface GlobeCallbacks {
	onSelectAircraft(hex: string | null): void;
	onSelectAirport(airport: Airport | null): void;
	/** Camera centre changed enough that the data region should be re-queried. */
	onRegionChange(lat: number, lon: number, radiusNm: number): void;
	onFrame(stats: { fps: number; rendered: number }): void;
}

const MIN_DISTANCE = GLOBE_RADIUS + 6;
const MAX_DISTANCE = GLOBE_RADIUS * 4.2;
const PLANE_CAP = 400;
const AIRPORT_CAP = 400;
const TRAIL_VERTEX_CAP = PLANE_CAP * 24;
const SELECTED_TRAIL_CAP = 260;
const ROUTE_CAP = 128;

export class AeroGlobe {
	private renderer: THREE.WebGLRenderer;
	private scene = new THREE.Scene();
	private camera: THREE.PerspectiveCamera;
	private container: HTMLElement;
	private callbacks: GlobeCallbacks;

	// Earth + environment
	private earth!: THREE.Mesh;
	private earthMaterial!: THREE.ShaderMaterial;
	private atmosphere!: THREE.Mesh;
	private stars!: THREE.Points;
	private textures: THREE.Texture[] = [];

	// Aircraft
	private planes!: THREE.InstancedMesh;
	private groundDots!: THREE.Points;
	private trails!: THREE.LineSegments;
	private selectedTrail!: THREE.Line;
	private routeLine!: THREE.Line;
	private selectionRing!: THREE.Mesh;

	// Airports
	private airportPoints!: THREE.Points;
	private airportList: Airport[] = [];
	private visibleAirports: Airport[] = [];

	// Camera state (spherical, eased every frame)
	// Open over well-covered airspace (northern India) and close enough that individual
	// aircraft read as aircraft rather than dots. The opening distance is slightly wider
	// than the target so the camera eases in on load.
	private targetLat = 22;
	private targetLon = 78;
	private targetDistance = GLOBE_RADIUS * 1.85;
	private curLat = 22;
	private curLon = 78;
	private curDistance = GLOBE_RADIUS * 2.6;
	private autoRotate = false;
	private autoRotateSpeed = 1.6; // deg/s

	// Follow / cockpit
	private mode: CameraMode = 'free';
	private followHex: string | null = null;

	// Frame loop
	private raf = 0;
	private clock = new THREE.Clock();
	private lastFrameTimes: number[] = [];
	private lastTrailRebuild = 0;
	private lastRegionPush = 0;
	private disposed = false;
	private reducedMotion = false;

	// Interaction
	private pointerDown = false;
	private pointerMoved = false;
	private lastPointer = { x: 0, y: 0 };
	private pointers = new Map<number, { x: number; y: number }>();
	private pinchDistance = 0;
	private raycaster = new THREE.Raycaster();
	private ndc = new THREE.Vector2();

	// Render data snapshot (rebuilt each frame from the traffic map)
	private rendered: LiveAircraft[] = [];
	private renderedHexes: string[] = [];
	private aircraftSource: () => Iterable<LiveAircraft> = () => [];
	private filters: Filters | null = null;
	private selectedHex: string | null = null;

	// Scratch objects, reused to keep the frame loop allocation-free.
	private readonly v1 = new THREE.Vector3();
	private readonly v2 = new THREE.Vector3();
	private readonly v3 = new THREE.Vector3();
	private readonly q1 = new THREE.Quaternion();
	private readonly m1 = new THREE.Matrix4();
	private readonly color1 = new THREE.Color();
	private readonly sunVec = new THREE.Vector3();

	constructor(container: HTMLElement, callbacks: GlobeCallbacks, opts: { reducedMotion?: boolean } = {}) {
		this.container = container;
		this.callbacks = callbacks;
		this.reducedMotion = opts.reducedMotion ?? false;

		this.renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: false,
			powerPreference: 'high-performance'
		});
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.setSize(container.clientWidth, container.clientHeight);
		this.renderer.setClearColor(0x05070f, 1);
		container.appendChild(this.renderer.domElement);
		this.renderer.domElement.style.touchAction = 'none';
		this.renderer.domElement.setAttribute('aria-label', '3D globe showing live aircraft');

		this.camera = new THREE.PerspectiveCamera(
			45,
			container.clientWidth / Math.max(1, container.clientHeight),
			0.5,
			3000
		);

		this.buildEnvironment();
		this.buildAircraftLayers();
		this.buildAirportLayer();
		this.attachListeners();
		this.applyCamera(1);
	}

	// --- construction ---------------------------------------------------------

	private buildEnvironment() {
		const loader = new THREE.TextureLoader();
		const dayTex = loader.load('/textures/earth-day.jpg');
		const nightTex = loader.load('/textures/earth-night.jpg');
		for (const t of [dayTex, nightTex]) {
			t.colorSpace = THREE.SRGBColorSpace;
			t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
		}
		this.textures.push(dayTex, nightTex);

		// Day/night terminator shader: blend the Blue Marble day map into the city-lights
		// night map across a soft band around the sub-solar great circle.
		this.earthMaterial = new THREE.ShaderMaterial({
			uniforms: {
				dayTexture: { value: dayTex },
				nightTexture: { value: nightTex },
				sunDirection: { value: new THREE.Vector3(1, 0, 0) },
				atmosphereTint: { value: new THREE.Color(0x3aa2ff) }
			},
			vertexShader: /* glsl */ `
				varying vec2 vUv;
				varying vec3 vNormalW;
				varying vec3 vViewDir;
				void main() {
					vUv = uv;
					vNormalW = normalize(mat3(modelMatrix) * normal);
					vec4 worldPos = modelMatrix * vec4(position, 1.0);
					vViewDir = normalize(cameraPosition - worldPos.xyz);
					gl_Position = projectionMatrix * viewMatrix * worldPos;
				}
			`,
			fragmentShader: /* glsl */ `
				uniform sampler2D dayTexture;
				uniform sampler2D nightTexture;
				uniform vec3 sunDirection;
				uniform vec3 atmosphereTint;
				varying vec2 vUv;
				varying vec3 vNormalW;
				varying vec3 vViewDir;

				void main() {
					vec3 n = normalize(vNormalW);
					float sun = dot(n, normalize(sunDirection));

					// Soft terminator band (~12 degrees wide).
					float dayMix = smoothstep(-0.12, 0.18, sun);

					vec3 day = texture2D(dayTexture, vUv).rgb;
					vec3 night = texture2D(nightTexture, vUv).rgb;

					// Night side: dim blue base + city lights glowing through.
					vec3 nightShade = day * 0.055 + night * 1.25;
					nightShade = mix(nightShade, nightShade * vec3(1.0, 0.86, 0.62), 0.5);

					vec3 dayShade = day * (0.55 + 0.65 * clamp(sun, 0.0, 1.0));

					vec3 color = mix(nightShade, dayShade, dayMix);

					// Warm scatter right at the terminator.
					float band = 1.0 - abs(sun) ;
					color += vec3(0.30, 0.13, 0.03) * pow(clamp(band, 0.0, 1.0), 9.0);

					// Rim light / limb haze.
					float rim = 1.0 - max(dot(n, normalize(vViewDir)), 0.0);
					color += atmosphereTint * pow(rim, 3.4) * 0.42;

					gl_FragColor = vec4(color, 1.0);
				}
			`
		});

		this.earth = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS, 96, 64), this.earthMaterial);
		this.earth.name = 'earth';
		this.scene.add(this.earth);

		// Atmosphere: back-side shell with a fresnel falloff.
		this.atmosphere = new THREE.Mesh(
			new THREE.SphereGeometry(GLOBE_RADIUS * 1.055, 64, 48),
			new THREE.ShaderMaterial({
				transparent: true,
				side: THREE.BackSide,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				uniforms: { glowColor: { value: new THREE.Color(0x38d0ff) } },
				vertexShader: /* glsl */ `
					varying vec3 vNormalW;
					varying vec3 vViewDir;
					void main() {
						vNormalW = normalize(mat3(modelMatrix) * normal);
						vec4 wp = modelMatrix * vec4(position, 1.0);
						vViewDir = normalize(cameraPosition - wp.xyz);
						gl_Position = projectionMatrix * viewMatrix * wp;
					}
				`,
				fragmentShader: /* glsl */ `
					uniform vec3 glowColor;
					varying vec3 vNormalW;
					varying vec3 vViewDir;
					void main() {
						float intensity = pow(0.72 - dot(normalize(vNormalW), normalize(vViewDir)), 3.0);
						gl_FragColor = vec4(glowColor, 1.0) * clamp(intensity, 0.0, 1.0) * 0.9;
					}
				`
			})
		);
		this.scene.add(this.atmosphere);

		this.stars = createStarField();
		this.scene.add(this.stars);

		this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));
		const key = new THREE.DirectionalLight(0xffffff, 1.4);
		key.position.set(1, 0.6, 1).multiplyScalar(500);
		key.name = 'sunLight';
		this.scene.add(key);
	}

	private buildAircraftLayers() {
		// Aircraft: one instanced draw call, per-instance colour by altitude.
		const geom = createAirplaneGeometry();
		// NOTE: do NOT set `vertexColors: true` here. That enables USE_COLOR, which expects a
		// per-vertex `color` attribute this geometry does not have, so every instance renders
		// black. InstancedMesh colour comes from `instanceColor` (USE_INSTANCING_COLOR), which
		// three enables automatically once the attribute is present.
		const mat = new THREE.MeshLambertMaterial();
		this.planes = new THREE.InstancedMesh(geom, mat, PLANE_CAP);
		this.planes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.planes.count = 0;
		this.planes.frustumCulled = false;
		this.planes.name = 'aircraft';
		const colors = new Float32Array(PLANE_CAP * 3).fill(1);
		this.planes.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
		this.planes.instanceColor.setUsage(THREE.DynamicDrawUsage);
		this.scene.add(this.planes);

		// Ground-track dots: the aircraft's position projected onto the surface.
		const dotGeom = new THREE.BufferGeometry();
		dotGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PLANE_CAP * 3), 3));
		dotGeom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PLANE_CAP * 3), 3));
		this.groundDots = new THREE.Points(
			dotGeom,
			new THREE.PointsMaterial({
				size: 2.4,
				sizeAttenuation: false,
				transparent: true,
				opacity: 0.4,
				vertexColors: true,
				depthWrite: false
			})
		);
		this.groundDots.frustumCulled = false;
		this.scene.add(this.groundDots);

		// Short fading trails for every rendered aircraft (one LineSegments buffer).
		const trailGeom = new THREE.BufferGeometry();
		trailGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_VERTEX_CAP * 2 * 3), 3));
		trailGeom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_VERTEX_CAP * 2 * 3), 3));
		this.trails = new THREE.LineSegments(
			trailGeom,
			new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false })
		);
		this.trails.frustumCulled = false;
		this.scene.add(this.trails);

		// Longer trail for the selected aircraft.
		const selGeom = new THREE.BufferGeometry();
		selGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SELECTED_TRAIL_CAP * 3), 3));
		selGeom.setDrawRange(0, 0);
		this.selectedTrail = new THREE.Line(
			selGeom,
			new THREE.LineBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.95, depthWrite: false })
		);
		this.selectedTrail.frustumCulled = false;
		this.scene.add(this.selectedTrail);

		// Dashed planned great-circle route to the destination.
		const routeGeom = new THREE.BufferGeometry();
		routeGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROUTE_CAP * 3), 3));
		routeGeom.setDrawRange(0, 0);
		this.routeLine = new THREE.Line(
			routeGeom,
			new THREE.LineDashedMaterial({
				color: 0x38d0ff,
				dashSize: 2.2,
				gapSize: 1.8,
				transparent: true,
				opacity: 0.75,
				depthWrite: false
			})
		);
		this.routeLine.frustumCulled = false;
		this.scene.add(this.routeLine);

		// Pulsing ring around the selected aircraft.
		this.selectionRing = new THREE.Mesh(
			new THREE.RingGeometry(1.5, 1.9, 32),
			new THREE.MeshBasicMaterial({
				color: 0xffb020,
				side: THREE.DoubleSide,
				transparent: true,
				opacity: 0.9,
				depthWrite: false
			})
		);
		this.selectionRing.visible = false;
		this.scene.add(this.selectionRing);
	}

	private buildAirportLayer() {
		const geom = new THREE.BufferGeometry();
		geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(AIRPORT_CAP * 3), 3));
		geom.setDrawRange(0, 0);
		this.airportPoints = new THREE.Points(
			geom,
			new THREE.PointsMaterial({
				color: 0x7ef0ff,
				size: 5,
				sizeAttenuation: false,
				transparent: true,
				opacity: 0.75,
				depthWrite: false
			})
		);
		this.airportPoints.frustumCulled = false;
		this.scene.add(this.airportPoints);
	}

	// --- public API ------------------------------------------------------------

	setAircraftSource(source: () => Iterable<LiveAircraft>) {
		this.aircraftSource = source;
	}

	setFilters(filters: Filters) {
		this.filters = filters;
		this.airportPoints.visible = filters.showAirports;
		this.trails.visible = filters.showTrails;
	}

	setAirports(airports: Airport[]) {
		this.airportList = airports;
		this.refreshAirportPositions();
	}

	setSelected(hex: string | null) {
		this.selectedHex = hex;
		if (!hex) {
			this.selectionRing.visible = false;
			this.selectedTrail.geometry.setDrawRange(0, 0);
			this.routeLine.geometry.setDrawRange(0, 0);
			if (this.mode !== 'free') this.setCameraMode('free');
		}
		this.lastTrailRebuild = 0;
	}

	setAutoRotate(on: boolean) {
		this.autoRotate = on;
		// The landing hero reads better with the whole planet in frame; the tracker opens
		// closer so aircraft are immediately legible.
		if (on) {
			this.targetDistance = GLOBE_RADIUS * 2.45;
			this.curDistance = GLOBE_RADIUS * 2.9;
		}
	}

	setReducedMotion(on: boolean) {
		this.reducedMotion = on;
	}

	getCameraMode(): CameraMode {
		return this.mode;
	}

	setCameraMode(mode: CameraMode, hex?: string | null) {
		this.mode = mode;
		this.followHex = mode === 'free' ? null : (hex ?? this.selectedHex);
		if (mode === 'free') {
			// Keep the current viewpoint instead of snapping somewhere else.
			this.targetLat = this.curLat;
			this.targetLon = this.curLon;
			this.targetDistance = clamp(this.curDistance, MIN_DISTANCE, MAX_DISTANCE);
		}
	}

	/** Smoothly fly the camera to a lat/lon, optionally changing the zoom distance. */
	flyTo(lat: number, lon: number, distance?: number) {
		this.mode = 'free';
		this.followHex = null;
		this.targetLat = clamp(lat, -85, 85);
		this.targetLon = lon;
		if (distance !== undefined) this.targetDistance = clamp(distance, MIN_DISTANCE, MAX_DISTANCE);
		this.pushRegion(true);
	}

	/** Current camera centre + a radius that covers the visible cap, in nautical miles. */
	getRegion(): { lat: number; lon: number; radiusNm: number } {
		// Angular half-width of the visible spherical cap, converted to a surface radius.
		const ratio = clamp(GLOBE_RADIUS / this.curDistance, 0, 1);
		const capAngle = Math.acos(ratio); // radians from the sub-camera point to the limb
		const km = capAngle * 6371;
		return {
			lat: this.curLat,
			lon: ((((this.curLon + 180) % 360) + 360) % 360) - 180,
			radiusNm: clamp(km / 1.852, 25, 250)
		};
	}

	start() {
		if (this.raf) return;
		this.clock.start();
		const loop = () => {
			if (this.disposed) return;
			this.raf = requestAnimationFrame(loop);
			this.frame();
		};
		this.raf = requestAnimationFrame(loop);
	}

	stop() {
		if (this.raf) cancelAnimationFrame(this.raf);
		this.raf = 0;
	}

	resize() {
		const w = this.container.clientWidth;
		const h = Math.max(1, this.container.clientHeight);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(w, h);
	}

	dispose() {
		this.disposed = true;
		this.stop();
		this.detachListeners();
		disposeObject(this.scene);
		for (const t of this.textures) t.dispose();
		this.textures = [];
		this.renderer.dispose();
		if (this.renderer.domElement.parentElement === this.container) {
			this.container.removeChild(this.renderer.domElement);
		}
		this.scene.clear();
	}

	// --- frame loop -------------------------------------------------------------

	private frame() {
		const now = performance.now();
		const dt = Math.min(0.1, this.clock.getDelta());

		if (this.autoRotate && this.mode === 'free' && !this.pointerDown) {
			this.targetLon += this.autoRotateSpeed * dt;
		}

		this.updateFollowTarget();
		this.applyCamera(this.reducedMotion ? 1 : 1 - Math.pow(0.0025, dt));
		this.updateSun();
		this.collectAircraft();
		this.updatePlaneInstances(now);

		if (now - this.lastTrailRebuild > 500) {
			this.lastTrailRebuild = now;
			this.rebuildTrails();
			this.rebuildSelectedTrail();
		}

		this.renderer.render(this.scene, this.camera);

		// FPS over a 30-frame window.
		this.lastFrameTimes.push(now);
		if (this.lastFrameTimes.length > 30) this.lastFrameTimes.shift();
		if (this.lastFrameTimes.length > 2) {
			const span = this.lastFrameTimes[this.lastFrameTimes.length - 1] - this.lastFrameTimes[0];
			const fps = span > 0 ? ((this.lastFrameTimes.length - 1) * 1000) / span : 60;
			this.callbacks.onFrame({ fps, rendered: this.planes.count });
		}

		this.pushRegion(false);
	}

	private updateSun() {
		sunDirection(new Date(), this.sunVec);
		this.earthMaterial.uniforms.sunDirection.value.copy(this.sunVec);
		const light = this.scene.getObjectByName('sunLight') as THREE.DirectionalLight | undefined;
		if (light) light.position.copy(this.sunVec).multiplyScalar(500);
	}

	/** Position the camera from the eased spherical coordinates, or from the followed plane. */
	private applyCamera(k: number) {
		if (this.mode !== 'free' && this.followHex) {
			const ac = this.findAircraft(this.followHex);
			if (ac) {
				this.applyChaseCamera(ac, k);
				return;
			}
		}

		this.curLat += (this.targetLat - this.curLat) * k;
		this.curLon += angleDelta(this.curLon, this.targetLon) * k;
		this.curDistance += (this.targetDistance - this.curDistance) * k;

		latLonToVector3(this.curLat, this.curLon, this.curDistance, this.v1);
		this.camera.position.copy(this.v1);
		this.camera.up.set(0, 1, 0);
		this.camera.lookAt(0, 0, 0);
	}

	/** Chase camera behind+above the aircraft, or a forward cockpit view. */
	private applyChaseCamera(ac: LiveAircraft, k: number) {
		const radius = altitudeToRadius(ac.dAltFt);
		latLonToVector3(ac.dLat, ac.dLon, radius, this.v1); // aircraft position
		const up = this.v2.copy(this.v1).normalize();

		// Forward vector along the current heading, tangent to the sphere.
		const north = this.v3.set(0, 1, 0).sub(up.clone().multiplyScalar(up.y)).normalize();
		const east = new THREE.Vector3().crossVectors(up, north).normalize();
		const hdg = toRad(ac.dHeading);
		const forward = north.clone().multiplyScalar(Math.cos(hdg)).add(east.clone().multiplyScalar(Math.sin(hdg))).normalize();

		const desired = new THREE.Vector3();
		const lookAt = new THREE.Vector3();

		if (this.mode === 'cockpit') {
			// Just ahead of the nose, looking down the track.
			desired.copy(this.v1).add(forward.clone().multiplyScalar(1.1)).add(up.clone().multiplyScalar(0.35));
			lookAt.copy(this.v1).add(forward.clone().multiplyScalar(60)).add(up.clone().multiplyScalar(-2));
		} else {
			const back = 9 + this.planeScale() * 2.2;
			desired
				.copy(this.v1)
				.add(forward.clone().multiplyScalar(-back))
				.add(up.clone().multiplyScalar(back * 0.45));
			lookAt.copy(this.v1).add(forward.clone().multiplyScalar(3));
		}

		const ease = this.reducedMotion ? 1 : Math.min(1, k * 1.6);
		this.camera.position.lerp(desired, ease);
		this.camera.up.lerp(up, ease);
		this.camera.lookAt(lookAt);

		// Keep the free-camera state tracking the followed aircraft for a clean exit.
		this.curLat = ac.dLat;
		this.curLon = ac.dLon;
		this.curDistance = this.camera.position.length();
		this.targetLat = this.curLat;
		this.targetLon = this.curLon;
		this.targetDistance = clamp(this.curDistance, MIN_DISTANCE, MAX_DISTANCE);
	}

	private updateFollowTarget() {
		if (this.mode !== 'free' && this.followHex && !this.findAircraft(this.followHex)) {
			// Followed aircraft disappeared from the feed - fall back to free look.
			this.setCameraMode('free');
		}
	}

	private findAircraft(hex: string): LiveAircraft | null {
		for (const ac of this.aircraftSource()) if (ac.hex === hex) return ac;
		return null;
	}

	/** Visual scale of the plane meshes, shrinking as the camera pulls back. */
	private planeScale(): number {
		// The model is ~2.5 units nose-to-tail at scale 1, against a 100-unit globe radius.
		// Keep aircraft readable when zoomed in without letting them blanket a continent
		// when zoomed out.
		return clamp(this.curDistance / GLOBE_RADIUS, 0.8, 4.0) * 0.42;
	}

	private passesFilters(ac: LiveAircraft): boolean {
		const f = this.filters;
		if (!f) return true;
		if (f.airborneOnly && (ac.onGround || ac.dAltFt < 50)) return false;
		if (ac.dAltFt < f.altMinFt || ac.dAltFt > f.altMaxFt) return false;
		if (ac.gsKt < f.speedMinKt || ac.gsKt > f.speedMaxKt) return false;
		if (!f.categories[ac.category]) return false;
		return true;
	}

	/**
	 * Pick which aircraft to draw: filter, then keep the PLANE_CAP nearest the camera.
	 * The selected aircraft is always retained.
	 */
	private collectAircraft() {
		this.rendered.length = 0;
		this.renderedHexes.length = 0;
		const camPos = this.camera.position;

		const candidates: { ac: LiveAircraft; d: number }[] = [];
		for (const ac of this.aircraftSource()) {
			if (!this.passesFilters(ac) && ac.hex !== this.selectedHex) continue;
			latLonToVector3(ac.dLat, ac.dLon, altitudeToRadius(ac.dAltFt), this.v1);
			candidates.push({ ac, d: ac.hex === this.selectedHex ? -1 : camPos.distanceToSquared(this.v1) });
		}

		if (candidates.length > PLANE_CAP) {
			candidates.sort((a, b) => a.d - b.d);
			candidates.length = PLANE_CAP;
		}
		for (const c of candidates) {
			this.rendered.push(c.ac);
			this.renderedHexes.push(c.ac.hex);
		}
	}

	private updatePlaneInstances(now: number) {
		const count = this.rendered.length;
		this.planes.count = count;

		const scale = this.planeScale();
		const dotPos = this.groundDots.geometry.getAttribute('position') as THREE.BufferAttribute;
		const dotCol = this.groundDots.geometry.getAttribute('color') as THREE.BufferAttribute;

		for (let i = 0; i < count; i++) {
			const ac = this.rendered[i];
			const radius = altitudeToRadius(ac.dAltFt);
			latLonToVector3(ac.dLat, ac.dLon, radius, this.v1);

			// Orientation: +Y away from the globe centre, nose along the heading,
			// pitched by vertical rate.
			const up = this.v2.copy(this.v1).normalize();
			const northish = this.v3.set(0, 1, 0);
			const dotUp = northish.dot(up);
			northish.addScaledVector(up, -dotUp);
			if (northish.lengthSq() < 1e-8) northish.set(1, 0, 0).addScaledVector(up, -up.x);
			northish.normalize();
			const east = new THREE.Vector3().crossVectors(up, northish).normalize();

			const hdg = toRad(ac.dHeading);
			const forward = northish
				.clone()
				.multiplyScalar(Math.cos(hdg))
				.addScaledVector(east, Math.sin(hdg))
				.normalize();

			// Pitch: map +/-3000 fpm onto +/-12 degrees.
			const pitch = clamp(ac.vertRate / 3000, -1, 1) * toRad(12);
			forward.addScaledVector(up, Math.tan(pitch)).normalize();

			const right = new THREE.Vector3().crossVectors(up, forward).normalize();
			const trueUp = new THREE.Vector3().crossVectors(forward, right).normalize();

			// Basis matrix: model +X -> right, +Y -> up, +Z -> forward.
			this.m1.makeBasis(right, trueUp, forward);
			this.q1.setFromRotationMatrix(this.m1);

			const isSelected = ac.hex === this.selectedHex;
			const s = scale * (isSelected ? 1.5 : 1);
			this.m1.compose(this.v1, this.q1, this.v3.set(s, s, s));
			this.planes.setMatrixAt(i, this.m1);

			if (isSelected) {
				this.color1.set(0xffb020);
			} else {
				altitudeColor(ac.dAltFt, this.color1);
			}
			this.planes.setColorAt(i, this.color1);

			// Ground-track dot directly beneath the aircraft.
			latLonToVector3(ac.dLat, ac.dLon, GLOBE_RADIUS + 0.35, this.v2);
			dotPos.setXYZ(i, this.v2.x, this.v2.y, this.v2.z);
			dotCol.setXYZ(i, this.color1.r, this.color1.g, this.color1.b);

			if (isSelected) this.updateSelectionRing(this.v1, up, now, s);
		}

		this.planes.instanceMatrix.needsUpdate = true;
		if (this.planes.instanceColor) this.planes.instanceColor.needsUpdate = true;
		this.planes.computeBoundingSphere();

		this.groundDots.geometry.setDrawRange(0, count);
		dotPos.needsUpdate = true;
		dotCol.needsUpdate = true;

		if (!this.rendered.some((a) => a.hex === this.selectedHex)) this.selectionRing.visible = false;
	}

	private updateSelectionRing(pos: THREE.Vector3, up: THREE.Vector3, now: number, scale: number) {
		this.selectionRing.visible = true;
		this.selectionRing.position.copy(pos);
		this.selectionRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
		const pulse = this.reducedMotion ? 1 : 1 + Math.sin(now / 320) * 0.12;
		// Ring geometry is radius 1.9 and the model is ~2.5 units long, so the ring only
		// needs a little more than the incoming plane scale to sit around the aircraft.
		const s = scale * 1.15 * pulse;
		this.selectionRing.scale.set(s, s, s);
		(this.selectionRing.material as THREE.MeshBasicMaterial).opacity = this.reducedMotion
			? 0.8
			: 0.55 + Math.sin(now / 320) * 0.3;
	}

	/** Short fading trail behind every rendered aircraft. */
	private rebuildTrails() {
		if (!this.filters?.showTrails) {
			this.trails.geometry.setDrawRange(0, 0);
			return;
		}
		const pos = this.trails.geometry.getAttribute('position') as THREE.BufferAttribute;
		const col = this.trails.geometry.getAttribute('color') as THREE.BufferAttribute;
		let v = 0;

		for (const ac of this.rendered) {
			const trail = ac.trail;
			if (trail.length < 2) continue;
			const start = Math.max(0, trail.length - 12);
			for (let i = start; i < trail.length - 1; i++) {
				if (v + 2 > TRAIL_VERTEX_CAP * 2) break;
				const a = trail[i];
				const b = trail[i + 1];
				// Fade older segments out.
				const age = (i - start) / Math.max(1, trail.length - 1 - start);
				altitudeColor(a.altFt, this.color1).multiplyScalar(0.25 + 0.75 * age);

				latLonToVector3(a.lat, a.lon, altitudeToRadius(a.altFt), this.v1);
				pos.setXYZ(v, this.v1.x, this.v1.y, this.v1.z);
				col.setXYZ(v, this.color1.r, this.color1.g, this.color1.b);
				v++;

				latLonToVector3(b.lat, b.lon, altitudeToRadius(b.altFt), this.v1);
				pos.setXYZ(v, this.v1.x, this.v1.y, this.v1.z);
				col.setXYZ(v, this.color1.r, this.color1.g, this.color1.b);
				v++;
			}
		}

		this.trails.geometry.setDrawRange(0, v);
		pos.needsUpdate = true;
		col.needsUpdate = true;
	}

	/** Long trail + dashed planned route for the selected aircraft. */
	private rebuildSelectedTrail() {
		const hex = this.selectedHex;
		if (!hex) return;
		const ac = this.findAircraft(hex);
		if (!ac) {
			this.selectedTrail.geometry.setDrawRange(0, 0);
			this.routeLine.geometry.setDrawRange(0, 0);
			return;
		}

		const pos = this.selectedTrail.geometry.getAttribute('position') as THREE.BufferAttribute;
		const pts = ac.trail.slice(-SELECTED_TRAIL_CAP);
		for (let i = 0; i < pts.length; i++) {
			latLonToVector3(pts[i].lat, pts[i].lon, altitudeToRadius(pts[i].altFt) + 0.05, this.v1);
			pos.setXYZ(i, this.v1.x, this.v1.y, this.v1.z);
		}
		this.selectedTrail.geometry.setDrawRange(0, pts.length);
		pos.needsUpdate = true;
		this.selectedTrail.geometry.computeBoundingSphere();

		// Planned great-circle route to the destination, when we know one.
		const destLatLon = this.destinationFor(ac);
		const routePos = this.routeLine.geometry.getAttribute('position') as THREE.BufferAttribute;
		if (!destLatLon) {
			this.routeLine.geometry.setDrawRange(0, 0);
			return;
		}
		const path = greatCirclePath(ac.dLat, ac.dLon, destLatLon[0], destLatLon[1], ROUTE_CAP - 1);
		for (let i = 0; i < path.length; i++) {
			// Arc the route up to cruise height near the middle, down at the ends.
			const f = i / (path.length - 1);
			const lift = Math.sin(f * Math.PI) * 0.35;
			latLonToVector3(
				path[i][0],
				path[i][1],
				GLOBE_RADIUS + 0.6 + (altitudeToRadius(ac.dAltFt) - GLOBE_RADIUS) * (1 - f) + lift * ALT_SHELL_MAX,
				this.v1
			);
			routePos.setXYZ(i, this.v1.x, this.v1.y, this.v1.z);
		}
		this.routeLine.geometry.setDrawRange(0, path.length);
		routePos.needsUpdate = true;
		this.routeLine.geometry.computeBoundingSphere();
		this.routeLine.computeLineDistances();
	}

	private destinationResolver: (ac: LiveAircraft) => [number, number] | null = () => null;

	setDestinationResolver(fn: (ac: LiveAircraft) => [number, number] | null) {
		this.destinationResolver = fn;
	}

	private destinationFor(ac: LiveAircraft): [number, number] | null {
		return this.destinationResolver(ac);
	}

	/** Airports near the camera, capped so the layer stays one small draw call. */
	private refreshAirportPositions() {
		const pos = this.airportPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
		const list = this.airportList.slice(0, AIRPORT_CAP);
		this.visibleAirports = list;
		for (let i = 0; i < list.length; i++) {
			latLonToVector3(list[i].lat, list[i].lon, GLOBE_RADIUS + 0.6, this.v1);
			pos.setXYZ(i, this.v1.x, this.v1.y, this.v1.z);
		}
		this.airportPoints.geometry.setDrawRange(0, list.length);
		pos.needsUpdate = true;
		this.airportPoints.geometry.computeBoundingSphere();
	}

	private pushRegion(force: boolean) {
		const now = performance.now();
		if (!force && now - this.lastRegionPush < 1500) return;
		this.lastRegionPush = now;
		const r = this.getRegion();
		this.callbacks.onRegionChange(r.lat, r.lon, r.radiusNm);
	}

	// --- interaction --------------------------------------------------------------

	private attachListeners() {
		const el = this.renderer.domElement;
		el.addEventListener('pointerdown', this.onPointerDown);
		el.addEventListener('pointermove', this.onPointerMove);
		el.addEventListener('pointerup', this.onPointerUp);
		el.addEventListener('pointercancel', this.onPointerUp);
		el.addEventListener('wheel', this.onWheel, { passive: false });
		window.addEventListener('resize', this.onResize);
	}

	private detachListeners() {
		const el = this.renderer.domElement;
		el.removeEventListener('pointerdown', this.onPointerDown);
		el.removeEventListener('pointermove', this.onPointerMove);
		el.removeEventListener('pointerup', this.onPointerUp);
		el.removeEventListener('pointercancel', this.onPointerUp);
		el.removeEventListener('wheel', this.onWheel);
		window.removeEventListener('resize', this.onResize);
	}

	private onResize = () => this.resize();

	private onPointerDown = (e: PointerEvent) => {
		this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		this.pointerDown = true;
		this.pointerMoved = false;
		this.lastPointer = { x: e.clientX, y: e.clientY };
		this.renderer.domElement.setPointerCapture(e.pointerId);
		if (this.pointers.size === 2) {
			const [a, b] = [...this.pointers.values()];
			this.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
		}
	};

	private onPointerMove = (e: PointerEvent) => {
		if (!this.pointers.has(e.pointerId)) return;
		this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		// Pinch zoom.
		if (this.pointers.size === 2) {
			const [a, b] = [...this.pointers.values()];
			const d = Math.hypot(a.x - b.x, a.y - b.y);
			if (this.pinchDistance > 0) {
				this.targetDistance = clamp(
					this.targetDistance * (this.pinchDistance / Math.max(1, d)),
					MIN_DISTANCE,
					MAX_DISTANCE
				);
			}
			this.pinchDistance = d;
			this.pointerMoved = true;
			return;
		}

		if (!this.pointerDown) return;
		const dx = e.clientX - this.lastPointer.x;
		const dy = e.clientY - this.lastPointer.y;
		if (Math.abs(dx) + Math.abs(dy) > 3) this.pointerMoved = true;
		this.lastPointer = { x: e.clientX, y: e.clientY };

		// Drag to rotate; sensitivity scales with zoom so close-ups feel controlled.
		const k = (this.curDistance / GLOBE_RADIUS) * 0.22;
		if (this.mode !== 'free') this.setCameraMode('free');
		this.targetLon -= dx * k;
		this.targetLat = clamp(this.targetLat + dy * k, -85, 85);
	};

	private onPointerUp = (e: PointerEvent) => {
		this.pointers.delete(e.pointerId);
		if (this.pointers.size < 2) this.pinchDistance = 0;
		if (this.pointers.size === 0) this.pointerDown = false;
		try {
			this.renderer.domElement.releasePointerCapture(e.pointerId);
		} catch {
			/* already released */
		}
		// A click (not a drag) selects whatever is under the cursor.
		if (!this.pointerMoved) this.pick(e.clientX, e.clientY);
	};

	private onWheel = (e: WheelEvent) => {
		e.preventDefault();
		if (this.mode !== 'free') this.setCameraMode('free');
		const factor = Math.exp(clamp(e.deltaY, -120, 120) * 0.0014);
		this.targetDistance = clamp(this.targetDistance * factor, MIN_DISTANCE, MAX_DISTANCE);
	};

	/** Raycast: aircraft first (they are the point of the app), then airports, then nothing. */
	private pick(clientX: number, clientY: number) {
		const rect = this.renderer.domElement.getBoundingClientRect();
		this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
		this.raycaster.setFromCamera(this.ndc, this.camera);

		// Generous threshold so small planes stay tappable on touch screens.
		this.raycaster.params.Points = { threshold: 3.5 };

		const planeHits = this.raycaster.intersectObject(this.planes, false);
		if (planeHits.length) {
			const id = planeHits[0].instanceId;
			if (id !== undefined && id < this.renderedHexes.length) {
				this.callbacks.onSelectAircraft(this.renderedHexes[id]);
				return;
			}
		}

		if (this.airportPoints.visible) {
			const apHits = this.raycaster.intersectObject(this.airportPoints, false);
			if (apHits.length) {
				const idx = apHits[0].index;
				if (idx !== undefined && idx < this.visibleAirports.length) {
					this.callbacks.onSelectAirport(this.visibleAirports[idx]);
					return;
				}
			}
		}

		// Clicking empty sky / the globe clears the selection.
		this.callbacks.onSelectAircraft(null);
		this.callbacks.onSelectAirport(null);
	}

	/** Lat/lon currently under the screen centre, used for keyboard panning tests. */
	centerLatLon(): [number, number] {
		latLonToVector3(this.curLat, this.curLon, GLOBE_RADIUS, this.v1);
		return vector3ToLatLon(this.v1);
	}

	/** Keyboard controls for accessibility: arrows pan, +/- zoom. */
	nudge(dLat: number, dLon: number, dZoom = 0) {
		if (this.mode !== 'free') this.setCameraMode('free');
		this.targetLat = clamp(this.targetLat + dLat, -85, 85);
		this.targetLon += dLon;
		if (dZoom) this.targetDistance = clamp(this.targetDistance * dZoom, MIN_DISTANCE, MAX_DISTANCE);
	}
}

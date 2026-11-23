/**
 * three.js renderer backend: lit Blue Marble Earth with soft terminator, ocean glint, cloud shell,
 * fresnel atmosphere and stars; satellites, orbits, tracks, swaths, discs, pixels and regions.
 */
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  D2R, DAY_S, destination, earthRotationRad, groundTrack, inertialPos, isDaylit, latLonToVec, orbitPlaneBasis, RE_KM,
  sunDirection, swathGrid,
} from './orbits';
import type { Backend, GlobeOptions, MarkerItem, PixelsItem, Quality, RegionItem, SatItem, SceneItem } from './types';
import { buildSatellite, disposeSatelliteModel, disposeSharedMaterials } from './satmodel';

const TEX_DAY = 'assets/earth/day_2048.jpg';
const TEX_CLOUDS = 'assets/earth/clouds_2048.jpg';

/** Inertial/Earth-fixed (X, Y, Z-north) -> three.js (x, y-up, z). */
const v3 = (x: number, y: number, z: number, s = 1) => new THREE.Vector3(x * s, z * s, -y * s);
const ef = (lat: number, lon: number, r: number) => {
  const v = latLonToVec(lat, lon);
  return v3(v[0], v[1], v[2], r);
};
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

const EARTH_VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main(){
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vP = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const EARTH_FRAG = /* glsl */ `
uniform sampler2D uDay; uniform vec3 uSun; uniform float uTex; uniform float uGrid;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vP);
  vec3 L = normalize(uSun);
  float ndl = dot(N, L);
  vec3 alb = texture2D(uDay, vUv).rgb;
  vec3 base = mix(vec3(0.010, 0.026, 0.062), alb, uTex);
  float ocean = smoothstep(0.004, 0.05, alb.b - max(alb.r * 1.3, alb.g * 0.92)) * uTex;
  float day = smoothstep(-0.06, 0.95, ndl);
  float lit = smoothstep(-0.10, 0.20, ndl);
  vec3 col = base * (0.016 + 1.22 * day * lit);
  // warm twilight band along the terminator
  float tw = exp(-pow(ndl / 0.11, 2.0));
  col += base * vec3(0.95, 0.42, 0.16) * tw * 0.22;
  // ocean glint
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float spec = (pow(nh, 420.0) * 1.5 + pow(nh, 70.0) * 0.07) * ocean * lit;
  col += vec3(1.0, 0.93, 0.8) * spec;
  // blue limb haze
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.2);
  col += vec3(0.20, 0.45, 1.0) * fres * (0.10 + 0.9 * smoothstep(-0.25, 0.55, ndl)) * 0.85;
  // faint lat/long grid
  vec2 g = vec2(vUv.x * 24.0, vUv.y * 12.0);
  vec2 d = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), vec2(1e-4));
  float pole = smoothstep(0.02, 0.2, sin(vUv.y * 3.14159265));
  float line = max(1.0 - min(d.y, 1.0), (1.0 - min(d.x, 1.0)) * pole);
  col = mix(col, col * 0.6 + vec3(0.30, 0.52, 0.85) * 0.5, line * uGrid);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const CLOUD_FRAG = /* glsl */ `
uniform sampler2D uCloud; uniform vec3 uSun;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main(){
  vec3 N = normalize(vN);
  vec3 L = normalize(uSun);
  float a = texture2D(uCloud, vUv).r;
  float ndl = dot(N, L);
  float lit = smoothstep(-0.10, 0.28, ndl);
  float shade = 0.05 + 1.0 * smoothstep(-0.05, 0.9, ndl);
  vec3 c = vec3(0.96, 0.97, 1.0) * shade * lit + vec3(0.30, 0.15, 0.08) * exp(-pow(ndl / 0.11, 2.0)) * 0.3 * a;
  gl_FragColor = vec4(c, a * 0.88 * (0.25 + 0.75 * lit));
  #include <colorspace_fragment>
}`;

const ATMO_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main(){
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const ATMO_FRAG = /* glsl */ `
uniform vec3 uSun; varying vec3 vN; varying vec3 vV;
void main(){
  float m = abs(dot(normalize(vN), vV));
  float g = pow(clamp(m / 0.42, 0.0, 1.0), 2.4);
  float sunSide = smoothstep(-0.45, 0.6, dot(normalize(vN), normalize(uSun)));
  vec3 col = mix(vec3(0.10, 0.22, 0.55), vec3(0.32, 0.62, 1.0), sunSide);
  gl_FragColor = vec4(col * g * (0.15 + 0.95 * sunSide) * 1.35, 1.0);
}`;

const STAR_VERT = /* glsl */ `
attribute float aSize; attribute vec3 aCol; uniform float uPx; varying vec3 vC;
void main(){
  vC = aCol;
  gl_PointSize = aSize * uPx;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const STAR_FRAG = /* glsl */ `
varying vec3 vC;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vC * a, 1.0);
}`;

interface Entry {
  obj?: THREE.Object3D;
  update?: (t: number, cam: THREE.Vector3) => void;
  labels?: LabelRef[];
  dispose: () => void;
}
interface LabelRef { el: HTMLElement; pos: () => THREE.Vector3; surface?: boolean; /** pixel offset from the projected point */ off?: [number, number]; /** keep the whole label inside the frame */ clamp?: boolean }

interface View { lat: number; lon: number; dist: number; /** Earth-fixed point the camera looks at (Earth radii, default the centre) */ aim: [number, number, number] }

/** Satellite models are drawn this many CSS pixels across (largest dimension), whatever the zoom. */
const SAT_PX = 30;
const MAX_DIST = 40;

function disposeObject(o: THREE.Object3D) {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
  });
}

export class WebGLBackend implements Backend {
  readonly mode = '3d' as const;
  readonly ready: Promise<void>;
  onFail?: (reason: string) => void;
  onQualityHint?: (q: Quality, reason: string) => void;

  private host: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.05, 1200);
  private earthGroup = new THREE.Group();
  private earthMat: THREE.ShaderMaterial;
  private cloudMat: THREE.ShaderMaterial;
  private clouds: THREE.Mesh;
  private sunLight = new THREE.DirectionalLight(0xfff4e0, 3.2);
  private entries = new Map<string, Entry>();
  private lineMats = new Set<LineMaterial>();
  private labelLayer: HTMLElement;
  private cur: View;
  private tgt: View;
  private home: View;
  private sunDec: number;
  private size = { w: 1, h: 1 };
  private quality: Quality = 'high';
  private canvas: HTMLCanvasElement;
  private disposed = false;
  private texLoaded = false;
  private fade = 0;
  private fpsSamples: number[] = [];
  private fpsChecked = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private textures: THREE.Texture[] = [];
  private envTex: THREE.Texture | null = null;
  private dotTex: THREE.CanvasTexture;
  private onKey: (e: KeyboardEvent) => void;
  private onWheel: (e: WheelEvent) => void;
  private onDown: (e: PointerEvent) => void;
  private onMove: (e: PointerEvent) => void;
  private onUp: (e: PointerEvent) => void;
  private onLost: (e: Event) => void;
  private desc: HTMLElement;

  constructor(host: HTMLElement, opts: GlobeOptions, baseUrl: string) {
    this.host = host;
    this.inset = opts.controls === false ? 0 : 18;
    const v = opts.view ?? { lat: 8, lon: 135, dist: 3.4 };
    const v0: View = { ...v, aim: [0, 0, 0] };
    this.cur = { ...v0, aim: [0, 0, 0] };
    this.tgt = { ...v0, aim: [0, 0, 0] };
    this.home = { ...v0, aim: [0, 0, 0] };
    this.sunDec = opts.sunDecDeg ?? -12;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'gt-globe__canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute('aria-label', opts.ariaLabel ?? '3D globe. Drag or use the arrow keys to rotate, plus and minus to zoom.');
    this.canvas.setAttribute('aria-roledescription', 'interactive globe');
    host.appendChild(this.canvas);
    this.desc = document.createElement('p');
    this.desc.className = 'gt-sr-only';
    this.desc.id = `gt-globe-desc-${Math.random().toString(36).slice(2, 8)}`;
    this.canvas.setAttribute('aria-describedby', this.desc.id);
    host.appendChild(this.desc);
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'gt-globe__labels';
    this.labelLayer.setAttribute('aria-hidden', 'true');
    host.appendChild(this.labelLayer);

    const gl = this.canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('webgl2 unavailable');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, context: gl, antialias: true });
    this.renderer.setClearColor(0x03060d, 1);

    // GPU capability heuristics: software renderers and tiny texture limits start in low quality.
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rend = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    const weak = /swiftshader|llvmpipe|software|basic render|softpipe/i.test(rend) || gl.getParameter(gl.MAX_TEXTURE_SIZE) < 4096;
    const q = opts.quality ?? 'auto';
    this.quality = q === 'auto' ? (weak ? 'low' : 'high') : q;
    this.fpsChecked = q !== 'auto';

    // lighting for the spacecraft (the Earth has its own shader)
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.envTex = pm.fromScene(new RoomEnvironment(), 0.05).texture;
    pm.dispose();
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.55;
    this.scene.add(new THREE.AmbientLight(0x6f86b8, 0.35));
    this.scene.add(this.sunLight);

    // Earth
    const dayTex = new THREE.Texture();
    const cloudTex = new THREE.Texture();
    this.textures.push(dayTex, cloudTex);
    this.earthMat = new THREE.ShaderMaterial({
      uniforms: { uDay: { value: dayTex }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uTex: { value: 0 }, uGrid: { value: 0.1 } },
      vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG,
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), this.earthMat);
    this.earthGroup.add(earth);
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: { uCloud: { value: cloudTex }, uSun: { value: new THREE.Vector3(1, 0, 0) } },
      vertexShader: EARTH_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false,
    });
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1.0045, 128, 64), this.cloudMat);
    this.clouds.visible = false;
    this.earthGroup.add(this.clouds);
    this.scene.add(this.earthGroup);

    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.075, 96, 48),
      new THREE.ShaderMaterial({
        uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) } },
        vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
        side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    atmo.name = 'atmo';
    this.scene.add(atmo);

    this.scene.add(this.makeStars());

    // soft dot sprite texture (sub-satellite points)
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.35, 'rgba(255,255,255,0.85)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    this.dotTex = new THREE.CanvasTexture(c);
    this.dotTex.colorSpace = THREE.SRGBColorSpace;

    this.applyQuality();
    this.resize();

    // controls
    this.onKey = (e) => {
      const k = e.key;
      const step = 7 * Math.min(1, (this.tgt.dist - 1) / 1.6 + 0.12);
      let used = true;
      if (k === 'ArrowLeft') this.tgt.lon -= step;
      else if (k === 'ArrowRight') this.tgt.lon += step;
      else if (k === 'ArrowUp') this.tgt.lat = Math.min(88, this.tgt.lat + step);
      else if (k === 'ArrowDown') this.tgt.lat = Math.max(-88, this.tgt.lat - step);
      else if (k === '+' || k === '=') this.zoomBy(0.82);
      else if (k === '-' || k === '_') this.zoomBy(1.22);
      else if (k === '0' || k === 'Home') this.resetView();
      else used = false;
      if (used) e.preventDefault();
    };
    this.onWheel = (e) => { e.preventDefault(); this.zoomBy(Math.exp(e.deltaY * 0.0014)); };
    this.onDown = (e) => {
      this.canvas.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) this.pinch = this.pinchDist();
      this.canvas.classList.add('is-dragging');
    };
    this.onMove = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 2) {
        const d = this.pinchDist();
        if (this.pinch > 0 && d > 0) this.zoomBy(this.pinch / d);
        this.pinch = d;
        return;
      }
      const radPerPx = ((this.tgt.dist - 1) * Math.tan((this.camera.fov * D2R) / 2)) / (this.size.h / 2);
      const degPerPx = Math.max(radPerPx, 0.0006) / D2R;
      this.tgt.lon -= (dx * degPerPx) / Math.max(Math.cos(this.tgt.lat * D2R), 0.25);
      this.tgt.lat = Math.max(-88, Math.min(88, this.tgt.lat + dy * degPerPx));
    };
    this.onUp = (e) => {
      this.pointers.delete(e.pointerId);
      this.pinch = 0;
      if (!this.pointers.size) this.canvas.classList.remove('is-dragging');
    };
    this.onLost = (e) => { e.preventDefault(); this.onFail?.('webgl context lost'); };
    this.canvas.addEventListener('keydown', this.onKey);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointercancel', this.onUp);
    this.canvas.addEventListener('webglcontextlost', this.onLost);

    this.ready = this.loadTextures(baseUrl, dayTex, cloudTex);
  }

  private pinchDist(): number {
    const p = [...this.pointers.values()];
    return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }

  private loadTextures(base: string, day: THREE.Texture, cloud: THREE.Texture): Promise<void> {
    const load = (url: string) => new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error(`texture failed: ${url}`));
      im.src = url;
    });
    const useClouds = () => this.quality === 'high';
    const dayP = load(base + TEX_DAY).then((im) => {
      if (this.disposed) return;
      day.image = im; day.colorSpace = THREE.SRGBColorSpace; day.wrapS = THREE.RepeatWrapping;
      day.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      day.needsUpdate = true;
      this.texLoaded = true;
    }).catch(() => { /* plain look stays: graticule on a dark globe */ this.earthMat.uniforms.uGrid.value = 0.35; });
    const cloudP = (async () => {
      if (!useClouds()) return;
      const im = await load(base + TEX_CLOUDS).catch(() => null);
      if (!im || this.disposed) return;
      cloud.image = im; cloud.wrapS = THREE.RepeatWrapping;
      cloud.anisotropy = 4; cloud.needsUpdate = true;
      this.cloudReady = true;
      this.clouds.visible = this.quality === 'high';
    })();
    return Promise.all([dayP, cloudP]).then(() => undefined);
  }
  private cloudReady = false;

  private makeStars(): THREE.Points {
    const n = 2600;
    const pos = new Float32Array(n * 3), size = new Float32Array(n), col = new Float32Array(n * 3);
    let s = 12345;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
      pos.set([rr * Math.cos(a) * 600, u * 600, rr * Math.sin(a) * 600], i * 3);
      const mag = Math.pow(r(), 3.2);
      size[i] = 0.9 + mag * 2.2;
      const b = 0.22 + mag * 0.8;
      const warm = r();
      col.set([b * (0.85 + 0.15 * warm), b * 0.92, b * (1.0 - 0.18 * warm)], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPx: { value: Math.min(window.devicePixelRatio || 1, 2) } },
      vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.name = 'stars';
    return pts;
  }

  // ------------------------------------------------------------ scene items

  add(item: SceneItem): void {
    this.remove(item.id);
    let e: Entry;
    switch (item.kind) {
      case 'sat': e = this.makeSat(item); break;
      case 'track': e = this.makeTrack(item); break;
      case 'swath': e = this.makeSwath(item); break;
      case 'disc': e = this.makeDisc(item); break;
      case 'marker': e = this.makeMarker(item); break;
      case 'pixels': e = this.makePixels(item); break;
      case 'region': e = this.makeRegion(item); break;
      case 'latline': e = this.makeLatLine(item); break;
    }
    this.entries.set(item.id, e);
  }

  remove(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.dispose();
    e.labels?.forEach((l) => l.el.remove());
    this.entries.delete(id);
  }

  clear(): void {
    for (const id of [...this.entries.keys()]) this.remove(id);
  }

  private lineMat(color: string, width: number, opacity: number, dashed = false): LineMaterial {
    const m = new LineMaterial({
      color: new THREE.Color(color).getHex(), linewidth: width, transparent: true, opacity, dashed, depthWrite: false,
      dashSize: 0.02, gapSize: 0.014, worldUnits: false,
    });
    m.resolution.set(this.size.w, this.size.h);
    this.lineMats.add(m);
    return m;
  }

  private line(pts: THREE.Vector3[], mat: LineMaterial): Line2 {
    const g = new LineGeometry();
    g.setPositions(pts.flatMap((p) => [p.x, p.y, p.z]));
    const l = new Line2(g, mat);
    if (mat.dashed) l.computeLineDistances();
    l.frustumCulled = false;
    return l;
  }

  private mkLabel(text: string, color: string, cls = ''): HTMLElement {
    const el = document.createElement('div');
    el.className = `gt-globe-label ${cls}`.trim();
    el.style.setProperty('--c', color);
    const dot = document.createElement('i');
    const t = document.createElement('span');
    t.textContent = text;
    el.append(dot, t);
    this.labelLayer.appendChild(el);
    return el;
  }

  private makeSat(it: SatItem): Entry {
    const model = buildSatellite(it.model, new THREE.Color(it.color).getHex());
    const bb = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const modelExt = Math.max(bb.x, bb.y, bb.z, 0.01);
    const holder = new THREE.Group();
    holder.add(model);
    this.scene.add(holder);

    // orbit ring in the (precessing) orbital plane
    const r = (RE_KM + it.orbit.altKm) / RE_KM;
    const ringPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; ringPts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); }
    const ringMat = this.lineMat(it.color, 1.4, 0.55);
    const ring = this.line(ringPts, ringMat);
    const ringGroup = new THREE.Group();
    ringGroup.matrixAutoUpdate = false;
    ringGroup.add(ring);
    ringGroup.visible = it.showOrbit !== false;
    this.scene.add(ringGroup);

    // nadir line and sub-satellite dot
    const nadirGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const nadirMat = new THREE.LineBasicMaterial({ color: new THREE.Color(it.color), transparent: true, opacity: 0.4, depthWrite: false });
    const nadir = new THREE.Line(nadirGeo, nadirMat);
    nadir.frustumCulled = false;
    this.scene.add(nadir);
    const dotMat = new THREE.SpriteMaterial({ map: this.dotTex, color: new THREE.Color(it.color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const dot = new THREE.Sprite(dotMat);
    this.scene.add(dot);

    const label = this.mkLabel(it.label, it.color, 'is-sat');
    const worldPos = new THREE.Vector3();
    const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3(), nx = new THREE.Vector3();
    const m4 = new THREE.Matrix4();

    const update = (t: number, cam: THREE.Vector3) => {
      const p = inertialPos(it.orbit, t);
      worldPos.copy(v3(p[0], p[1], p[2]));
      const p2 = inertialPos(it.orbit, t + 20);
      nx.copy(v3(p2[0], p2[1], p2[2])).sub(worldPos);
      y.copy(worldPos).normalize();
      x.copy(nx).addScaledVector(y, -nx.dot(y)).normalize();
      z.crossVectors(x, y);
      m4.makeBasis(x, y, z);
      holder.quaternion.setFromRotationMatrix(m4);
      holder.position.copy(worldPos);
      // constant on-screen size: SAT_PX across (times it.size) whatever the camera distance
      const worldPerPx = (2 * cam.distanceTo(worldPos) * Math.tan((this.camera.fov * D2R) / 2)) / Math.max(1, this.size.h);
      const s = Math.max(0.00002, ((SAT_PX * (it.size ?? 1)) / modelExt) * worldPerPx);
      holder.scale.setScalar(s);
      // ring orientation
      const { p: P, q: Q } = orbitPlaneBasis(it.orbit, t);
      const P3 = v3(P[0], P[1], P[2]), Q3 = v3(Q[0], Q[1], Q[2]);
      ringGroup.matrix.makeBasis(P3, Q3, new THREE.Vector3().crossVectors(P3, Q3));
      ringGroup.matrixWorldNeedsUpdate = true;
      // nadir line + dot
      const surf = worldPos.clone().normalize();
      const arr = nadirGeo.attributes.position as THREE.BufferAttribute;
      arr.setXYZ(0, worldPos.x, worldPos.y, worldPos.z);
      arr.setXYZ(1, surf.x * 1.002, surf.y * 1.002, surf.z * 1.002);
      arr.needsUpdate = true;
      dot.position.copy(surf).multiplyScalar(1.003);
      dot.scale.setScalar(cam.distanceTo(dot.position) * 0.022);
    };
    return {
      update,
      labels: [{ el: label, pos: () => worldPos, off: [SAT_PX * (it.size ?? 1) * 0.55, -SAT_PX * (it.size ?? 1) * 0.35], clamp: true }],
      dispose: () => {
        this.scene.remove(holder, ringGroup, nadir, dot);
        disposeSatelliteModel(model);
        ring.geometry.dispose(); ringMat.dispose(); this.lineMats.delete(ringMat);
        nadirGeo.dispose(); nadirMat.dispose(); dotMat.dispose();
      },
    };
  }

  private makeTrack(it: { orbit: SatItem['orbit']; t0: number; t1: number; stepS?: number; color: string; opacity?: number; width?: number; dayOnly?: { decDeg: number } }): Entry {
    const raw = groundTrack(it.orbit, it.t0, it.t1, it.stepS ?? 30);
    const keep = raw.map((p) => !it.dayOnly || isDaylit(p.lat, p.lon, p.t, it.dayOnly.decDeg));
    const pts = raw.map((p) => ef(p.lat, p.lon, 1.0022));
    const arr: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) if (keep[i] && keep[i + 1]) arr.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    const g = new LineSegmentsGeometry();
    g.setPositions(arr.length ? arr : [0, 0, 0, 0, 0, 0]);
    const mat = this.lineMat(it.color, it.width ?? 1.4, it.opacity ?? 0.95);
    const l = new LineSegments2(g, mat);
    l.frustumCulled = false;
    this.earthGroup.add(l);
    return { obj: l, dispose: () => { this.earthGroup.remove(l); g.dispose(); mat.dispose(); this.lineMats.delete(mat); } };
  }

  private makeSwath(it: { orbit: SatItem['orbit']; t0: number; t1: number; widthKm: number; stepS?: number; color: string; opacity?: number; dayOnly?: { decDeg: number } }): Entry {
    const cols = Math.max(2, Math.ceil(it.widthKm / 220));
    const rows = swathGrid(it.orbit, it.t0, it.t1, it.widthKm, it.stepS ?? 30, cols);
    const n = rows.length, stride = cols + 1;
    const pos = new Float32Array(n * stride * 3);
    rows.forEach((row, i) => row.forEach((p, j) => { const v = ef(p.lat, p.lon, 1.0012); pos.set([v.x, v.y, v.z], (i * stride + j) * 3); }));
    const idx: number[] = [];
    const ok = rows.map((row, i) => !it.dayOnly || isDaylit(row[cols >> 1].lat, row[cols >> 1].lon, it.t0 + i * (it.stepS ?? 30), it.dayOnly.decDeg));
    for (let i = 0; i < n - 1; i++) {
      if (!ok[i] || !ok[i + 1]) continue;
      for (let j = 0; j < cols; j++) {
        const a = i * stride + j, b = a + 1, c = a + stride, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(it.color), transparent: true, opacity: it.opacity ?? 0.28, side: THREE.DoubleSide,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    this.earthGroup.add(m);
    return { obj: m, dispose: () => { this.earthGroup.remove(m); g.dispose(); mat.dispose(); } };
  }

  /** A tessellated spherical cap (so the flat triangles never dip under the surface). */
  private capGeometry(lat: number, lon: number, radiusDeg: number, radius = 1.0014): THREE.BufferGeometry {
    const rings = Math.max(6, Math.ceil(radiusDeg / 4)), segs = 128;
    const pos: number[] = [];
    const idx: number[] = [];
    const centre = ef(lat, lon, radius);
    pos.push(centre.x, centre.y, centre.z);
    const kmMax = radiusDeg * D2R * RE_KM;
    for (let r = 1; r <= rings; r++) {
      for (let s = 0; s < segs; s++) {
        const d = destination({ lat, lon }, (360 * s) / segs, (kmMax * r) / rings);
        const p = ef(d.lat, d.lon, radius);
        pos.push(p.x, p.y, p.z);
      }
    }
    for (let s = 0; s < segs; s++) idx.push(0, 1 + s, 1 + ((s + 1) % segs));
    for (let r = 1; r < rings; r++) {
      const a = 1 + (r - 1) * segs, b = 1 + r * segs;
      for (let s = 0; s < segs; s++) {
        const s1 = (s + 1) % segs;
        idx.push(a + s, b + s, b + s1, a + s, b + s1, a + s1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  private makeDisc(it: { id: string; lat: number; lon: number; radiusDeg: number; innerRadiusDeg?: number; color: string; opacity?: number; label?: string }): Entry {
    const g = this.capGeometry(it.lat, it.lon, it.radiusDeg);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(it.color), transparent: true, opacity: (it.opacity ?? 0.16), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    this.earthGroup.add(mesh);
    const edgePts: THREE.Vector3[] = [];
    for (let i = 0; i <= 160; i++) {
      const d = destination({ lat: it.lat, lon: it.lon }, (360 * i) / 160, it.radiusDeg * D2R * RE_KM);
      edgePts.push(ef(d.lat, d.lon, 1.003));
    }
    const lm = this.lineMat(it.color, 1.6, 0.9, true);
    const edge = this.line(edgePts, lm);
    this.earthGroup.add(edge);
    const extra: { g?: THREE.BufferGeometry; m?: THREE.Material; mesh?: THREE.Mesh } = {};
    if (it.innerRadiusDeg) {
      extra.g = this.capGeometry(it.lat, it.lon, it.innerRadiusDeg, 1.0016);
      extra.m = new THREE.MeshBasicMaterial({ color: new THREE.Color(it.color), transparent: true, opacity: (it.opacity ?? 0.16) * 1.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      extra.mesh = new THREE.Mesh(extra.g, extra.m);
      extra.mesh.frustumCulled = false;
      this.earthGroup.add(extra.mesh);
    }
    const labels: LabelRef[] = [];
    if (it.label) {
      const el = this.mkLabel(it.label, it.color, 'is-region');
      const p = ef(it.lat, it.lon, 1.004);
      const w = new THREE.Vector3();
      labels.push({ el, surface: true, pos: () => this.earthGroup.localToWorld(w.copy(p)) });
    }
    return {
      labels,
      dispose: () => {
        this.earthGroup.remove(mesh, edge); g.dispose(); mat.dispose(); edge.geometry.dispose(); lm.dispose(); this.lineMats.delete(lm);
        if (extra.mesh) { this.earthGroup.remove(extra.mesh); extra.g?.dispose(); extra.m?.dispose(); }
      },
    };
  }

  private makeMarker(it: MarkerItem): Entry {
    const el = this.mkLabel(it.label ?? '', it.color, 'is-marker');
    if (!it.label) el.classList.add('is-bare');
    const p = ef(it.lat, it.lon, 1.003);
    const w = new THREE.Vector3();
    return { labels: [{ el, surface: true, pos: () => this.earthGroup.localToWorld(w.copy(p)) }], dispose: () => { /* label removed by remove() */ } };
  }

  private makePixels(it: PixelsItem): Entry {
    const n = it.cells.length;
    const pos = new Float32Array(n * 4 * 3), col = new Float32Array(n * 4 * 4);
    const idx: number[] = [];
    const c = new THREE.Color();
    it.cells.forEach((cell, i) => {
      const dLat = cell.sizeKm / 2 / 111.19;
      const dLon = dLat / Math.max(Math.cos(cell.lat * D2R), 0.05);
      const cs = [[cell.lat - dLat, cell.lon - dLon], [cell.lat - dLat, cell.lon + dLon], [cell.lat + dLat, cell.lon + dLon], [cell.lat + dLat, cell.lon - dLon]];
      c.set(cell.color);
      cs.forEach(([la, lo], k) => {
        const p = ef(la, lo, 1.0018);
        pos.set([p.x, p.y, p.z], (i * 4 + k) * 3);
        col.set([c.r, c.g, c.b, cell.alpha ?? 0.85], (i * 4 + k) * 4);
      });
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    this.earthGroup.add(m);
    return { obj: m, dispose: () => { this.earthGroup.remove(m); g.dispose(); mat.dispose(); } };
  }

  private makeRegion(it: RegionItem): Entry {
    let geo: THREE.BufferGeometry;
    let outline: THREE.Vector3[] = [];
    let labelAt: [number, number] = [0, 0];
    if (it.cap) {
      const rad = 90 - Math.abs(it.cap.latDeg);
      const south = it.cap.latDeg < 0;
      geo = this.capGeometry(south ? -90 : 90, 0, rad, 1.0010);
      for (let i = 0; i <= 180; i++) outline.push(ef(it.cap.latDeg, (i / 180) * 360 - 180, 1.0026));
      labelAt = [it.cap.latDeg + (south ? -2 : 2), 0];
    } else {
      const ring = it.ring ?? [];
      const contour = ring.map(([la, lo]) => new THREE.Vector2(lo, la));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      const verts: number[] = [];
      const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c2: THREE.Vector3, depth: number) => {
        if (depth === 0) {
          for (const p of [a, b, c2]) { const q = p.clone().normalize().multiplyScalar(1.0010); verts.push(q.x, q.y, q.z); }
          return;
        }
        const ab = a.clone().add(b).multiplyScalar(0.5), bc = b.clone().add(c2).multiplyScalar(0.5), ca = c2.clone().add(a).multiplyScalar(0.5);
        pushTri(a, ab, ca, depth - 1); pushTri(ab, b, bc, depth - 1); pushTri(ca, bc, c2, depth - 1); pushTri(ab, bc, ca, depth - 1);
      };
      for (const [i, j, k] of tris) pushTri(ef(ring[i][0], ring[i][1], 1), ef(ring[j][0], ring[j][1], 1), ef(ring[k][0], ring[k][1], 1), 3);
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      // outline densified along the segments
      for (let i = 0; i < ring.length; i++) {
        const a = ef(ring[i][0], ring[i][1], 1), b = ef(ring[(i + 1) % ring.length][0], ring[(i + 1) % ring.length][1], 1);
        for (let s = 0; s < 8; s++) outline.push(a.clone().lerp(b, s / 8).normalize().multiplyScalar(1.0026));
      }
      outline.push(outline[0].clone());
      labelAt = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
    }
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(it.color), transparent: true, opacity: it.fillOpacity ?? 0.16, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    this.earthGroup.add(mesh);
    const lm = this.lineMat(it.color, 1.6, 0.95);
    const ol = this.line(outline, lm);
    this.earthGroup.add(ol);
    const labels: LabelRef[] = [];
    if (it.label) {
      const el = this.mkLabel(it.label, it.color, 'is-region');
      const p = ef(labelAt[0], labelAt[1], 1.004);
      const w = new THREE.Vector3();
      labels.push({ el, surface: true, pos: () => this.earthGroup.localToWorld(w.copy(p)) });
    }
    return { labels, dispose: () => { this.earthGroup.remove(mesh, ol); geo.dispose(); mat.dispose(); ol.geometry.dispose(); lm.dispose(); this.lineMats.delete(lm); } };
  }

  private makeLatLine(it: { latDeg: number; color: string; label?: string }): Entry {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 240; i++) pts.push(ef(it.latDeg, (i / 240) * 360 - 180, 1.0026));
    const lm = this.lineMat(it.color, 1.3, 0.8, true);
    const l = this.line(pts, lm);
    this.earthGroup.add(l);
    const labels: LabelRef[] = [];
    if (it.label) {
      const el = this.mkLabel(it.label, it.color, 'is-region');
      const p = ef(it.latDeg, 0, 1.004);
      const w = new THREE.Vector3();
      labels.push({ el, surface: true, pos: () => this.earthGroup.localToWorld(w.copy(p)) });
    }
    return { labels, dispose: () => { this.earthGroup.remove(l); l.geometry.dispose(); lm.dispose(); this.lineMats.delete(lm); } };
  }

  // ------------------------------------------------------------ view

  focus(lat: number, lon: number, dist: number | undefined, animate: boolean, aim?: { lat: number; lon: number; r: number }): void {
    this.tgt.lat = Math.max(-88, Math.min(88, lat));
    this.tgt.lon = this.cur.lon + wrap180(lon - this.cur.lon);
    if (dist !== undefined) this.tgt.dist = Math.max(1.18, Math.min(MAX_DIST, dist));
    const a = aim ? ef(aim.lat, aim.lon, aim.r) : null;
    this.tgt.aim = a ? [a.x, a.y, a.z] : [0, 0, 0];
    if (!animate) { this.cur = { ...this.tgt, aim: [...this.tgt.aim] }; }
    // "Home" (the 0 key) returns to the last framing a station asked for
    this.home = { ...this.tgt, aim: [...this.tgt.aim] };
  }
  zoomBy(f: number): void { this.tgt.dist = Math.max(1.18, Math.min(MAX_DIST, this.tgt.dist * f)); }
  resetView(): void { this.tgt = { ...this.home, aim: [...this.home.aim] }; this.tgt.lon = this.cur.lon + wrap180(this.home.lon - this.cur.lon); }
  setDescription(text: string): void { this.desc.textContent = text; }
  setSun(decDeg: number): void { this.sunDec = decDeg; }

  setQuality(q: Quality): void { this.quality = q; this.applyQuality(); }
  private applyQuality(): void {
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(this.quality === 'high' ? Math.min(dpr, 2) : 1);
    this.clouds.visible = this.quality === 'high' && this.cloudReady;
    this.resize();
    // clouds are loaded lazily; if we switched up after starting low, fetch them
    if (this.quality === 'high' && !this.cloudReady && this.texLoaded) {
      void this.loadTextures(this.baseUrlCache(), this.earthMat.uniforms.uDay.value, this.cloudMat.uniforms.uCloud.value);
    }
  }
  private baseUrlCache(): string { return (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'; }

  private inset = 18;
  private controlsInset(): number { return this.inset; }

  resize(): void {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%'; this.canvas.style.height = '100%';
    this.camera.aspect = w / h;
    // keep the whole globe framed on narrow / short stages
    this.camera.fov = w / h < 0.9 ? 44 : 32;
    // the transport buttons sit over the bottom edge: shift the picture up so the Earth is centred in the clear area
    this.camera.setViewOffset(w, h, 0, this.controlsInset(), w, h);
    this.camera.updateProjectionMatrix();
    this.lineMats.forEach((m) => m.resolution.set(w, h));
    const stars = this.scene.getObjectByName('stars') as THREE.Points | undefined;
    if (stars) (stars.material as THREE.ShaderMaterial).uniforms.uPx.value = this.renderer.getPixelRatio();
  }

  // ------------------------------------------------------------ frame

  private tmpCam = new THREE.Vector3();
  private tmpV = new THREE.Vector3();

  render(t: number, dt: number): void {
    if (this.disposed) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 9);
    const dl = wrap180(this.tgt.lon - this.cur.lon);
    this.cur.lon += dl * k;
    this.cur.lat += (this.tgt.lat - this.cur.lat) * k;
    this.cur.dist += (this.tgt.dist - this.cur.dist) * k;
    for (let i = 0; i < 3; i++) this.cur.aim[i] += (this.tgt.aim[i] - this.cur.aim[i]) * k;

    const theta = earthRotationRad(t);
    this.earthGroup.rotation.y = theta;
    this.clouds.rotation.y = ((t / DAY_S) * 0.045);

    // camera follows the Earth's surface (view lat/lon are Earth-fixed)
    const dir = ef(this.cur.lat, this.cur.lon, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), theta);
    const aim = this.tmpV.set(this.cur.aim[0], this.cur.aim[1], this.cur.aim[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), theta);
    this.camera.position.copy(dir).multiplyScalar(this.cur.dist).add(aim);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(aim);
    this.camera.updateMatrixWorld();

    const s = sunDirection(t, this.sunDec);
    const sd = v3(s[0], s[1], s[2]);
    this.earthMat.uniforms.uSun.value.copy(sd);
    this.cloudMat.uniforms.uSun.value.copy(sd);
    ((this.scene.getObjectByName('atmo') as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uSun.value.copy(sd);
    this.sunLight.position.copy(sd).multiplyScalar(50);

    if (this.texLoaded && this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / 0.9);
      this.earthMat.uniforms.uTex.value = this.fade * this.fade * (3 - 2 * this.fade);
    }

    const cam = this.tmpCam.copy(this.camera.position);
    for (const e of this.entries.values()) e.update?.(t, cam);
    this.renderer.render(this.scene, this.camera);
    this.placeLabels(cam);
    this.watchFps(dt);
  }

  private occluded(cam: THREE.Vector3, p: THREE.Vector3, surface: boolean): boolean {
    if (surface) return p.dot(cam) < 1.0 + 0.002; // on the visible hemisphere only
    const d = this.tmpV.copy(p).sub(cam);
    const len2 = d.lengthSq();
    const t = Math.max(0, Math.min(1, -cam.dot(d) / len2));
    const closest = cam.x + d.x * t, cy = cam.y + d.y * t, cz = cam.z + d.z * t;
    return Math.hypot(closest, cy, cz) < 0.995;
  }

  private placeLabels(cam: THREE.Vector3): void {
    const w = this.size.w, h = this.size.h;
    const v = new THREE.Vector3();
    for (const e of this.entries.values()) {
      if (!e.labels) continue;
      for (const l of e.labels) {
        const p = l.pos();
        v.copy(p).project(this.camera);
        const hidden = v.z > 1 || v.z < -1 || this.occluded(cam, p, !!l.surface) || (!l.clamp && (Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05));
        l.el.style.opacity = hidden ? '0' : '1';
        let px = ((v.x + 1) / 2) * w + (l.off?.[0] ?? 0), py = ((1 - v.y) / 2) * h + (l.off?.[1] ?? 0);
        if (l.clamp) {
          const lw = l.el.offsetWidth || 120, lh = l.el.offsetHeight || 20;
          // flip to the satellite's left when the label would run off the right edge, then keep it inside the frame
          if (px + lw > w - 6) px = ((v.x + 1) / 2) * w - (l.off?.[0] ?? 0) - lw;
          px = Math.min(Math.max(px, 6), Math.max(6, w - 6 - lw));
          py = Math.min(Math.max(py, lh / 2 + 6), h - lh / 2 - 44);
        }
        l.el.style.transform = `translate(${px}px, ${py}px)`;
      }
    }
  }

  private watchFps(dt: number): void {
    if (this.fpsChecked || !this.texLoaded || dt <= 0 || dt > 0.5) return;
    this.fpsSamples.push(dt);
    if (this.fpsSamples.length >= 100) {
      const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
      this.fpsChecked = true;
      if (avg > 1 / 24 && this.quality === 'high') {
        this.quality = 'low';
        this.applyQuality();
        this.onQualityHint?.('low', `measured ${(1 / avg).toFixed(0)} fps over the first seconds`);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('keydown', this.onKey);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.clear();
    this.scene.traverse((o) => { if (o !== this.scene) disposeObject(o); });
    this.textures.forEach((t) => t.dispose());
    this.dotTex.dispose();
    this.envTex?.dispose();
    disposeSharedMaterials();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove(); this.labelLayer.remove(); this.desc.remove();
  }
}

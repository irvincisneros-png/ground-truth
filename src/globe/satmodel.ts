/**
 * Authored spacecraft models (three.js primitives, no imported assets).
 * Local axes: +Y = zenith (away from Earth), -Y = nadir (instrument face), +X = direction of travel,
 * Z = orbit normal (solar-array axis). Roughly 3 units across; the globe rescales them to a constant screen size.
 */
import * as THREE from 'three';

export type ModelKind = 'geo' | 'polar' | 'altimeter' | 'landsat' | 'microwave';

interface Mats {
  foil: THREE.MeshStandardMaterial;
  cells: THREE.MeshStandardMaterial;
  frame: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  black: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  dish: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

let shared: Mats | null = null;
const disposables: THREE.Material[] = [];

function mats(): Mats {
  if (shared) return shared;
  const cellsMap = canvasTex(512, 256, (g) => {
    const grd = g.createLinearGradient(0, 0, 512, 256);
    grd.addColorStop(0, '#102a63'); grd.addColorStop(0.5, '#1b3f8c'); grd.addColorStop(1, '#0e2556');
    g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
    // cell grid
    g.strokeStyle = 'rgba(205,218,240,0.55)'; g.lineWidth = 1.5;
    for (let x = 0; x <= 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
    for (let y = 0; y <= 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
    // bus bars
    g.strokeStyle = 'rgba(230,236,250,0.35)'; g.lineWidth = 1;
    for (let x = 8; x < 512; x += 32) for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x + k * 5, 0); g.lineTo(x + k * 5, 256); g.stroke(); }
    // sheen
    const sh = g.createLinearGradient(0, 0, 512, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(160,190,255,0.12)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#c9d3e6'; g.lineWidth = 8; g.strokeRect(0, 0, 512, 256);
  });
  const r = rng(7);
  const foilMap = canvasTex(256, 256, (g) => {
    g.fillStyle = '#b8903f'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 520; i++) {
      const x = r() * 256, y = r() * 256, rad = 4 + r() * 22;
      const l = r() > 0.5;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, l ? 'rgba(255,224,150,0.38)' : 'rgba(70,45,10,0.34)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  });
  foilMap.wrapS = foilMap.wrapT = THREE.RepeatWrapping;
  const foilBump = canvasTex(128, 128, (g) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 300; i++) {
      const x = r() * 128, y = r() * 128, rad = 3 + r() * 14, v = r() > 0.5 ? 255 : 0;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(${v},${v},${v},0.5)`); grd.addColorStop(1, 'rgba(128,128,128,0)');
      g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }, false);
  const m: Mats = {
    foil: new THREE.MeshStandardMaterial({ map: foilMap, bumpMap: foilBump, bumpScale: 1.4, metalness: 0.85, roughness: 0.38 }),
    cells: new THREE.MeshStandardMaterial({ map: cellsMap, metalness: 0.55, roughness: 0.3, emissive: new THREE.Color(0x0a1a44), emissiveIntensity: 0.55 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x9aa4b8, metalness: 0.8, roughness: 0.45 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe9edf5, metalness: 0.25, roughness: 0.5 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0b0d12, metalness: 0.4, roughness: 0.55 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xc3cbda, metalness: 0.95, roughness: 0.28 }),
    dish: new THREE.MeshStandardMaterial({ color: 0xeef1f7, metalness: 0.3, roughness: 0.42, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  };
  for (const k of Object.keys(m) as (keyof Mats)[]) disposables.push(m[k]);
  shared = m;
  return m;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function cyl(rt: number, rb: number, h: number, mat: THREE.Material, seg = 28): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
}

/** A parabolic dish facing -Y (nadir) by default; rotate the returned group to aim. */
function dish(radius: number, depth: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  // lathe profile of a paraboloid: y = depth * (r/radius)^2
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 14; i++) {
    const r = (radius * i) / 14;
    pts.push(new THREE.Vector2(r, depth * (r / radius) ** 2));
  }
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), mat);
  bowl.rotation.x = Math.PI; // opening toward -Y
  g.add(bowl);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.018, 6, 48), mat);
  rim.rotation.x = Math.PI / 2; rim.position.y = -depth;
  g.add(rim);
  return g;
}

function wing(m: Mats, side: 1 | -1, panels: number, w: number, l: number, offset = 0.55): THREE.Group {
  const g = new THREE.Group();
  const yoke = cyl(0.045, 0.045, 0.5, m.metal, 10);
  yoke.rotation.x = Math.PI / 2; yoke.position.z = side * (offset + 0.25);
  g.add(yoke);
  let z = offset + 0.5;
  for (let i = 0; i < panels; i++) {
    const p = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.035, l),
      [m.frame, m.frame, m.cells, m.frame, m.frame, m.frame],
    );
    p.position.set(0, 0, side * (z + l / 2));
    g.add(p);
    // a slightly smaller grey underside plate gives the array thickness
    const back = box(w * 0.98, 0.012, l * 0.98, m.white, 0, -0.024, side * (z + l / 2));
    g.add(back);
    z += l + 0.03;
  }
  return g;
}

function sensorFace(m: Mats, r: number): THREE.Group {
  const g = new THREE.Group();
  const ring = cyl(r * 1.08, r * 1.08, 0.06, m.metal, 32); ring.position.y = -0.03;
  const body = cyl(r, r * 0.86, 0.34, m.black, 32); body.position.y = -0.2;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(r * 0.72, 32), new THREE.MeshStandardMaterial({ color: 0x1a2a4a, metalness: 0.9, roughness: 0.1 }));
  lens.rotation.x = Math.PI / 2; lens.position.y = -0.375;
  g.add(ring, body, lens);
  return g;
}

export function buildSatellite(kind: ModelKind, accent: number): THREE.Group {
  const m = mats();
  const root = new THREE.Group();
  const bus = new THREE.Group();
  root.add(bus);

  // accent beacon so each platform is identifiable at distance
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: accent }));
  beacon.position.set(0, 0.62, 0);

  switch (kind) {
    case 'geo': {
      bus.add(box(1.15, 1.05, 1.45, m.foil));
      bus.add(box(1.2, 0.05, 1.5, m.white, 0, 0.55, 0));
      const s = sensorFace(m, 0.3); s.position.set(0.1, -0.52, 0); bus.add(s);
      const d = dish(0.38, 0.12, m.dish); d.position.set(-0.35, 0.5, 0.45); d.rotation.x = -0.5; bus.add(d);
      const d2 = dish(0.26, 0.09, m.dish); d2.position.set(0.3, 0.52, -0.45); d2.rotation.x = 0.55; bus.add(d2);
      root.add(wing(m, 1, 3, 1.15, 0.95, 0.72), wing(m, -1, 3, 1.15, 0.95, 0.72));
      break;
    }
    case 'polar': {
      bus.add(box(0.95, 0.85, 1.7, m.foil));
      bus.add(box(1.0, 0.05, 1.75, m.white, 0, 0.45, 0));
      // rotating-telescope radiometer: a cylinder lying across the track
      const tele = cyl(0.26, 0.26, 0.9, m.black); tele.rotation.x = Math.PI / 2; tele.position.set(0.12, -0.6, 0); bus.add(tele);
      const cap = cyl(0.275, 0.275, 0.08, m.metal); cap.rotation.x = Math.PI / 2; cap.position.set(0.12, -0.6, 0.48); bus.add(cap);
      const ap = box(0.38, 0.05, 0.5, m.metal, 0.12, -0.84, 0); bus.add(ap);
      const d = dish(0.3, 0.1, m.dish); d.position.set(-0.3, 0.52, -0.3); d.rotation.x = 0.4; bus.add(d);
      root.add(wing(m, -1, 4, 1.3, 0.85, 0.9));
      break;
    }
    case 'altimeter': {
      bus.add(box(1.0, 0.9, 1.1, m.foil));
      bus.add(box(1.05, 0.05, 1.15, m.white, 0, 0.47, 0));
      const mast = cyl(0.05, 0.05, 0.35, m.metal, 10); mast.position.y = -0.6; bus.add(mast);
      const dsh = dish(0.62, 0.2, m.dish); dsh.position.y = -0.72; bus.add(dsh);
      const feed = cyl(0.035, 0.035, 0.24, m.metal, 8); feed.position.y = -0.62; bus.add(feed);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), m.metal); tip.position.y = -0.52; bus.add(tip);
      const star = box(0.18, 0.22, 0.18, m.black, -0.55, 0.15, 0.2); bus.add(star);
      root.add(wing(m, 1, 2, 1.0, 1.0, 0.68), wing(m, -1, 2, 1.0, 1.0, 0.68));
      break;
    }
    case 'landsat': {
      bus.add(box(1.0, 1.0, 1.3, m.foil));
      bus.add(box(1.05, 0.05, 1.35, m.white, 0, 0.52, 0));
      const oli = box(0.7, 0.45, 0.9, m.black, 0, -0.7, 0); bus.add(oli);
      const gold = box(0.74, 0.04, 0.94, m.foil, 0, -0.46, 0); bus.add(gold);
      const aperture = cyl(0.22, 0.22, 0.06, m.metal, 24); aperture.position.y = -0.95; bus.add(aperture);
      const d = dish(0.28, 0.09, m.dish); d.position.set(-0.3, 0.55, 0.3); d.rotation.x = -0.4; bus.add(d);
      const rad = box(0.5, 0.04, 0.55, m.white, 0.15, 0.1, -0.7); rad.rotation.x = 0.3; bus.add(rad);
      root.add(wing(m, 1, 3, 1.35, 0.8, 0.72));
      break;
    }
    case 'microwave': {
      bus.add(box(1.1, 0.95, 1.4, m.foil));
      bus.add(box(1.15, 0.05, 1.45, m.white, 0, 0.5, 0));
      // large conical-scanning drum antenna on the leading side
      const drum = cyl(0.2, 0.26, 0.55, m.metal, 20); drum.position.set(0.5, 0.35, 0); bus.add(drum);
      const big = dish(0.92, 0.3, m.dish); big.position.set(0.5, 0.78, 0); big.rotation.set(0, 0, -0.65);
      bus.add(big);
      const horn = cyl(0.04, 0.04, 0.5, m.metal, 8); horn.position.set(0.1, 0.8, 0); horn.rotation.z = 0.7; bus.add(horn);
      root.add(wing(m, 1, 3, 1.25, 0.85, 0.72));
      break;
    }
  }
  root.add(beacon);
  return root;
}

export function disposeSatelliteModel(g: THREE.Object3D): void {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}

/** Free the shared materials and textures (call once when the globe is torn down). */
export function disposeSharedMaterials(): void {
  if (!shared) return;
  for (const k of Object.keys(shared) as (keyof Mats)[]) {
    const mat = shared[k] as THREE.MeshStandardMaterial;
    mat.map?.dispose();
    mat.bumpMap?.dispose();
    mat.dispose();
  }
  disposables.length = 0;
  shared = null;
}

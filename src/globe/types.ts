import type { Orbit } from './orbits';
import type { ModelKind } from './satmodel';

export type { ModelKind };

export interface SatItem {
  kind: 'sat';
  id: string;
  label: string;
  orbit: Orbit;
  color: string;
  model: ModelKind;
  /** Draw the orbit ring (default true). */
  showOrbit?: boolean;
  /** Apparent size multiplier (default 1 = about 70 px across). */
  size?: number;
}

/** Thin ground track on the surface between two sim times. */
export interface TrackItem {
  kind: 'track';
  id: string;
  orbit: Orbit;
  t0: number;
  t1: number;
  stepS?: number;
  color: string;
  opacity?: number;
  /** Line width in CSS pixels. */
  width?: number;
  /** Draw only the part of the track that is on the day side (for sun-lit-only sensors). */
  dayOnly?: { decDeg: number };
}

/** Translucent instrument swath of a given width along the ground track. */
export interface SwathItem {
  kind: 'swath';
  id: string;
  orbit: Orbit;
  t0: number;
  t1: number;
  widthKm: number;
  stepS?: number;
  color: string;
  opacity?: number;
  /** Draw only the day-side part of the swath. */
  dayOnly?: { decDeg: number };
}

/** A circle on the surface (geostationary footprint). `innerRadiusDeg` draws a brighter "good view" disc. */
export interface DiscItem {
  kind: 'disc';
  id: string;
  lat: number;
  lon: number;
  radiusDeg: number;
  innerRadiusDeg?: number;
  color: string;
  opacity?: number;
  label?: string;
}

export interface MarkerItem {
  kind: 'marker';
  id: string;
  lat: number;
  lon: number;
  label?: string;
  color: string;
}

/** Square footprints (one per pixel). Colours are CSS colour strings. */
export interface PixelsItem {
  kind: 'pixels';
  id: string;
  cells: { lat: number; lon: number; sizeKm: number; color: string; alpha?: number }[];
}

/** A highlighted area: either a closed ring of [lat, lon] or a polar cap down to latDeg. */
export interface RegionItem {
  kind: 'region';
  id: string;
  ring?: [number, number][];
  cap?: { latDeg: number };
  color: string;
  fillOpacity?: number;
  label?: string;
}

export interface LatLineItem {
  kind: 'latline';
  id: string;
  latDeg: number;
  color: string;
  label?: string;
}

export type SceneItem = SatItem | TrackItem | SwathItem | DiscItem | MarkerItem | PixelsItem | RegionItem | LatLineItem;

export type Quality = 'high' | 'low';

export interface GlobeOptions {
  /** 'auto' picks from GPU caps and measured frame rate. */
  quality?: 'auto' | Quality;
  /** Force the SVG map (used by tests and by the "no WebGL" path). */
  force2d?: boolean;
  /** Initial view centre (Earth-fixed) and distance from Earth's centre in Earth radii. */
  view?: { lat: number; lon: number; dist: number };
  /** Show the transport controls and readouts (default true). */
  controls?: boolean;
  /** Initial time scale (sim seconds per real second). */
  timeScale?: number;
  startPlaying?: boolean;
  /** Sun declination, degrees (default -12). */
  sunDecDeg?: number;
  /** Accessible name for the interactive globe. */
  ariaLabel?: string;
}

/** The surface both renderers implement. Everything is in degrees, kilometres and sim seconds. */
export interface GlobeApi {
  readonly mode: '3d' | '2d';
  readonly element: HTMLElement;
  /** Resolves when textures are in (or failed, and the plain fallback look is in use). */
  readonly ready: Promise<void>;
  add(item: SceneItem): void;
  remove(id: string): void;
  clear(): void;
  setSimTime(t: number): void;
  getSimTime(): number;
  setTimeScale(s: number): void;
  play(): void;
  pause(): void;
  isPlaying(): boolean;
  setSunDeclination(deg: number): void;
  focus(lat: number, lon: number, dist?: number, animate?: boolean): void;
  quality(): Quality;
  onQualityChange(cb: (q: Quality, reason: string) => void): () => void;
  /** A one-line text description of what the globe currently shows (for assistive tech). */
  setDescription(text: string): void;
  resize(): void;
  dispose(): void;
}

/** What a renderer backend must provide to the facade. */
export interface Backend {
  readonly mode: '3d' | '2d';
  readonly ready: Promise<void>;
  add(item: SceneItem): void;
  remove(id: string): void;
  clear(): void;
  /** Draw one frame at sim time t. `dt` is real seconds since the previous frame. */
  render(t: number, dt: number): void;
  setSun(decDeg: number): void;
  focus(lat: number, lon: number, dist: number | undefined, animate: boolean): void;
  zoomBy(factor: number): void;
  resetView(): void;
  setDescription(text: string): void;
  setQuality(q: Quality): void;
  resize(): void;
  dispose(): void;
  /** Called by a backend when it cannot continue (context lost). */
  onFail?: (reason: string) => void;
  /** Called with measured performance for adaptive quality. */
  onQualityHint?: (q: Quality, reason: string) => void;
}

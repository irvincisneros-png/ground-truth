import type { GlobeApi } from '../../globe';
import type { StationId } from './data';

export interface StationState {
  interactionDone: boolean;
  check?: { attempts: number; firstCorrect: boolean; solved: boolean };
  done: boolean;
  /** Station-specific progress flags (small, JSON-safe). */
  flags: Record<string, boolean | number | string>;
}

export interface LegendItem { color: string; label: string; kind?: 'line' | 'area' | 'dot' }

export interface StationEnv {
  id: StationId;
  globe: GlobeApi;
  /** Container the station builds its interaction into. */
  host: HTMLElement;
  state: StationState;
  save(): void;
  /** Call once the main interaction goal is met; unlocks the trade-off card and check. */
  interactionDone(): void;
  /** Polite screen-reader announcement. */
  announce(msg: string): void;
  setCaption(text: string): void;
  setLegend(items: LegendItem[]): void;
}

export interface Station {
  /** Build the globe scene and start any timers. Called each time the station tab is shown. */
  enter(): void;
  /** Stop timers (the DOM stays). */
  leave(): void;
  dispose(): void;
}

export type StationFactory = (env: StationEnv) => Station;

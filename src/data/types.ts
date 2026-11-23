/** Types matching public/data/*.json (contracts in docs/SPEC.md). Units are in the field names; dates are ISO. */

export interface Source {
  name: string;
  url: string;
  licence: string;
  citation: string;
  retrieved: string;
}
export interface WithSources {
  sources: Source[];
}

export interface DhwPoint {
  date: string;
  dhw_cweeks: number;
}
export interface SurveyDistribution {
  group?: string;
  category?: number;
  pct: number;
  text?: string;
  count?: number;
}
export interface SurveyEntry {
  category: number;
  label: string;
  note?: string;
  /** True when `category` is the bottom of a range, for example 3 meaning "3 or higher". */
  categoryIsMinimum?: boolean;
  /** Region-level shares of surveyed reefs, when the source only publishes regions. */
  distribution?: SurveyDistribution[];
  basis?: string;
}
export interface Reef {
  id: string;
  name: string;
  lat: number;
  lon: number;
  crwStation?: string;
  dhw: DhwPoint[];
  peakDhwBySummer: Record<string, number>;
  survey: Record<string, SurveyEntry>;
  /** Range of reef-level DHW (deg C-weeks) that AIMS measured at the individually surveyed reefs in 2024. */
  aimsReefDhwRange2024?: [number, number];
}
export interface SurveyScaleEntry {
  category: number;
  label: string;
  description: string;
}
export interface ReefData extends WithSources {
  baseline: string;
  reefs: Reef[];
  surveyScale: SurveyScaleEntry[];
}

export interface BuoyPoint {
  date: string;
  logger_c: number;
  satellite_c: number;
}
export interface BuoyData extends WithSources {
  site: string;
  depth_m: number;
  series: BuoyPoint[];
}

export interface GmslPoint {
  t_year: number;
  gmsl_mm: number;
}
export interface SeaLevelData extends WithSources {
  gmsl: GmslPoint[];
  tideGauge: {
    station: string;
    lat: number;
    lon: number;
    series: { year: number; msl_mm: number }[];
  };
  rates: Record<string, number>;
}

/** Minimal GeoJSON subset used for overlays. */
export interface GeoGeometry {
  type: 'Polygon' | 'MultiPolygon' | 'LineString' | 'MultiLineString' | 'Point';
  coordinates: unknown;
}
export interface GeoFeature {
  type: 'Feature';
  properties?: Record<string, unknown> | null;
  geometry: GeoGeometry;
}
export interface GeoCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}
export interface ForestCase {
  id: string;
  label: string;
  /** [west, south, east, north] */
  bounds: [number, number, number, number];
  /** Path of the loss PNG, relative to public/data/ (for example "forest/blacksummer.png"). */
  lossPng: string;
  lossYears: [number, number];
  overlay: GeoGeometry | GeoFeature | GeoCollection;
  overlayKind: 'fire' | 'clearing';
  answer: 'climate-linked' | 'land-use';
  note: string;
  /** Colours the loss PNG uses, by year. Focus years are the ones the lesson is about. */
  lossLegend?: { year: number; hex: string; focus: boolean }[];
  stats?: {
    focus_loss_pct?: number;
    focus_loss_inside_overlay_pct?: number;
    overlay_area_pct?: number;
    pixel_m_approx?: number;
    /** Share of the crop window that lost tree cover in each year (the long record). */
    loss_by_year_pct_of_window?: Record<string, number>;
  };
}
export interface ForestData extends WithSources {
  cases: ForestCase[];
}

export interface YearValue {
  year: number;
  extent_mkm2: number;
}
export interface SeaIceData extends WithSources {
  antarctic: { feb_min: YearValue[]; sep_max: YearValue[] };
  arctic: { sep: YearValue[] };
  trendPctPerDecade: { arctic_sep: number } & Record<string, number>;
}

export interface LandData extends WithSources {
  bbox: [number, number, number, number];
  /** Flat rings: [lon, lat, lon, lat, ...] */
  polygons: number[][];
}

export interface DataFiles {
  reef: ReefData;
  buoy: BuoyData;
  sealevel: SeaLevelData;
  forest: ForestData;
  seaice: SeaIceData;
}
export type DataName = keyof DataFiles;

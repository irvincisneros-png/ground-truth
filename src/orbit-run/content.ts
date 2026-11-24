/** Orbit Run content: zones, sensors, hints, facts. Plain words, Australian spelling. */
export type ZoneId = 'ocean' | 'reef' | 'forest' | 'ice' | 'sea';
export type SensorId = 'heat' | 'colour' | 'radar' | 'microwave';
export type DataKind = 'temperature' | 'forest' | 'sea' | 'ice';

export interface SensorDef {
  id: SensorId;
  key: string;
  label: string;
  data: DataKind;
  color: string;
  blockedByCloud: boolean;
  blockedByNight: boolean;
}
export interface ZoneDef {
  id: ZoneId;
  label: string;
  sensor: SensorId;
  hint: string;
  /** Zones that may follow this one (sensible coastlines and climate bands). */
  next: ZoneId[];
}

export const SENSOR_ORDER: SensorId[] = ['heat', 'colour', 'radar', 'microwave'];

export const SENSORS: Record<SensorId, SensorDef> = {
  heat: { id: 'heat', key: '1', label: 'Heat camera', data: 'temperature', color: '#ff8a4c', blockedByCloud: true, blockedByNight: false },
  colour: { id: 'colour', key: '2', label: 'Colour camera', data: 'forest', color: '#7be07b', blockedByCloud: true, blockedByNight: true },
  radar: { id: 'radar', key: '3', label: 'Radar ruler', data: 'sea', color: '#5fd0ff', blockedByCloud: false, blockedByNight: false },
  microwave: { id: 'microwave', key: '4', label: 'Microwave eye', data: 'ice', color: '#c58bff', blockedByCloud: false, blockedByNight: false },
};

export const DATA_LABEL: Record<DataKind, string> = {
  temperature: 'Ocean temperature',
  forest: 'Forest cover',
  sea: 'Sea height',
  ice: 'Ice cover',
};
export const DATA_ORDER: DataKind[] = ['temperature', 'forest', 'sea', 'ice'];
export const DATA_SENSOR: Record<DataKind, SensorId> = { temperature: 'heat', forest: 'colour', sea: 'radar', ice: 'microwave' };

export const ZONES: Record<ZoneId, ZoneDef> = {
  ocean: { id: 'ocean', label: 'Warm ocean', sensor: 'heat', hint: 'Warm sea? Try the heat camera', next: ['reef', 'sea', 'forest'] },
  reef: { id: 'reef', label: 'Reef', sensor: 'heat', hint: 'Reef? Try the heat camera', next: ['ocean', 'forest'] },
  forest: { id: 'forest', label: 'Forest', sensor: 'colour', hint: 'Forest? Try the colour camera', next: ['ocean', 'sea', 'reef'] },
  ice: { id: 'ice', label: 'Sea ice', sensor: 'microwave', hint: 'Ice? Try the microwave eye', next: ['sea', 'ocean'] },
  sea: { id: 'sea', label: 'Open sea', sensor: 'radar', hint: 'Open sea? Try the radar ruler', next: ['ocean', 'ice', 'forest'] },
};

export const CLOUD_HINT = 'Clouds! Radar and microwave see through.';
export const NIGHT_HINT = 'Night! The colour camera needs sunlight.';
export const EDGE_HINT_TOP = 'Too high! Stay off the top.';
export const EDGE_HINT_BOTTOM = 'Too low! Stay off the bottom.';

/** One fact per run, rotating. All checked against docs/DATA-SOURCES.md and NASA/ESA public pages. */
export const FACTS: string[] = [
  'Real satellites collect millions of ocean temperatures every day. Scientists use them to spot marine heatwaves that bleach coral.',
  'The radar ruler measures sea height to about 3 cm on each pass. Averaging millions of passes shows the sea rising.',
  'Colour cameras map forest cover. Comparing pictures before and after a fire shows where the trees were burnt.',
  'Microwave sensors see sea ice through cloud and in the dark. Satellites have tracked Arctic sea ice since the late 1970s.',
  'Clouds block heat and colour cameras, so scientists combine them with radar and microwave sensors.',
  'Heat cameras read thermal infrared, so they still work at night. Colour cameras need sunlight.',
  'A satellite in low orbit circles Earth about every 90 minutes. That is a lot of data every day.',
  'Sea level has risen about 10 cm since satellites started measuring it in 1993.',
];

export const SAVE_KEY = 'ground-truth:orbit-run:v1';

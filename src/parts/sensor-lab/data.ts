/** Static content for the four stations: trade-off ratings and the one-question checks. */

export type StationId = 'thermal' | 'altimeter' | 'optical' | 'microwave';

export const CRITERIA = [
  { id: 'coverage', label: 'Coverage', hint: 'How much of the planet it can see' },
  { id: 'revisit', label: 'Revisit', hint: 'How often it looks at the same place' },
  { id: 'resolution', label: 'Resolution', hint: 'How small a detail one pixel shows' },
  { id: 'cloud', label: 'Through cloud', hint: 'Whether cloud blocks the measurement' },
  { id: 'night', label: 'At night', hint: 'Whether it works in the dark' },
] as const;
export type CriterionId = (typeof CRITERIA)[number]['id'];

export interface Rating { score: 1 | 2 | 3 | 4 | 5; note: string }
export interface TradeoffColumn { name: string; sub: string; color: string; ratings: Record<CriterionId, Rating> }

export const TRADEOFFS: Record<StationId, TradeoffColumn[]> = {
  thermal: [
    {
      name: 'Himawari-9', sub: 'Geostationary', color: '#4cc38a',
      ratings: {
        coverage: { score: 3, note: 'One fixed disc: all of Australia, poor near the poles' },
        revisit: { score: 5, note: 'A new image every 10 minutes' },
        resolution: { score: 2, note: '2 km pixels' },
        cloud: { score: 1, note: 'Cloud hides the sea surface' },
        night: { score: 5, note: 'Infrared needs no sunlight' },
      },
    },
    {
      name: 'VIIRS on NOAA-20', sub: 'Polar, sun-synchronous', color: '#7cc4ff',
      ratings: {
        coverage: { score: 5, note: 'Whole globe, pole to pole, 3060 km swath' },
        revisit: { score: 3, note: 'About twice a day (one day pass, one night pass)' },
        resolution: { score: 4, note: '750 m pixels' },
        cloud: { score: 1, note: 'Cloud hides the sea surface' },
        night: { score: 5, note: 'Infrared needs no sunlight' },
      },
    },
  ],
  altimeter: [
    {
      name: 'Jason-3 / Sentinel-6', sub: 'Radar altimeter, 66 degrees', color: '#ffb547',
      ratings: {
        coverage: { score: 2, note: 'Thin tracks only, and never above 66 degrees latitude' },
        revisit: { score: 2, note: 'Same track again every 9.9 days' },
        resolution: { score: 2, note: 'One footprint of several km along a single line' },
        cloud: { score: 4, note: 'Radar passes through cloud (heavy rain can disturb it)' },
        night: { score: 5, note: 'It makes its own signal' },
      },
    },
  ],
  optical: [
    {
      name: 'Landsat 8 + 9', sub: 'Optical multispectral', color: '#4cc38a',
      ratings: {
        coverage: { score: 4, note: 'Every land surface, in 185 km strips' },
        revisit: { score: 3, note: 'Every 16 days each, every 8 days together' },
        resolution: { score: 5, note: '30 m pixels: you can see a paddock' },
        cloud: { score: 1, note: 'Cloud blocks the view completely' },
        night: { score: 1, note: 'It measures reflected sunlight, so no sun means no data' },
      },
    },
  ],
  microwave: [
    {
      name: 'AMSR2 / SSMIS', sub: 'Passive microwave radiometer', color: '#7cc4ff',
      ratings: {
        coverage: { score: 5, note: 'Very wide swath, covers the poles almost daily' },
        revisit: { score: 5, note: 'About once a day or better at high latitudes' },
        resolution: { score: 1, note: 'Coarse: pixels about 25 km across' },
        cloud: { score: 5, note: 'Microwaves pass through cloud' },
        night: { score: 5, note: 'It measures emitted energy, so polar night is no problem' },
      },
    },
  ],
};

export interface CheckOption { text: string; correct?: boolean; feedback: string }
export interface Check { question: string; options: CheckOption[]; explain: string }

export const CHECKS: Record<StationId, Check> = {
  thermal: {
    question: 'Why is there no reading for this reef on this pass?',
    options: [
      { text: 'The satellite switched off while it flew over the reef.', feedback: 'The satellite was working. It recorded something at every pixel, but not everything it recorded is usable.' },
      {
        text: 'Cloud was in the way. Thermal infrared cannot see through it, so the pixel was flagged and left empty.', correct: true,
        feedback: 'Yes. The sensor saw the cold cloud top, not the sea, so the retrieval was rejected and flagged.',
      },
      { text: 'The water was too cold for the sensor to measure.', feedback: 'Warm or cold, the sea gives off infrared. The problem is what was between the sea and the satellite.' },
      { text: 'The reef is too small: satellites cannot see anything under 1 km.', feedback: 'A small reef can be a hard target, but it is not why this pixel is empty. Check the quality flag.' },
    ],
    explain: 'Gap-filled products such as CoralTemp fill these holes using earlier clear observations and nearby pixels. That makes them useful, but they are estimates, not direct readings.',
  },
  altimeter: {
    question: 'One reading scatters by about 3 cm. About how many independent readings must you average to pin the mean down to about 3 mm?',
    options: [
      { text: 'About 10', feedback: 'Ten readings only shrinks the error by a factor of about 3 (the square root of 10).' },
      { text: 'About 100', correct: true, feedback: 'Yes. The error shrinks like 1 divided by the square root of n, so n = 100 gives 3 cm / 10 = 3 mm.' },
      { text: 'About 1000', feedback: 'That would give about 1 mm. It works, but it is more than you need.' },
      { text: 'Averaging cannot do this.', feedback: 'Random scatter does average out. Averaging cannot remove a consistent (systematic) error, but this is random scatter.' },
    ],
    explain: 'This is why sea level is found from many passes averaged over the whole ocean, to a precision of millimetres a year. Averaging fixes random scatter, not a built-in bias.',
  },
  optical: {
    question: 'Why can Landsat not map forest cover at midnight?',
    options: [
      { text: 'Forests are hidden by the dark.', feedback: 'The forest is still there. The issue is what the sensor measures.' },
      { text: 'The satellite is on the wrong side of the Earth.', feedback: 'It orbits all night, but its optical sensor needs light from the Sun to measure.' },
      {
        text: 'Its sensor measures sunlight reflected by the surface. No sunlight, no reflected signal.', correct: true,
        feedback: 'Yes. Optical sensors are passive: they only record light that was reflected off the ground.',
      },
      { text: 'Trees stop reflecting infrared at night.', feedback: 'Trees reflect the same way day or night. It is the Sun that is missing.' },
    ],
    explain: 'Landsat crosses the equator mid-morning on purpose: the Sun is bright enough to read, and the lighting is similar from year to year.',
  },
  microwave: {
    question: 'Why do scientists use the same 15% concentration rule to count sea-ice extent every year?',
    options: [
      { text: 'Because 15% is the true edge of the ice.', feedback: 'There is no sharp true edge. Ice thins out gradually, so any threshold is a convention.' },
      {
        text: 'So numbers from different years and satellites can be compared. A rule that kept changing would fake a trend.', correct: true,
        feedback: 'Yes. A fixed rule keeps the measurement consistent over decades.',
      },
      { text: 'Because the satellite cannot detect less than 15%.', feedback: 'The satellite estimates every concentration. 15% is chosen because it is reliable and consistent, not because lower values are invisible.' },
      { text: 'To make the ice extent look as big as possible.', feedback: 'The rule is about consistency, not about making a number bigger or smaller.' },
    ],
    explain: 'Try the slider: moving the threshold changes the extent by millions of square kilometres. A fixed 15% rule means a change between years is a change in the ice, not in the rules.',
  },
};

export interface StationDef {
  id: StationId;
  tab: string;
  variable: string;
  headline: string;
  raw: string;
  derived: string;
  /** Short alt text for the orbit view. */
  globeCaption: string;
}

export const STATIONS: StationDef[] = [
  {
    id: 'thermal', tab: 'Thermal infrared', variable: 'Sea-surface temperature',
    headline: 'The satellite never feels the heat. It collects infrared light from the top thin skin of the sea, then we calculate a temperature.',
    raw: 'Infrared radiance', derived: 'Skin temperature',
    globeCaption: 'Himawari-9 hovers over one spot. NOAA-20 circles pole to pole and the Earth turns beneath it.',
  },
  {
    id: 'altimeter', tab: 'Radar altimeter', variable: 'Sea-surface height',
    headline: 'The satellite fires a radar pulse straight down and times the echo. Time becomes distance, and distance becomes height.',
    raw: 'Echo delay', derived: 'Sea-surface height',
    globeCaption: 'Ground tracks of Jason-3 / Sentinel-6. Watch the gaps between tracks, and the empty polar caps.',
  },
  {
    id: 'optical', tab: 'Optical multispectral', variable: 'Forest cover',
    headline: 'Landsat records sunlight bounced off the ground in several colours, including some we cannot see. The mix of colours gives away what is on the ground.',
    raw: 'Reflected light', derived: 'Tree cover',
    globeCaption: 'Landsat 8 and 9 sweep 185 km strips, 8 days apart on the same track. The night side gives no data.',
  },
  {
    id: 'microwave', tab: 'Passive microwave', variable: 'Sea-ice concentration',
    headline: 'The satellite listens for faint microwaves that the surface gives off. Ice and open water glow differently, even through cloud and the polar night.',
    raw: 'Microwave emission', derived: 'Ice concentration',
    globeCaption: 'A wide microwave swath covers the Antarctic almost every day, in polar night too.',
  },
];

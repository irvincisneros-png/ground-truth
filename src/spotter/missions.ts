/**
 * Satellite Spotter content. Plain words, Year 3-4 reading level, Australian spelling.
 * Everything a student reads in a mission lives here so it can be checked in one place (and tested).
 */

export type EyeId = 'heat' | 'radar' | 'colour' | 'microwave';
export type MissionId = 'ice' | 'forest' | 'sea' | 'reef';
export const EYE_IDS: EyeId[] = ['heat', 'radar', 'colour', 'microwave'];

export interface Eye {
  id: EyeId;
  name: string;
  /** One plain line on the pick card. */
  does: string;
  /** The real instrument family and a real satellite that carries it (shown on the scan step). */
  real: string;
  /** Which `src/globe` model and satellite spec the scan uses. */
  model: 'polar' | 'altimeter' | 'landsat' | 'microwave';
  satKey: 'noaa20' | 'jason3' | 'landsat8' | 'amsr2';
  color: string;
  scanLine: string;
}

export const EYES: Record<EyeId, Eye> = {
  heat: {
    id: 'heat', name: 'Heat camera', does: 'It measures how hot things are.',
    real: 'Real example: NOAA-20', model: 'polar', satKey: 'noaa20', color: '#ff8a5c',
    scanLine: 'The heat camera flies over Earth. It paints a map of how hot the sea is.',
  },
  radar: {
    id: 'radar', name: 'Radar ruler', does: 'It sends a signal down and times the echo.',
    real: 'Real example: Sentinel-6', model: 'altimeter', satKey: 'jason3', color: '#ffb547',
    scanLine: 'The radar ruler flies over Earth. It times echoes to measure the sea.',
  },
  colour: {
    id: 'colour', name: 'Colour camera', does: 'It takes pictures in colour, like a phone.',
    real: 'Real example: Landsat 9', model: 'landsat', satKey: 'landsat8', color: '#4cc38a',
    scanLine: 'The colour camera flies over Earth. It paints a picture of the land.',
  },
  microwave: {
    id: 'microwave', name: 'Microwave eye', does: 'It senses tiny waves. Clouds do not block them.',
    real: 'Real example: GCOM-W', model: 'microwave', satKey: 'amsr2', color: '#7cc4ff',
    scanLine: 'The microwave eye flies over Earth. It paints a map of the ice.',
  },
};

export interface Chip {
  text: string;
  correct?: boolean;
  /** Friendly hint when this chip is the wrong answer. */
  hint?: string;
}
export interface Blank {
  chips: Chip[];
}
/** A sentence is a list of text pieces and blank numbers (index into `blanks`). */
export type FramePart = string | number;
export interface Frame {
  parts: FramePart[];
  blanks: Blank[];
}

export interface Bonus {
  question: string;
  /** The right answer. */
  answer: 'yes' | 'no';
  wrong: string;
  reveal: string;
}

export interface Mission {
  id: MissionId;
  n: number;
  title: string;
  problem: string;
  bestEye: EyeId;
  /** Why the best eye is right ("Yes! because ...") and why each other eye is wrong. */
  reasons: Record<EyeId, string>;
  /** Short line on the before/after step. */
  changePrompt: string;
  /** Before/after kind: a pair of real images, or the real sea-level line. */
  compare: 'images' | 'sealevel';
  /** Where the globe looks during the scan. */
  view: { lat: number; lon: number; dist: number };
  frame: Frame;
  bonus?: Bonus;
}

export const MISSIONS: Mission[] = [
  {
    id: 'ice', n: 1, title: 'Ice',
    problem: 'Is the ice at the top of the world getting smaller?',
    bestEye: 'microwave',
    reasons: {
      microwave: 'It sees ice even in the dark and through clouds.',
      colour: 'It is dark for months at the North Pole.',
      heat: 'Clouds block it.',
      radar: 'It measures height, not ice.',
    },
    changePrompt: 'What changed?',
    compare: 'images',
    view: { lat: 78, lon: 0, dist: 2.7 },
    frame: {
      parts: ['The satellite shows the Arctic sea ice is ', 0, '. This is because Earth is getting ', 1, '.'],
      blanks: [
        { chips: [
          { text: 'growing', hint: 'Look at the pictures again. Is there more white ice, or less?' },
          { text: 'shrinking', correct: true },
          { text: 'the same', hint: 'Slide the line again. Do the two pictures look the same?' },
        ] },
        { chips: [
          { text: 'warmer', correct: true },
          { text: 'colder', hint: 'Ice melts when it gets warmer, not colder.' },
          { text: 'darker', hint: 'Darker is a colour, not a temperature. What makes ice melt?' },
        ] },
      ],
    },
  },
  {
    id: 'forest', n: 2, title: 'Forest',
    problem: 'What happened to these NSW forests in summer 2019–20?',
    bestEye: 'colour',
    reasons: {
      colour: 'It sees green trees and black burnt ground.',
      microwave: 'Its pixels are too big to see trees.',
      radar: 'It measures sea height.',
      heat: 'It is for the sea’s temperature.',
    },
    changePrompt: 'What changed?',
    compare: 'images',
    view: { lat: -33.5, lon: 150, dist: 2.6 },
    frame: {
      parts: ['The satellite shows the forest was ', 0, '. Hot, dry weather made the fires ', 1, ' likely, and climate change makes hot, dry weather ', 2, ' common.'],
      blanks: [
        { chips: [
          { text: 'flooded', hint: 'Look for water. Is the dark ground wet, or burnt?' },
          { text: 'snowed on', hint: 'Snow is white. The ground in the later picture is dark.' },
          { text: 'burnt', correct: true },
        ] },
        { chips: [
          { text: 'less', hint: 'Fires need dry bush to burn. Does hot, dry weather help them?' },
          { text: 'more', correct: true },
        ] },
        { chips: [
          { text: 'more', correct: true },
          { text: 'less', hint: 'Scientists found that climate change makes hot, dry weather happen more often.' },
        ] },
      ],
    },
  },
  {
    id: 'sea', n: 3, title: 'Sea level',
    problem: 'Is the sea getting higher?',
    bestEye: 'radar',
    reasons: {
      radar: 'It times an echo to measure the height of the sea.',
      colour: 'A photo can’t measure a few millimetres.',
      heat: 'It measures temperature.',
      microwave: 'It is for ice.',
    },
    changePrompt: 'What changed?',
    compare: 'sealevel',
    view: { lat: -10, lon: 150, dist: 3.4 },
    frame: {
      parts: ['The satellite shows the sea is ', 0, '. Warmer water takes up ', 1, ' space, and melting ice adds water.'],
      blanks: [
        { chips: [
          { text: 'staying the same', hint: 'Slide the line again. Does the line stay flat?' },
          { text: 'rising', correct: true },
          { text: 'falling', hint: 'Follow the line from 1993 to now. Does it go down?' },
        ] },
        { chips: [
          { text: 'less', hint: 'Warm water spreads out. Think about it taking up more room.' },
          { text: 'more', correct: true },
        ] },
      ],
    },
  },
  {
    id: 'reef', n: 4, title: 'Reef',
    problem: 'Why is coral on the Great Barrier Reef turning white?',
    bestEye: 'heat',
    reasons: {
      heat: 'It measures how hot the top of the sea is.',
      colour: 'It can’t measure temperature.',
      radar: 'It measures sea height.',
      microwave: 'It is for ice.',
    },
    changePrompt: 'What changed?',
    compare: 'images',
    view: { lat: -18, lon: 148, dist: 2.7 },
    frame: {
      parts: ['The satellite shows the sea was too ', 0, ', so the coral ', 1, '.'],
      blanks: [
        { chips: [
          { text: 'cold', hint: 'The red colours on the map mean heat stress. Is that cold?' },
          { text: 'salty', hint: 'This map shows temperature, not salt.' },
          { text: 'hot', correct: true },
        ] },
        { chips: [
          { text: 'grew', hint: 'The coral is turning white. Is that growing?' },
          { text: 'moved', hint: 'Coral cannot swim away. It stays put and turns white.' },
          { text: 'bleached', correct: true },
        ] },
      ],
    },
    bonus: {
      question: 'Is one hot summer enough to be sure the climate is changing?',
      answer: 'no',
      wrong: 'Not quite. One hot summer could be a one-off.',
      reveal: 'No. Scientists look at many years. The Great Barrier Reef has had mass bleaching in 1998, 2002, 2016, 2017, 2020, 2022, 2024 and 2025.',
    },
  },
];

/** The word that is explained for the first time on a given step ([mission][step], 0-based). */
export const NEW_WORDS: Partial<Record<number, Partial<Record<number, string>>>> = {
  0: { 0: 'satellite', 1: 'sensor', 3: 'sea-ice', 4: 'climate-change' },
  1: { 3: 'data' },
  3: { 0: 'coral-bleaching' },
};

export const STEP_NAMES = ['The problem', 'Pick the eye', 'Watch it scan', 'Before and after', 'Say what it shows'] as const;
export const STEP_COUNT = STEP_NAMES.length;
export const MISSION_COUNT = MISSIONS.length;

export const FINISH_LINE = 'You used satellite data to check on Earth, just like real scientists.';

export interface GlossaryEntry {
  id: string;
  word: string;
  text: string;
}
export const GLOSSARY: GlossaryEntry[] = [
  { id: 'satellite', word: 'Satellite', text: 'A machine that circles Earth in space.' },
  { id: 'sensor', word: 'Sensor', text: 'A satellite’s eye. It collects information.' },
  { id: 'data', word: 'Data', text: 'Numbers and pictures that we collect.' },
  { id: 'climate-change', word: 'Climate change', text: 'Earth’s weather patterns slowly changing, mostly getting warmer.' },
  { id: 'sea-ice', word: 'Sea ice', text: 'Frozen sea water that floats on top of the ocean.' },
  { id: 'coral-bleaching', word: 'Coral bleaching', text: 'Coral turns white when the sea is too hot.' },
];

export const sentenceText = (m: Mission): string => m.frame.parts.map((p) => (typeof p === 'number' ? '___' : p)).join('');

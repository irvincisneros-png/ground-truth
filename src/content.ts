/**
 * All lesson text that is shared between the student app, the scoring code and the teacher guide:
 * claims, evidence cards, limitation cards and the check-question options.
 * No data values live here: numbers shown to students always come from public/data/*.json at runtime.
 */

export type ClaimId = 'c-sea' | 'c-reef' | 'c-forest' | 'c-ice';
export type Strength = 0 | 1 | 2 | 3;

export const STRENGTHS: { value: Strength; label: string; desc: string }[] = [
  { value: 0, label: 'No evidence', desc: 'The data does not test this claim.' },
  { value: 1, label: 'Suggests', desc: 'Points that way, but it is early, narrow or indirect.' },
  { value: 2, label: 'Strongly supports', desc: 'Long record, several lines of evidence, one direction.' },
  { value: 3, label: 'Proves', desc: 'No room for doubt. Science rarely gets here.' },
];

export interface Claim {
  id: ClaimId;
  text: string;
  topic: string;
  /** The strongest strength the lesson evidence honestly supports. */
  justified: Strength;
  why: string;
}

export const CLAIMS: Claim[] = [
  {
    id: 'c-sea',
    topic: 'Sea level',
    text: 'Global sea level is rising faster now than it was in the 1990s.',
    justified: 2,
    why: 'More than 30 years of altimeter data, fitted over early and recent windows, show the rate increasing. That is a long record pointing one way, so it strongly supports the claim. It cannot prove it: every measurement has error and the record is short next to natural cycles.',
  },
  {
    id: 'c-reef',
    topic: 'Reef',
    text: 'Satellite heat-stress readings are a useful guide to where coral bleaching is most likely.',
    justified: 1,
    why: 'You checked two reefs and one survey year. That can suggest the link, but not strongly support it. Heat stress (DHW) measures risk, and depth, shade and a reef’s past bleaching change what actually happens.',
  },
  {
    id: 'c-forest',
    topic: 'Forest',
    text: 'Climate change made the 2019–20 Black Summer forest loss in NSW more likely.',
    justified: 1,
    why: 'Satellites show where and how much forest was lost. The “more likely” part comes from fire-weather research, not from the loss pixels, and it is about risk, not the cause of each fire. So the satellite evidence suggests the link but cannot carry it alone.',
  },
  {
    id: 'c-ice',
    topic: 'Ice',
    text: 'Arctic sea ice in September has shrunk over the satellite era.',
    justified: 2,
    why: 'Passive microwave sensors have measured Arctic sea ice every year since 1979. A long, steady decline in the September minimum strongly supports the claim. It stops short of proof, and it says nothing about ice sheets on land.',
  },
];

export type Relevance = 'core' | 'support' | 'none';

export interface EvidenceCard {
  id: string;
  topic: string;
  title: string;
  text: string;
  rel: Partial<Record<ClaimId, Relevance>>;
  /** True for the cherry-picked trap card: penalised for every claim. */
  trap?: boolean;
}

export const EVIDENCE: EvidenceCard[] = [
  { id: 'e-gmsl', topic: 'Sea level', title: 'Global mean sea level since 1993', text: 'Altimeter satellites measure sea-surface height all over the ocean. Averaged across the globe, the record runs for over 30 years.', rel: { 'c-sea': 'core' } },
  { id: 'e-dhw', topic: 'Reef', title: 'Heat stress (DHW) at two reefs over several summers', text: 'Degree Heating Weeks add up how much hotter than the usual summer maximum the water was, and for how long.', rel: { 'c-reef': 'core' } },
  { id: 'e-ice-arctic', topic: 'Ice', title: 'Arctic September sea-ice extent, 1979 to now', text: 'The yearly minimum extent from passive microwave sensors, with a trend line.', rel: { 'c-ice': 'core' } },
  { id: 'e-fireperim', topic: 'Forest', title: 'Fire perimeter drawn over the loss pixels', text: 'The burnt-area outline sits right on top of the NSW loss pixels from 2019–20.', rel: { 'c-forest': 'core' } },
  { id: 'e-rates', topic: 'Sea level', title: 'Rate of rise: early years against recent years', text: 'Trend lines fitted to 1993–2002 and 2015–2024 give two different rates in mm per year.', rel: { 'c-sea': 'core' } },
  { id: 'e-survey', topic: 'Reef', title: 'AIMS aerial bleaching survey, 2024', text: 'Observers flew over reefs and scored how much coral was bleached, on a scale from 0 (none) to 5 (extreme).', rel: { 'c-reef': 'core' } },
  { id: 'e-pair', topic: 'Sea level', title: 'Two hand-picked years that go the other way', text: 'Between one pair of years the global average fell. This card shows only that pair.', rel: {}, trap: true },
  { id: 'e-fireweather', topic: 'Forest', title: 'Fire-weather research on Black Summer', text: 'Studies found that climate change increased the risk of the extreme fire weather. They did not trace every fire to climate change.', rel: { 'c-forest': 'core' } },
  { id: 'e-ice-trend', topic: 'Ice', title: 'Arctic September trend: change per decade', text: 'A line fitted through every September since 1979, with the percent change per decade.', rel: { 'c-ice': 'core' } },
  { id: 'e-ice-ant', topic: 'Ice', title: 'Antarctic record high in 2014, record low in 2023', text: 'Antarctic sea ice swings up and down a lot from year to year.', rel: { 'c-ice': 'support' } },
  { id: 'e-buoy', topic: 'Reef', title: 'Logger at depth against satellite skin temperature', text: 'A temperature logger on the reef is compared with the satellite reading for the same days.', rel: { 'c-reef': 'support' } },
  { id: 'e-tide', topic: 'Sea level', title: 'A local tide-gauge record', text: 'A gauge measures sea level at one place, relative to the land it is bolted to.', rel: { 'c-sea': 'support' } },
  { id: 'e-clearing', topic: 'Forest', title: 'Clearing polygon over loss pixels in Queensland', text: 'Loss pixels that look the same as the fire area, but they sit inside a cleared paddock boundary.', rel: { 'c-forest': 'support' } },
  { id: 'e-altimeter', topic: 'Sea level', title: 'How a radar altimeter measures height', text: 'Orbit height minus the radar range to the sea surface gives sea-surface height. Averaging many passes shrinks the scatter.', rel: { 'c-sea': 'support' } },
  { id: 'e-microwave', topic: 'Ice', title: 'Passive microwave sees through cloud and polar night', text: 'Ice and open water emit microwaves differently, so the sensor can map ice in the dark.', rel: { 'c-ice': 'support' } },
];

export type Match = 'primary' | 'related';

export interface LimitationCard {
  id: string;
  title: string;
  text: string;
  match: Partial<Record<ClaimId, Match>>;
}

export const LIMITATIONS: LimitationCard[] = [
  { id: 'l-short', title: 'Short record', text: 'About 30 years is short next to natural cycles such as El Niño and La Niña, which can hide or exaggerate a trend.', match: { 'c-sea': 'primary', 'c-ice': 'related' } },
  { id: 'l-risk', title: 'Risk, not outcome', text: 'DHW measures heat stress. Depth, shade and a reef’s bleaching history change what actually happens to the coral.', match: { 'c-reef': 'primary' } },
  { id: 'l-cause', title: 'Loss is not the cause', text: 'A loss pixel shows that trees are gone, not what removed them. Fire and clearing look the same from orbit.', match: { 'c-forest': 'primary' } },
  { id: 'l-thick', title: 'Extent is not volume', text: 'Extent counts area above a 15% ice concentration. It does not show how thick the ice is or how much there is.', match: { 'c-ice': 'primary' } },
  { id: 'l-sample', title: 'Small sample', text: 'Only two reefs and one survey year were checked. That is a hint, not a pattern.', match: { 'c-reef': 'primary' } },
  { id: 'l-attrib', title: 'Risk is not each fire', text: 'More fire-weather risk is not the same as saying climate change caused every fire.', match: { 'c-forest': 'primary' } },
  { id: 'l-street', title: 'Global, not local', text: 'A global average cannot say which street or suburb will flood. Local sea level also depends on land movement.', match: { 'c-sea': 'related' } },
  { id: 'l-sheet', title: 'Sea ice is not an ice sheet', text: 'Sea ice floats, so this record says little about ice sheets on land or about sea level.', match: { 'c-ice': 'related' } },
  { id: 'l-resprout', title: 'Forest can regrow', text: 'Burnt eucalypt forest often resprouts, so loss is not always permanent.', match: { 'c-forest': 'related' } },
  { id: 'l-cloud', title: 'Cloud gets in the way', text: 'Thermal infrared and optical sensors cannot see through cloud, so some readings are gap-filled.', match: { 'c-reef': 'related', 'c-forest': 'related' } },
  { id: 'l-onerecord', title: 'One record is not a trend', text: 'A single record high or low can happen by chance. You need the long record.', match: { 'c-ice': 'related' } },
  { id: 'l-generic', title: 'Satellites can be wrong', text: 'Instruments sometimes fail or drift, so any satellite result could be wrong.', match: {} },
];

/* ---------- check questions ---------- */

export interface Option {
  id: string;
  text: string;
  correct?: boolean;
  /** Shown after the student commits to this option. */
  feedback?: string;
}

export const LAUNCH_GUESS: Option[] = [
  { id: 'energy', text: 'Light, heat or microwave energy reaching its sensor. Scientists then calculate a temperature, height or cover from that signal.', correct: true },
  { id: 'photo', text: 'A photo with the temperature written on it.' },
  { id: 'thermometer', text: 'The reading from a tiny thermometer pointing at Earth.' },
];
export const LAUNCH_REVEAL =
  'A satellite records energy, called radiance. Everything else is calculated, and every calculation has some uncertainty. That is why scientists check satellites against measurements on the ground. This lesson is about how much weight that evidence can carry.';

export const REEF_WHY: Option[] = [
  { id: 'broken', text: 'The logger must be broken.' },
  { id: 'skin', text: 'The satellite senses the skin of the sea surface, averaged over a pixel several kilometres wide. The logger sits at one depth in one spot.', correct: true, feedback: 'Both can be right. They measure different things: skin against depth, and a pixel against a point.' },
  { id: 'none', text: 'Satellites cannot measure sea temperature at all.' },
  { id: 'year', text: 'They are from different years.' },
];

export const REEF_LIMITS: (Option & { valid: boolean })[] = [
  { id: 'risk', valid: true, text: 'DHW predicts risk, not outcome.' },
  { id: 'scale', valid: true, text: 'Each “reef” is a NOAA regional station (a hot-end figure for a whole region), so it can differ from the heat stress measured at one reef.' },
  { id: 'depth', valid: true, text: 'Depth and shading differ between reefs.' },
  { id: 'history', valid: true, text: 'A reef’s earlier bleaching history changes how it copes.' },
  { id: 'oneyear', valid: true, text: 'One summer is not a trend.' },
  { id: 'cannot', valid: false, text: 'Satellites cannot measure sea temperature.' },
  { id: 'hottest', valid: false, text: 'DHW is just the hottest day of the summer.' },
  { id: 'wrong', valid: false, text: 'The aerial survey is always wrong.' },
];

export const SEA_PAIR_GUESS: Option[] = [
  { id: 'rising', text: 'Sea level is rising' },
  { id: 'falling', text: 'Sea level is falling' },
  { id: 'unclear', text: 'Two years are not enough to tell' },
];

export const SEA_CONCLUSION: Option[] = [
  { id: 'long', text: 'One pair of years can fall even while the long record rises. The 30-year trend, and its faster recent rate, is the evidence.', correct: true },
  { id: 'wrong-record', text: 'The pair shows sea level is falling, so the long record must be wrong.' },
  { id: 'steady', text: 'Sea level has risen at the same steady rate the whole time.' },
  { id: 'useless', text: 'Satellites cannot be used for sea level because some years fall.' },
];

export const SEA_GAUGE: Option[] = [
  { id: 'relative', text: 'A tide gauge measures sea level relative to the land it sits on, at one place. Land movement and local winds and currents are in the signal. The satellite averages the whole ocean.', correct: true },
  { id: 'old', text: 'The tide gauge is wrong because it is old technology.' },
  { id: 'same', text: 'They should be identical. A difference means one has an error.' },
  { id: 'air', text: 'Tide gauges measure air pressure, not water.' },
];

export const FOREST_GUESS: Option[] = [
  { id: 'a', text: 'The first crop' },
  { id: 'b', text: 'The second crop' },
  { id: 'cant', text: 'I cannot tell from the loss pixels alone' },
];
export const FOREST_CLASSIFY: Option[] = [
  { id: 'climate-linked', text: 'Climate-linked: bushfire in a year of extreme fire weather' },
  { id: 'land-use', text: 'Land use: cleared for farming or development' },
  { id: 'unclear', text: 'Cannot tell, even with the overlay' },
];
export const FOREST_CAUTION: Option[] = [
  { id: 'risk', text: 'Climate change raised the risk of extreme fire weather. It does not explain every single fire.', correct: true },
  { id: 'lit', text: 'Climate change lit the fires.' },
  { id: 'none', text: 'Climate change played no part.' },
];

export const ICE_GUESS: Option[] = [
  { id: 'trend', text: 'Yes. A record low proves Antarctic sea ice is disappearing, just like the Arctic.' },
  { id: 'need-record', text: 'One year cannot show a trend. I need the long record first.' },
  { id: 'blip', text: 'No. It is a random blip and means nothing.' },
];
export const ICE_STATEMENT: Option[] = [
  { id: 'good', text: 'Arctic September ice has fallen steadily for decades. Antarctic sea ice swings up and down, so one record low, like 2023, is not enough on its own to call a trend.', correct: true },
  { id: 'same', text: 'Both poles show the same steady decline every year.' },
  { id: 'none', text: 'Neither pole shows any long-term change.' },
  { id: 'proof', text: 'The 2023 record low alone proves the Antarctic trend.' },
];
export const ICE_SHEET: Option[] = [
  { id: 'floating', text: 'Almost not at all. Floating ice already pushes aside its own weight of water. Ice sheets on land do raise sea level.', correct: true },
  { id: 'same', text: 'Yes, by the same amount as melting ice sheets.' },
  { id: 'none', text: 'No ice anywhere affects sea level.' },
];

/* ---------- debrief: end on use ---------- */

/** Marks content that must be checked with the school's Aboriginal education contact before it is shown. */
export const DRAFT_FN = true;

export interface UseItem {
  title: string;
  text: string;
  draftFN?: boolean;
}
export const USES: UseItem[] = [
  {
    title: 'Reef managers act on heat-stress warnings',
    text: 'Coral Reef Watch publishes heat-stress alerts from satellite data. Reef managers use them to decide when to survey, which reefs to watch and when to tell the public that bleaching is likely.',
  },
  {
    title: 'Sea-level records guide coastal planning',
    text: 'Councils combine the global satellite record with local tide gauges and land-movement data. Together they set planning levels for roads, drains and seawalls.',
  },
  {
    title: 'Ranger groups map fire from space',
    text: 'In northern Australia, Indigenous ranger groups use satellite fire-hotspot maps to plan early dry-season burns. Careful burning early in the season leaves fewer big late-season fires.',
    draftFN: true,
  },
  {
    title: 'Torres Strait Islander-led monitoring and advocacy',
    text: 'Torres Strait Islander communities are leading their own monitoring of rising seas and speaking up for action on climate change. Satellite records are one of the tools they point to.',
    draftFN: true,
  },
];
export const DRAFT_NOTE = 'DRAFT: not yet checked with the school’s Aboriginal education contact. Visible only with ?draft in the address.';

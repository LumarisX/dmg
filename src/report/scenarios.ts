import type {TerrainName, WeatherName} from '../conditions';

export interface ScenarioSide {
  species: string;
  level?: number;
  ability?: string;
  item?: string;
  nature?: string;
  evs?: {[stat: string]: number};
  ivs?: {[stat: string]: number};
  boosts?: {[boost: string]: number};
  status?: string;
  hp?: number;
  teraType?: string;
  terastallized?: boolean;
}

export interface Scenario {
  name: string;
  group: string;
  note?: string;
  move: string;
  attacker: ScenarioSide;
  defender: ScenarioSide;
  weather?: WeatherName;
  terrain?: TerrainName;
  turns?: number;
  maxResolves?: number;
  gen?: number;
}

const BLISSEY: ScenarioSide = {species: 'Blissey', evs: {hp: 252, def: 252}};

export const SCENARIOS: Scenario[] = [
  {
    name: 'Aura Sphere',
    group: 'Single hit',
    note: 'The canonical 16-roll case',
    move: 'Aura Sphere',
    attacker: {species: 'Lucario', nature: 'Modest', evs: {spa: 252}},
    defender: {species: 'Blissey', evs: {hp: 252, spd: 252}},
  },
  {
    name: 'Aura Sphere into 10 HP',
    group: 'Single hit',
    note: 'Overkill collapses to one certain outcome',
    move: 'Aura Sphere',
    attacker: {species: 'Lucario', nature: 'Modest', evs: {spa: 252}},
    defender: {species: 'Blissey', evs: {hp: 252, spd: 252}, hp: 10},
  },
  {
    name: 'Blaze Kick',
    group: 'Single hit',
    move: 'Blaze Kick',
    attacker: {species: 'Blaziken', nature: 'Adamant', evs: {atk: 252}},
    defender: {species: 'Toxapex', evs: {hp: 252, def: 252}},
  },
  {
    name: 'Blaze Kick in sun',
    group: 'Field',
    note: 'Weather modifier on the damage path',
    move: 'Blaze Kick',
    attacker: {species: 'Blaziken', nature: 'Adamant', evs: {atk: 252}},
    defender: {species: 'Toxapex', evs: {hp: 252, def: 252}},
    weather: 'Sun',
  },
  {
    name: 'Tera Fire Blaze Kick',
    group: 'Field',
    note: 'Terastallised STAB — the 2.0x path',
    move: 'Blaze Kick',
    attacker: {
      species: 'Blaziken',
      nature: 'Adamant',
      evs: {atk: 252},
      teraType: 'Fire',
      terastallized: true,
    },
    defender: {species: 'Toxapex', evs: {hp: 252, def: 252}},
  },
  {
    name: '+2 attacker, burned',
    group: 'Field',
    note: 'Boosts and status together',
    move: 'Blaze Kick',
    attacker: {
      species: 'Blaziken',
      nature: 'Adamant',
      evs: {atk: 252},
      boosts: {atk: 2},
      status: 'brn',
    },
    defender: {species: 'Toxapex', evs: {hp: 252, def: 252}},
  },
  {
    name: 'Rock Blast',
    group: 'Multi-hit',
    note: 'The 2-5 hit spread, 7/7/3/3',
    move: 'Rock Blast',
    attacker: {species: 'Cloyster', nature: 'Adamant', evs: {atk: 252}},
    defender: BLISSEY,
  },
  {
    name: 'Icicle Spear + Skill Link',
    group: 'Multi-hit',
    note: 'Skill Link pins the hit count to 5',
    move: 'Icicle Spear',
    attacker: {species: 'Cloyster', ability: 'Skill Link', nature: 'Adamant', evs: {atk: 252}},
    defender: BLISSEY,
  },
  {
    name: 'Rock Blast + Loaded Dice',
    group: 'Multi-hit',
    note: 'Loaded Dice narrows the spread to 4-5',
    move: 'Rock Blast',
    attacker: {species: 'Cloyster', item: 'Loaded Dice', nature: 'Adamant', evs: {atk: 252}},
    defender: BLISSEY,
  },
  {
    name: 'Triple Axel',
    group: 'Multi-hit',
    note: 'Per-hit accuracy and escalating base power',
    move: 'Triple Axel',
    attacker: {species: 'Weavile', nature: 'Jolly', evs: {atk: 252}},
    defender: BLISSEY,
  },
  {
    name: 'Population Bomb',
    group: 'Multi-hit',
    note: 'Ten hits — past the exactly representable horizon',
    move: 'Population Bomb',
    attacker: {species: 'Maushold', nature: 'Adamant', evs: {atk: 252}},
    defender: BLISSEY,
  },
  {
    name: 'Aura Sphere vs Multiscale',
    group: 'Slow path',
    note: 'Target defence depends on its own HP, so the HP projection is refused and the full state space runs',
    move: 'Aura Sphere',
    attacker: {species: 'Lucario', nature: 'Modest', evs: {spa: 252}},
    defender: {species: 'Dragonite', ability: 'Multiscale', evs: {hp: 252, def: 252}},
    turns: 6,
  },
  {
    name: 'Rock Blast vs Multiscale',
    group: 'Slow path',
    note: 'Multi-hit on the full path — bounded by a resolve budget, so the knockout chance is a floor',
    move: 'Rock Blast',
    attacker: {species: 'Cloyster', nature: 'Adamant', evs: {atk: 252}},
    defender: {species: 'Dragonite', ability: 'Multiscale', evs: {hp: 252, def: 252}},
    turns: 4,
    maxResolves: 60,
  },
  {
    name: 'Close Combat',
    group: 'Refused',
    note: 'Self effect — attacker stat drops are not modelled yet',
    move: 'Close Combat',
    attacker: {species: 'Lucario', nature: 'Adamant', evs: {atk: 252}},
    defender: BLISSEY,
  },
  {
    name: 'Brave Bird',
    group: 'Refused',
    note: 'Recoil is not modelled yet',
    move: 'Brave Bird',
    attacker: {species: 'Talonflame', nature: 'Adamant', evs: {atk: 252}},
    defender: BLISSEY,
  },
  {
    name: 'Present',
    group: 'Refused',
    note: 'Random move-data branches that are not enumerated',
    move: 'Present',
    attacker: {species: 'Delibird', nature: 'Adamant', evs: {atk: 252}},
    defender: BLISSEY,
  },
];

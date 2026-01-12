import {
  As,
  BoostsTable,
  ConditionData,
  GameType,
  GenderName,
  Generation,
  GenerationNum,
  HitEffect,
  ID,
  MoveCategory,
  Move as MoveData,
  MoveTarget,
  Nature,
  NatureName,
  SecondaryEffect,
  Specie,
  SpeciesName,
  StatID,
  StatsTable,
  StatusName,
  Type,
  TypeName,
} from '@pkmn/data';
import {EventSpace} from './event-space';
import {HitState} from './poc';
import {floor, round} from '../math';
import {toID} from '../utils';

export namespace DMG {
  export interface PokemonState {
    hp: number;
    item?: string | null;
    types: [TypeName] | [TypeName, TypeName];
    ability: string;
    hits: HitState[];

    readonly level: number;
    readonly stats: StatsTable;
    readonly evs: StatsTable;
    readonly ivs: StatsTable;
    readonly nature?: Nature;
  }

  export interface PokemonOptions {
    name?: SpeciesName;
    weightkg?: number;
    weighthg?: number;
    item?: string;
    ability?: string;
    nature?: string;
    status?: string;
    statusState?: {toxicTurns?: number};
    hpPercent?: number;
    hp?: number;
    maxhp?: number;
    happiness?: number;
    volatiles?: string[] | {[id: string]: {level?: number}};
    types?: [TypeName] | [TypeName, TypeName];
    addedType?: TypeName;
    teraType?: TypeName;
    evs?: Partial<StatsTable & {spc: number}>;
    ivs?: Partial<StatsTable & {spc: number}>;
    dvs?: Partial<StatsTable & {spc: number}>;
    boosts?: Partial<BoostsTable & {spc: number}>;
    stats?: StatsTable;
    gender?: GenderName;
    level?: number;
    position?: number;
    switching?: 'in' | 'out';
    moveLastTurnResult?: unknown;
    hurtThisTurn?: unknown;
  }
  export class Pokemon extends Specie implements PokemonState {
    item?: string | null;
    hp: number;
    states: EventSpace<PokemonState>;
    generation: Generation;
    level: number;
    stats: StatsTable;
    evs: StatsTable;
    ivs: StatsTable;
    ability: string;
    nature?: Nature;
    hits: HitState[] = [];
    species: Specie;
    weighthg: number = 0;
    gender?: GenderName;
    happiness?: number;
    status?: StatusName;
    statusState?: {toxicTurns?: number};
    volatiles: {[id: string]: {level?: number}} = {};
    types!: [TypeName] | [TypeName, TypeName];
    addedType?: TypeName;
    teraType?: TypeName;
    maxhp: number = 0;
    boosts: Partial<BoostsTable> = {};
    position?: number;
    switching?: 'in' | 'out';
    moveLastTurnResult?: unknown;
    hurtThisTurn?: unknown;

    constructor(gen: Generation, name: string, options: Partial<PokemonOptions> = {}) {
      const species = gen.species.get(name);
      if (!species) invalid(gen, 'Pokemon', name);
      super(gen.dex, gen.exists, species);

      this.species = species;

      this.generation = gen;
      this.level = 100;
      if (typeof options.level === 'number') {
        this.level = bounded('level', options.level);
      }

      // Weight
      this.weighthg =
        typeof options.weighthg === 'number' ? options.weighthg : typeof options.weightkg === 'number' ? options.weightkg * 10 : species.weighthg;
      if (this.weighthg < 1) throw new Error(`weighthg of ${this.weighthg} must be at least 1`);

      // Item
      this.item = undefined;
      this.setItem(options.item);

      // Ability
      this.ability = options.ability ?? this.abilities[0];

      // Happiness
      this.happiness = typeof options.happiness === 'undefined' ? undefined : bounded('happiness', options.happiness);

      // Status
      this.status = undefined;
      this.statusState = undefined;
      if (options.status) {
        const [status, kind] = getCondition(gen, options.status);
        if (kind !== 'Status') {
          throw new Error(`'${status} is a ${kind} not a Status in generation ${gen.num}`);
        }
        this.status = status as StatusName;
        if (this.status === 'tox') this.statusState = {toxicTurns: 0};
      }

      // Status Data
      if (options.statusState) {
        if (options.statusState.toxicTurns) {
          const turns = options.statusState.toxicTurns;
          bounded('toxicCounter', turns);
          if (this.status !== 'tox') {
            throw new Error(`toxicTurns set to ${turns} but the Pokemon's status is not 'tox'`);
          }
        }
        this.statusState = options.statusState;
      }

      // Volatiles
      this.volatiles = setConditions(gen, 'Volatile Status', options.volatiles);

      // Types
      this.types = options.types || species.types;
      this.addedType = options.addedType;

      // Nature
      this.nature = undefined;
      if (options.nature) {
        const nature = gen.natures.get(options.nature);
        if (!nature) invalid(gen, 'nature', options.nature);
        this.nature = nature;
      }

      // EVs
      this.evs = {} as StatsTable;
      this.ivs = {} as StatsTable;
      setValues(gen, this, 'evs', options.evs);
      setValues(gen, this, 'ivs', options.ivs);

      // DVs
      for (const stat of gen.stats) {
        const val = options.dvs?.[stat];
        if (typeof val === 'number') {
          const dv = bounded('dvs', val);
          if (typeof options.ivs?.[stat] === 'number' && gen.stats.toDV(options.ivs[stat]) !== dv) {
            throw new Error(`${stat} DV of '${dv}' does not match IV of '${options.ivs[stat]}'`);
          }
          this.ivs[stat] = gen.stats.toIV(dv);
        }
      }
      setSpc(gen, this.ivs, 'ivs', options.dvs, gen.stats.toIV.bind(gen.stats));

      // Stats
      this.stats = {} as StatsTable;
      if (options.stats) {
        this.stats = {...options.stats};
      } else {
        (['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as StatID[]).forEach(stat => {
          this.stats[stat] = gen.stats.calc(stat, this.baseStats[stat], this.ivs[stat], this.evs[stat], this.level, this.nature);
        });
      }

      // Boosts
      this.boosts = {};
      if (options.boosts) {
        for (const b in options.boosts) {
          if (b === 'spc') continue;
          const boost = b as keyof BoostsTable;
          const val = options.boosts[boost];
          if (typeof val === 'number') this.boosts[boost] = bounded('boosts', val);
        }
      }
      setSpc(gen, this.boosts, 'boosts', options.boosts);

      // Gender (depends on DVs)
      const setAtkDV = typeof (options.dvs?.atk ?? options.ivs?.atk) === 'number';
      setGender(gen, this, options.gender, setAtkDV);

      // HP (depends on stats)
      const setHPDV = typeof (options.dvs?.hp ?? options.ivs?.hp) === 'number';
      correctHPDV(gen, this, setHPDV);
      this.maxhp = gen.stats.calc('hp', species.baseStats.hp, this.ivs.hp, this.evs.hp, this.level);
      if (options.maxhp) {
        if (options.maxhp < this.maxhp) {
          throw new RangeError(`maxhp ${options.maxhp} less than calculated max HP ${this.maxhp}`);
        }
        this.maxhp = options.maxhp;
      }

      // Tera Type
      this.teraType = options.teraType || this.types[0];

      // HP (current)
      const computed = typeof options.hpPercent === 'number' ? round((options.hpPercent * this.maxhp) / 100) : undefined;
      this.hp = typeof options.hp === 'number' ? options.hp : typeof computed === 'number' ? computed : this.maxhp;
      if (!(this.hp >= 0 && this.hp <= this.maxhp)) {
        throw new RangeError(`hp ${this.hp} is not within [0,${this.maxhp}]`);
      }
      if (typeof options.hp === 'number' && typeof computed === 'number') {
        if (this.hp !== computed) {
          throw new Error(`hp mismatch: '${computed}' does not match '${this.hp}'`);
        }
      }

      // Miscellaneous
      this.position = options.position;
      this.switching = options.switching;
      this.moveLastTurnResult = options.moveLastTurnResult;
      this.hurtThisTurn = options.hurtThisTurn;

      this.states = new EventSpace<PokemonState>(
        {
          hp: this.hp,
          item: this.item,
          stats: this.stats,
          ivs: this.ivs,
          evs: this.evs,
          nature: this.nature,
          level: this.level,
          types: this.types,
          ability: this.ability,
          hits: this.hits,
        },
        p => `${p.hp}-${p.stats.hp}` + (p.item ? `-${p.item}` : '')
      );
    }

    setItem(name?: string) {
      if (name) {
        const item = this.generation.items.get(name);
        if (!item) invalid(this.generation, 'item', name);
        this.item = item.id;
      }
    }
  }

  const CRITRATES = [0, 1 / 24, 1 / 8, 1 / 2];

  export type MoveOptions = {crit?: boolean; alwaysHit?: boolean; alwaysSucceed?: boolean; hits?: number | [number, number]};
  export class Move implements MoveData {
    critChance: number;
    alwaysHit?: boolean;
    alwaysSucceed?: boolean;
    hit: number = 0;

    effectType: 'Move';
    kind: 'Move';
    secondaries: SecondaryEffect[] | null;
    flags: MoveData['flags'];
    zMoveEffect?: ID;
    isZ: boolean | ID;
    zMove?: {basePower?: number; effect?: ID; boost?: Partial<BoostsTable>};
    isMax: boolean | SpeciesName;
    maxMove?: {basePower: number};
    volatileStatus?: ID;
    slotCondition?: ID;
    sideCondition?: ID;
    terrain?: ID;
    pseudoWeather?: ID;
    weather?: ID;
    id: ID;
    name: string & As<'MoveName'>;
    fullname: string;
    exists: boolean;
    num: number;
    gen: GenerationNum;
    shortDesc: string;
    desc: string;
    isNonstandard: 'Past' | 'Future' | 'Unobtainable' | 'CAP' | 'LGPE' | 'Custom' | 'Gigantamax' | null;
    duration?: number;
    inherit?: boolean;
    basePower: number;
    type: TypeName;
    accuracy: number | true;
    pp: number;
    target: MoveTarget;
    priority: number;
    category: MoveCategory;
    realMove?: string;
    condition?: Partial<ConditionData>;
    damage?: number | false | 'level' | null;
    noPPBoosts?: boolean;
    ohko?: boolean | 'Ice';
    thawsTarget?: boolean;
    heal?: number[] | null;
    forceSwitch?: boolean;
    selfSwitch?: boolean | 'copyvolatile' | 'shedtail';
    selfBoost?: {boosts?: Partial<BoostsTable>};
    selfdestruct?: boolean | 'ifHit' | 'always';
    breaksProtect?: boolean;
    recoil?: [number, number];
    drain?: [number, number];
    mindBlownRecoil?: boolean;
    stealsBoosts?: boolean;
    secondary?: SecondaryEffect | null;
    self?: HitEffect | null;
    struggleRecoil?: boolean;
    basePowerModifier?: number;
    critModifier?: number;
    critRatio?: number;
    overrideOffensivePokemon?: 'target' | 'source';
    overrideOffensiveStat?: 'atk' | 'def' | 'spa' | 'spd' | 'spe';
    overrideDefensivePokemon?: 'target' | 'source';
    overrideDefensiveStat?: 'atk' | 'def' | 'spa' | 'spd' | 'spe';
    forceSTAB?: boolean;
    ignoreAbility?: boolean;
    ignoreAccuracy?: boolean;
    ignoreDefensive?: boolean;
    ignoreEvasion?: boolean;
    ignoreImmunity?: MoveData['ignoreImmunity'];
    ignoreNegativeOffensive?: boolean;
    ignoreOffensive?: boolean;
    ignorePositiveDefensive?: boolean;
    ignorePositiveEvasion?: boolean;
    infiltrates?: boolean;
    multiaccuracy?: boolean;
    multihit?: number | number[];
    multihitType?: 'parentalbond';
    noCopy?: boolean;
    noDamageVariance?: boolean;
    noFaint?: boolean;
    nonGhostTarget?: MoveTarget;
    pressureTarget?: MoveTarget;
    sleepUsable?: boolean;
    smartTarget?: boolean;
    spreadModifier?: number;
    tracksTarget?: boolean;
    willCrit?: boolean;
    callsMove?: boolean;
    hasCrashDamage?: boolean;
    hasSheerForce?: boolean;
    isConfusionSelfHit?: boolean;
    stallingMove?: boolean;
    boosts?: Partial<BoostsTable>;
    status?: StatusName;

    constructor(gen: Generation, name: string, options: MoveOptions = {}) {
      const move = gen.moves.get(name);
      if (!move) invalid(gen, 'move', name);
      this.alwaysHit = options.alwaysHit;
      this.alwaysSucceed = options.alwaysSucceed;
      this.effectType = 'Move';
      this.kind = 'Move';
      this.secondaries = move.secondaries;
      this.flags = move.flags;
      this.zMoveEffect = move.zMoveEffect;
      this.isZ = move.isZ;
      this.zMove = move.zMove;
      this.isMax = move.isMax;
      this.maxMove = move.maxMove;
      this.volatileStatus = move.volatileStatus;
      this.slotCondition = move.slotCondition;
      this.sideCondition = move.sideCondition;
      this.terrain = move.terrain;
      this.pseudoWeather = move.pseudoWeather;
      this.weather = move.weather;
      this.id = move.id;
      this.name = move.name;
      this.fullname = move.fullname;
      this.exists = move.exists;
      this.num = move.num;
      this.gen = move.gen;
      this.shortDesc = move.shortDesc;
      this.desc = move.desc;
      this.isNonstandard = move.isNonstandard;
      this.duration = move.duration;
      this.inherit = move.inherit;
      this.basePower = move.basePower;
      this.type = move.type;
      this.accuracy = move.accuracy;
      this.pp = move.pp;
      this.target = move.target;
      this.priority = move.priority;
      this.category = move.category;
      this.realMove = move.realMove;
      this.condition = move.condition;
      this.damage = move.damage;
      this.noPPBoosts = move.noPPBoosts;
      this.ohko = move.ohko;
      this.thawsTarget = move.thawsTarget;
      this.heal = move.heal;
      this.forceSwitch = move.forceSwitch;
      this.selfSwitch = move.selfSwitch;
      this.selfBoost = move.selfBoost;
      this.selfdestruct = move.selfdestruct;
      this.breaksProtect = move.breaksProtect;
      this.recoil = move.recoil;
      this.drain = move.drain;
      this.mindBlownRecoil = move.mindBlownRecoil;
      this.stealsBoosts = move.stealsBoosts;
      this.secondary = move.secondary;
      this.self = move.self;
      this.struggleRecoil = move.struggleRecoil;
      this.basePowerModifier = move.basePowerModifier;
      this.critModifier = move.critModifier;
      this.critRatio = move.critRatio;
      this.overrideOffensivePokemon = move.overrideOffensivePokemon;
      this.overrideOffensiveStat = move.overrideOffensiveStat;
      this.overrideDefensivePokemon = move.overrideDefensivePokemon;
      this.overrideDefensiveStat = move.overrideDefensiveStat;
      this.forceSTAB = move.forceSTAB;
      this.ignoreAbility = move.ignoreAbility;
      this.ignoreAccuracy = move.ignoreAccuracy;
      this.ignoreDefensive = move.ignoreDefensive;
      this.ignoreEvasion = move.ignoreEvasion;
      this.ignoreImmunity = move.ignoreImmunity;
      this.ignoreNegativeOffensive = move.ignoreNegativeOffensive;
      this.ignoreOffensive = move.ignoreOffensive;
      this.ignorePositiveDefensive = move.ignorePositiveDefensive;
      this.ignorePositiveEvasion = move.ignorePositiveEvasion;
      this.infiltrates = move.infiltrates;
      this.multiaccuracy = move.multiaccuracy;
      this.multihit = options.hits ?? move.multihit;
      this.multihitType = move.multihitType;
      this.noCopy = move.noCopy;
      this.noDamageVariance = move.noDamageVariance;
      this.noFaint = move.noFaint;
      this.nonGhostTarget = move.nonGhostTarget;
      this.pressureTarget = move.pressureTarget;
      this.sleepUsable = move.sleepUsable;
      this.smartTarget = move.smartTarget;
      this.spreadModifier = move.spreadModifier;
      this.tracksTarget = move.tracksTarget;
      this.willCrit = move.willCrit;
      this.callsMove = move.callsMove;
      this.hasCrashDamage = move.hasCrashDamage;
      this.hasSheerForce = move.hasSheerForce;
      this.isConfusionSelfHit = move.isConfusionSelfHit;
      this.stallingMove = move.stallingMove;
      this.boosts = move.boosts;
      this.status = move.status;
      this.critChance =
        options.crit === undefined
          ? move.critRatio
            ? move.critRatio > CRITRATES.length
              ? 1
              : CRITRATES[move.critRatio]
            : CRITRATES[0]
          : options.crit
          ? 1
          : 0;
    }
  }

  function invalid(gen: Generation, k: string, v: any): never {
    throw new Error(`Unsupported or invalid ${k} '${v}' for generation ${gen.num}`);
  }

  function bounded(key: string, val: number, die = true) {
    const BOUNDS: {[key: string]: [number, number]} = {
      level: [1, 100],
      stat: [0, 255],
      evs: [0, 255],
      ivs: [0, 31],
      dvs: [0, 15],
      gen: [1, 8],
      boosts: [-6, 6],
      toxicCounter: [0, 15],
      happiness: [0, 255],
      magnitude: [4, 10],
    };
    const ok = val >= BOUNDS[key][0] && val <= BOUNDS[key][1];
    if (!ok && die) throw new RangeError(`${key} ${val} is not within [${BOUNDS[key].join(',')}]`);
    return val;
  }

  function getCondition(gen: Generation, conditionName: string): [string, string] {
    // Simple condition detection - can be expanded with Conditions.get if needed
    const lowerName = conditionName.toLowerCase();
    if (['burn', 'par', 'psn', 'tox', 'frz', 'slp'].includes(lowerName)) {
      return [lowerName, 'Status'];
    }
    return [lowerName, 'Status'];
  }

  function setConditions(gen: Generation, kind: string, data: string[] | {[id: string]: unknown} | undefined) {
    const obj: {[id: string]: {level?: number}} = {};
    if (data) {
      if (Array.isArray(data)) {
        for (const d of data) {
          obj[toID(d)] = {};
        }
      } else {
        for (const d in data) {
          obj[toID(d)] = data[d] as {level?: number};
        }
      }
    }
    return obj;
  }

  function setValues(gen: Generation, pokemon: Pick<Pokemon, 'evs' | 'ivs'>, type: 'evs' | 'ivs', vals?: Partial<StatsTable & {spc: number}>) {
    for (const stat of gen.stats) {
      pokemon[type][stat] = pokemon[type][stat] || (type === 'evs' ? (gen.num <= 2 ? 252 : 0) : 31);
      const val = vals?.[stat];
      if (typeof val === 'number') pokemon[type][stat] = bounded(type, val);
    }
    setSpc(gen, pokemon[type], type, vals);
  }

  function setSpc(
    gen: Generation,
    existing: Partial<{spc: number; spa: number; spd: number}>,
    type: 'evs' | 'ivs' | 'boosts',
    vals?: Partial<{spc: number; spa: number; spd: number}>,
    fn?: (n: number) => number
  ) {
    const spc = vals?.spc;
    if (typeof spc === 'number') {
      if (gen.num >= 2) throw new Error('Spc does not exist after generation 1');
      if (typeof vals!.spa === 'number' && vals!.spa !== spc) {
        throw new Error(`Spc and SpA ${type} mismatch: ${spc} vs. ${vals!.spa}`);
      }
      if (typeof vals!.spd === 'number' && vals!.spd !== spc) {
        throw new Error(`Spc and SpD ${type} mismatch: ${spc} vs. ${vals!.spd}`);
      }
      existing.spa = existing.spd = bounded(type, fn ? fn(spc) : spc);
    }
    if (gen.num <= 2 && existing.spa !== existing.spd) {
      throw new Error(`SpA and SpD ${type} must match before generation 3`);
    }
  }

  function setGender(gen: Generation, pokemon: Pokemon, name?: GenderName, setAtkDV = false) {
    const ivs = pokemon.ivs;
    const species = pokemon.species;
    const atkDV = gen.stats.toDV(ivs.atk);
    // AtkDV determining gender is only a thing in generation 2, but we can use it as the default
    const gender = gen.num === 1 ? undefined : atkDV >= species.genderRatio.F * 16 ? 'M' : 'F';
    if (name) {
      if (gen.num === 1) throw new Error('Gender does not exist in generation 1');
      if (species.gender && name !== species.gender) {
        throw new Error(`${species.name} must be '${species.gender}' in generation ${gen.num}`);
      }
      if (gen.num === 2) {
        if (setAtkDV && name !== gender) {
          throw new Error(`A ${species.name} with ${atkDV} Atk DVs must be '${gender}' in gen 2`);
        }
        pokemon.gender = gender;
        return;
      }
    }
    pokemon.gender = name || species.gender || gender;
  }

  function correctHPDV(gen: Generation, pokemon: Pokemon, setHPDV = false) {
    const expectedHPDV = gen.stats.getHPDV(pokemon.ivs);
    const actualHPDV = gen.stats.toDV(pokemon.ivs.hp);
    if (gen.num <= 2 && expectedHPDV !== actualHPDV) {
      if (setHPDV) {
        throw new Error(
          `${pokemon.species.name} is required to have an HP DV of ` + `${expectedHPDV} in generations 1 and 2 but it is ${actualHPDV}`
        );
      }
      pokemon.ivs.hp = gen.stats.toIV(expectedHPDV);
    }
  }
}

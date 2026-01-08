import {
  As,
  BoostsTable,
  ConditionData,
  Generation,
  GenerationNum,
  HitEffect,
  ID,
  MoveCategory,
  Move as MoveData,
  MoveTarget,
  Nature,
  SecondaryEffect,
  Specie,
  SpeciesName,
  StatID,
  StatsTable,
  StatusName,
  TypeName,
} from '@pkmn/data';
import {EventSpace} from './event-space';

export namespace DMG {
  export interface PokemonState {
    hp: number;
    item?: string | null;
    types: [TypeName] | [TypeName, TypeName];

    readonly level: number;
    readonly stats: StatsTable;
    readonly evs: StatsTable;
    readonly ivs: StatsTable;
    readonly nature?: Nature;
  }

  export interface PokemonOptions {
    name?: SpeciesName;
    weightkg?: number;
    item?: string;
    ability?: string;
    nature?: string;
    status?: string;
    hpPercent?: number;
    // volatiles?: string[] | State.Pokemon['volatiles'];
    evs?: Partial<StatsTable & {spc: number}>;
    ivs?: Partial<StatsTable & {spc: number}>;
    dvs?: Partial<StatsTable & {spc: number}>;
    boosts?: Partial<BoostsTable & {spc: number}>;
    teraType?: TypeName;
    level?: number;
  }
  export class Pokemon extends Specie {
    item?: string | null;
    hp: number;
    states: EventSpace<PokemonState>;
    generation: Generation;
    level: number;
    stats: StatsTable;
    evs: StatsTable;
    ivs: StatsTable;
    nature?: Nature;
    constructor(gen: Generation, name: string, options: Partial<PokemonOptions> = {}) {
      const species = gen.species.get(name);
      if (!species) invalid(gen, 'Pokemon', name);
      super(gen.dex, gen.exists, species);

      this.generation = gen;
      this.setItem(options.item);
      this.level = Math.max(0, options.level ?? 100);
      this.evs = {} as StatsTable;
      this.ivs = {} as StatsTable;
      this.stats = {} as StatsTable;
      (['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as StatID[]).forEach(stat => {
        this.evs[stat] = Math.min(255, Math.max(0, options.evs && options.evs[stat] ? options.evs[stat] : 0));
        this.ivs[stat] = Math.min(31, Math.max(0, options.ivs && options.ivs[stat] ? options.ivs[stat] : 31));
        this.stats[stat] = gen.stats.calc(stat, this.baseStats[stat], this.ivs[stat], this.evs[stat], this.level, this.nature);
      });
      this.hp = this.stats.hp;
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

  export type MoveOptions = {crit?: boolean; alwaysHit?: boolean; alwaysSucceed?: boolean};
  export class Move implements MoveData {
    critChance: number;
    alwaysHit?: boolean;
    alwaysSucceed?: boolean;

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
      this.multihit = move.multihit;
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
}

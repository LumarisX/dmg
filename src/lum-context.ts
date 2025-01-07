import type {
  BoostID,
  BoostsTable,
  ConditionData,
  Move as DMove,
  GameType,
  GenderName,
  Generation,
  GenerationNum,
  HitEffect,
  ID,
  MoveCategory,
  MoveName,
  MoveTarget,
  NatureName,
  Nonstandard,
  SecondaryEffect,
  Specie,
  SpeciesName,
  StatID,
  StatsTable,
  StatusName,
  TypeName,
} from '@pkmn/data';

import {TerrainName, WeatherName} from './conditions';
import {apply, chain} from './math';
import {HANDLERS, Handler, HandlerKind, Handlers} from './mechanics';
import {Relevancy} from './result';
import {LumState} from './lum-state';
import {DeepReadonly, extend, toID} from './utils';
import {relative} from 'path';

export class LumContext {
  gameType: GameType;
  gen: Generation;
  p1: LumContext.Position;
  p2: LumContext.Position;
  move: LumContext.Move;
  field: LumContext.Field;

  readonly relevant: Relevancy;

  constructor(state: DeepReadonly<LumState>, handlers: Handlers = HANDLERS, relevant: Relevancy = new Relevancy()) {
    this.gameType = state.gameType;
    this.gen = state.gen as Generation;
    this.move = new LumContext.Move(state.move, relevant.move, handlers);
    this.p1 = new LumContext.Position(this, state.p1, relevant.p1, handlers);
    this.p2 = new LumContext.Position(this, state.p2, relevant.p2, handlers);
    this.field = new LumContext.Field(state.field, relevant.field, handlers);
    this.move.updateData(this);
    this.relevant = relevant;
  }

  toState() {
    return new LumState(this.gen, this.p1.toState(), this.p2.toState(), this.move.toState(), this.field.toState(), this.gameType);
  }

  toJSON() {
    return LumState.toJSON(this.toState());
  }

  static fromState(state: LumState) {
    return new LumContext(state as DeepReadonly<LumState>);
  }
}

export namespace LumContext {
  export class Field {
    weather?: {name: WeatherName} & Partial<Handler<LumContext>>;
    terrain?: {name: TerrainName} & Partial<Handler<LumContext>>;
    pseudoWeather: {
      [id: string]: {data: object} & Partial<Handler<LumContext>>;
    };

    readonly relevant: Relevancy.Field;

    constructor(state: DeepReadonly<LumState.Field>, relevant: Relevancy.Field, handlers: Handlers) {
      this.relevant = relevant;

      if (state.weather) {
        const id = toID(state.weather);
        this.weather = reify({name: state.weather}, id, handlers.Conditions, () => {
          this.relevant.weather = true;
        });
      }
      if (state.terrain) {
        const id = toID(state.terrain);
        this.terrain = reify({name: state.terrain}, id, handlers.Conditions, () => {
          this.relevant.terrain = true;
        });
      }
      this.pseudoWeather = {};
      for (const pw in state.pseudoWeather) {
        this.pseudoWeather[pw] = reify({data: state.pseudoWeather[pw]}, pw as ID, handlers.Conditions, () => {
          this.relevant.pseudoWeather[pw] = true;
        });
      }
    }

    toState(): LumState.Field {
      const pseudoWeather: {[id: string]: object} = {};
      for (const pw in this.pseudoWeather) {
        pseudoWeather[pw] = this.pseudoWeather[pw].data;
      }
      return {
        weather: this.weather?.name,
        terrain: this.terrain?.name,
        pseudoWeather,
      };
    }

    toJSON() {
      return this.toState();
    }
  }

  export class Side {
    position: Position;
    sideConditions: {
      [id: string]: {level?: number} & Partial<Handler<LumContext>>;
    };
    active?: Array<{
      ability?: ID;
      position?: number;
      fainted?: boolean;
    } | null>;
    team?: Array<{
      species: {baseStat: {atk: number}};
      status?: StatusName;
      fainted?: boolean;
      position?: number;
    }>;
    readonly relevant: Relevancy.Side;
    readonly field?: LumContext.Field;

    constructor(context: LumContext, state: DeepReadonly<LumState.Side>, relevant: Relevancy.Side, handlers: Handlers) {
      this.relevant = relevant;
      this.field = context.field;
      //add more postions
      this.position = new Position(context, this, state.positions[0], relevant, handlers);
      this.sideConditions = {};
      for (const sc in state.sideConditions) {
        this.sideConditions[sc] = reify(extend({}, state.sideConditions[sc]), sc as ID, handlers.Conditions, () => {
          this.relevant.sideConditions[sc] = true;
        });
      }
      this.active = this.active?.map(p => extend({}, p));
      this.team = this.team?.map(p => extend({}, p));
    }

    toState(): LumState.Side {
      const sideConditions: {[id: string]: {level?: number}} = {};
      for (const sc in this.sideConditions) {
        sideConditions[sc] = 'level' in this.sideConditions[sc] ? {level: this.sideConditions[sc].level} : {};
      }
      return {
        pokemon: this.pokemon.toState(),
        sideConditions: extend({}, this.sideConditions),
        active: this.active?.map(p => extend({}, p)),
        team: this.team?.map(p => extend({}, p)),
      };
    }
  }

  export class Position {
    pokemon: Pokemon;

    readonly side: LumContext.Side;

    constructor(
      context: LumContext,
      side: LumContext.Side,
      state: DeepReadonly<LumState.Position>,
      relevant: Relevancy.Position,
      handlers: Handlers
    ) {
      this.pokemon = new Pokemon(context, this, state.pokemon, relevant.pokemon, handlers);
      this.side = side;
    }
  }

  export class Pokemon {
    species: Specie;
    level: number;
    weighthg: number;

    item?: {id: ID} & Partial<Handler<LumContext.Pokemon>>;
    ability?: {id: ID} & Partial<Handler<LumContext.Pokemon>>;
    gender?: GenderName;
    happiness?: number;

    status?: {name: StatusName} & Partial<Handler<LumContext>>;
    statusData?: {toxicTurns: number};
    volatiles: {[id: string]: {level?: number} & Partial<Handler<LumContext>>};

    types: [TypeName] | [TypeName, TypeName];
    addedType?: TypeName;
    teraType: TypeName;

    maxhp: number;
    hp: number;

    // The stored stats based simply on spread and base stats.
    stats: StatsTable;
    boosts: BoostsTable;

    transformed?: boolean;
    switching?: 'in' | 'out';
    moveLastTurnResult?: unknown;
    hurtThisTurn?: unknown;

    readonly relevant: Relevancy.Pokemon;
    readonly position?: LumContext.Position;
    readonly move?: LumContext.Move;
    readonly gen: Generation;

    private nature?: NatureName;
    private evs?: Partial<StatsTable>;
    private ivs?: Partial<StatsTable>;

    constructor(
      context: LumContext,
      position: LumContext.Position,
      state: DeepReadonly<LumState.Pokemon>,
      relevant: Relevancy.Pokemon,
      handlers: Handlers
    ) {
      this.relevant = relevant;
      this.position = position;
      this.move = context.move;
      this.gen = context.gen;
      this.species = state.species as Specie;
      this.level = state.level;
      this.weighthg = state.weighthg;
      this.teraType = state.teraType || state.types[0];

      if (state.item) {
        this.item = reify({id: state.item}, state.item, handlers.Items, () => {
          this.relevant.item = true;
        });
      }
      if (state.ability) {
        this.ability = reify({id: state.ability}, state.ability, handlers.Abilities, () => {
          this.relevant.ability = true;
        });
      }
      this.gender = state.gender;
      this.happiness = state.happiness;

      if (state.status) {
        this.status = reify({name: state.status}, state.status as ID, handlers.Conditions, () => {
          this.relevant.status = true;
        });
      }
      this.statusData = this.statusData && extend({}, state.statusState);
      this.volatiles = {};
      for (const v in state.volatiles) {
        this.volatiles[v] = reify(extend({}, state.volatiles[v]), v as ID, handlers.Conditions, () => {
          this.relevant.volatiles[v] = true;
        });
      }

      this.types = state.types.slice() as Pokemon['types'];
      this.addedType = state.addedType;

      this.maxhp = state.maxhp;
      this.hp = state.hp;

      this.nature = state.nature;
      this.evs = state.evs;
      this.ivs = state.ivs;

      if (state.stats) {
        this.stats = extend({}, state.stats);
      } else {
        this.stats = {} as StatsTable;
        const nature = state.nature && context.gen.natures.get(state.nature);
        for (const stat of context.gen.stats) {
          this.stats[stat] = context.gen.stats.calc(
            stat,
            this.species.baseStats[stat],
            state.ivs?.[stat] ?? 31,
            state.evs?.[stat] ?? (context.gen.num <= 2 ? 252 : 0),
            state.level,
            nature
          );
          let statMod = 0x1000;
          if (stat === 'atk' && this.item?.onModifyAtk) {
            statMod = chain(statMod, this.item.onModifyAtk(this));
          }
          if (stat === 'spa' && this.item?.onModifySpA) {
            statMod = chain(statMod, this.item.onModifySpA(this));
          }
          if (stat === 'def' && this.item?.onModifyDef) {
            statMod = chain(statMod, this.item.onModifyDef(this));
          }
          if (stat === 'spd' && this.item?.onModifySpD) {
            statMod = chain(statMod, this.item.onModifySpD(this));
          }
          if (stat === 'spe' && this.item?.onModifySpe) {
            statMod = chain(statMod, this.item.onModifySpe(this));
          }
          this.stats[stat] = apply(this.stats[stat], statMod);
        }
      }
      this.boosts = extend({}, state.boosts);

      this.switching = state.switching;
      this.moveLastTurnResult = state.moveLastTurnResult;
      this.hurtThisTurn = state.hurtThisTurn;
    }

    toState(): LumState.Pokemon {
      const volatiles: {[id: string]: {level?: number}} = {};
      for (const v in this.volatiles) {
        volatiles[v] = 'level' in this.volatiles[v] ? {level: this.volatiles[v].level} : {};
      }
      return {
        species: this.species,
        level: this.level,
        weighthg: this.weighthg,
        item: this.item?.id,
        ability: this.ability?.id,
        gender: this.gender,
        teraType: this.teraType,
        happiness: this.happiness,
        status: this.status?.name,
        statusState: this.statusData && extend({}, this.statusData),
        volatiles,
        types: this.types.slice() as Pokemon['types'],
        addedType: this.addedType,
        maxhp: this.maxhp,
        hp: this.hp,
        nature: this.nature,
        evs: this.evs && extend({}, this.evs),
        ivs: this.ivs && extend({}, this.ivs),
        stats: extend({}, this.stats),
        boosts: extend({}, this.boosts),
        // position: this.position,
        switching: this.switching,
        moveLastTurnResult: this.moveLastTurnResult,
        hurtThisTurn: this.hurtThisTurn,
      };
    }

    addBoost(stat: BoostID, stage: number) {
      this.boosts[stat] = this.boosts[stat] += stage;
      if (this.boosts[stat] > 6) this.boosts[stat] = 6;
      if (this.boosts[stat] < -6) this.boosts[stat] = -6;
    }
  }

  export class Move implements LumState.Move, Partial<Handler<LumContext>> {
    id!: ID;
    name!: MoveName;
    fullname!: string;
    exists!: boolean;
    num!: number;
    gen!: GenerationNum;
    shortDesc!: string;
    desc!: string;
    isNonstandard!: Nonstandard | null;
    duration?: number;

    effectType!: 'Move';
    kind!: 'Move';
    secondaries!: SecondaryEffect[] | null;
    flags!: DMove['flags'];
    zMoveEffect?: ID;
    isZ!: boolean | ID;
    zMove?: {
      basePower?: number;
      effect?: ID;
      boost?: Partial<BoostsTable>;
    };
    isMax!: boolean | SpeciesName;
    maxMove?: {
      basePower: number;
    };
    noMetronome?: MoveName[];
    volatileStatus?: ID;
    slotCondition?: ID;
    sideCondition?: ID;
    terrain?: ID;
    pseudoWeather?: ID;
    weather?: ID;

    basePower!: number;
    type!: TypeName;
    accuracy!: true | number;
    pp!: number;
    target!: MoveTarget;
    priority!: number;
    category!: MoveCategory;

    realMove?: string;
    condition?: Partial<ConditionData>;
    damage?: number | 'level' | false | null;
    noPPBoosts?: boolean;

    ohko?: boolean | 'Ice';
    thawsTarget?: boolean;
    heal?: number[] | null;
    forceSwitch?: boolean;
    selfSwitch?: boolean | 'copyvolatile';
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

    alwaysHit?: boolean;
    basePowerModifier?: number;
    critModifier?: number;
    critRatio?: number;
    overrideOffensivePokemon?: 'target' | 'source';
    overrideOffensiveStat?: Exclude<StatID, 'hp'>;
    overrideDefensivePokemon?: 'target' | 'source';
    overrideDefensiveStat?: Exclude<StatID, 'hp'>;
    forceSTAB?: boolean;
    ignoreAbility?: boolean;
    ignoreAccuracy?: boolean;
    ignoreDefensive?: boolean;
    ignoreEvasion?: boolean;
    ignoreImmunity?: boolean | {[k in keyof TypeName]?: boolean};
    ignoreNegativeOffensive?: boolean;
    ignoreOffensive?: boolean;
    ignorePositiveDefensive?: boolean;
    ignorePositiveEvasion?: boolean;
    infiltrates?: boolean;
    multiaccuracy?: boolean;
    multihit?: number | number[];
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

    hasCrashDamage?: boolean;
    isConfusionSelfHit?: boolean;
    isFutureMove?: boolean;
    noSketch?: boolean;
    stallingMove?: boolean;

    crit?: boolean;
    hits?: number;
    magnitude?: number;
    spread?: boolean;
    consecutive?: number; // Metronome

    basePowerCallback?(context: LumContext): number;
    damageCallback?(context: LumContext): number;
    onTryImmunity?(context: LumContext): boolean;
    onBasePower?(context: LumContext): number | undefined;
    onModifyAtk?(context: LumContext): number | undefined;
    onModifySpA?(context: LumContext): number | undefined;
    onModifyDef?(context: LumContext): number | undefined;
    onModifySpD?(context: LumContext): number | undefined;
    onModifySpe?(context: LumContext): number | undefined;
    onModifyWeight?(context: LumContext): number | undefined;
    onResidual?(context: LumContext): number | undefined;
    onEffectiveness?(context: LumContext): number | undefined;

    onModifyMove?(context: LumContext): void;

    readonly relevant: Relevancy.Move;

    effectiveness: number = 0;

    constructor(state: DeepReadonly<LumState.Move>, relevant: Relevancy.Move, handlers: Handlers) {
      extend(this, state);
      this.relevant = relevant;
      reify(this, this.id, handlers.Moves);
    }

    get effectivePower() {
      if (this.accuracy === true) return this.basePower;
      return (this.basePower * this.accuracy) / 100;
    }

    private EFFECTIVENESSBIT: {[key: number]: number} = {
      0: -5,
      0.125: -3,
      0.25: -2,
      0.5: -1,
      1: 0,
      2: 1,
      4: 2,
      8: 3,
    };

    updateData(context: LumContext) {
      this.effectiveness =
        this.EFFECTIVENESSBIT[context.gen.types.totalEffectiveness(this.type, context.p2.pokemon) as keyof typeof this.EFFECTIVENESSBIT];
      if (context.p2.pokemon.move?.onEffectiveness) {
        let effectiveness = context.p2.pokemon.move.onEffectiveness(context);
        if (effectiveness !== undefined) this.effectiveness = effectiveness;
      }
      if (context.p2.pokemon.item?.onEffectiveness) {
        let effectiveness = context.p2.pokemon.item.onEffectiveness(context.p2.pokemon);
        if (effectiveness !== undefined) this.effectiveness = effectiveness;
      }

      if (this.onModifyMove) this.onModifyMove(context);
      if (this.basePowerCallback) this.basePower = this.basePowerCallback(context);

      let basePowerMod = 0x1000;
      if (context.p1.pokemon.ability?.onBasePower) {
        basePowerMod = chain(basePowerMod, context.p1.pokemon.ability.onBasePower(context.p1.pokemon));
      }

      if (context.p1.pokemon.item?.onBasePower) {
        basePowerMod = chain(basePowerMod, context.p1.pokemon.item.onBasePower(context.p1.pokemon));
      }

      if (this.onBasePower) basePowerMod = chain(basePowerMod, this.onBasePower(context));

      this.basePower = apply(this.basePower, basePowerMod);
    }

    toState(): LumState.Move {
      return extend({}, this);
    }
  }
}

function reify<T>(obj: T & Partial<Handler<LumContext | LumContext.Pokemon>>, id: ID, handlers: Handlers[HandlerKind], cbfn?: () => void) {
  const handler = handlers[id];
  if (handler) {
    for (const n in handler) {
      const k = n as keyof Handler<LumContext | LumContext.Pokemon>; // not really, but HANDLER_FNS is checked below
      const fn = handler[k];
      if (fn && typeof fn === 'function') {
        obj[k] = (x: LumContext | LumContext.Pokemon) => {
          const r = (fn as any)(x);
          if (typeof r !== 'undefined' && cbfn) cbfn();
          return r;
        };
      }
    }
  }
  return obj;
}

export class HPRange {
  rolls: {[key: number]: number} = {};
  totalRolls: number;
  constructor(hp: number | number[]) {
    this.totalRolls = 0;
    if (Array.isArray(hp)) {
      hp.forEach(value => this.incrementRoll(value));
    } else {
      this.incrementRoll(hp);
    }
  }

  get range(): [number, number] {
    const result = Object.keys(this.rolls).reduce<[number | null, number | null]>(
      (acc, value) => {
        const numValue = Number(value);
        return [acc[0] === null ? numValue : Math.min(acc[0], numValue), acc[1] === null ? numValue : Math.max(acc[1], numValue)];
      },
      [null, null]
    );

    return [result[0] || -1, result[1] || -1];
  }

  private incrementRoll(value: number) {
    this.rolls[value] = value in this.rolls ? this.rolls[value] : 0 + 1;
    this.totalRolls++;
  }
}

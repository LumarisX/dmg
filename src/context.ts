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
import {Distribution, HANDLERS, Handler, HandlerKind, Handlers} from './mechanics';
import {Relevancy} from './result';
import {State} from './state';
import {DeepReadonly, extend, toID} from './utils';

interface TestData {
  gen: Generation;
  attacker?: Context.Pokemon;
  target?: Context.Pokemon;
  move: Context.Move;
  field?: Context.Field;
}

export class Context {
  gameType: GameType;
  gen: Generation;
  p1: Context.Side;
  p2: Context.Side;
  move: Context.Move;
  field: Context.Field;

  readonly relevant: Relevancy;

  constructor(state: DeepReadonly<State>, handlers: Handlers = HANDLERS, relevant: Relevancy = new Relevancy()) {
    this.gameType = state.gameType;
    this.gen = state.gen as Generation;
    this.move = new Context.Move(state.move, relevant.move, handlers);
    this.p1 = new Context.Side(this, state.p1, relevant.p1, handlers);
    this.p2 = new Context.Side(this, state.p2, relevant.p2, handlers);
    this.field = new Context.Field(state.field, relevant.field, handlers);
    this.move.updateData(this);
    this.relevant = relevant;
  }

  toState() {
    return new State(this.gen, this.p1.toState(), this.p2.toState(), this.move.toState(), this.field.toState(), this.gameType);
  }

  toJSON() {
    return State.toJSON(this.toState());
  }

  static fromState(state: State) {
    return new Context(state as DeepReadonly<State>);
  }
}

export namespace Context {
  export class Field {
    weather?: {name: WeatherName} & Partial<Handler<Context>>;
    terrain?: {name: TerrainName} & Partial<Handler<Context>>;
    pseudoWeather: {
      [id: string]: {data: object} & Partial<Handler<Context>>;
    };

    readonly relevant: Relevancy.Field;

    constructor(state: DeepReadonly<State.Field>, relevant: Relevancy.Field, handlers: Handlers) {
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

    toState(): State.Field {
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
    pokemon: Pokemon;
    sideConditions: {
      [id: string]: {level?: number} & Partial<Handler<Context>>;
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
    readonly field?: Context.Field;

    constructor(context: Context, side: DeepReadonly<State.Side>, relevant: Relevancy.Side, handlers: Handlers) {
      this.relevant = relevant;
      this.field = context.field;
      this.pokemon = new Pokemon(context.gen, side.pokemon, relevant.pokemon, {handlers, move: context.move, side: this});
      this.sideConditions = {};
      for (const sc in side.sideConditions) {
        this.sideConditions[sc] = reify(extend({}, side.sideConditions[sc]), sc as ID, handlers.Conditions, () => {
          this.relevant.sideConditions[sc] = true;
        });
      }
      this.active = this.active?.map(p => extend({}, p));
      this.team = this.team?.map(p => extend({}, p));
    }

    toState(): State.Side {
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

  type PokemonPossibility = {
    status?: {name: StatusName} & Partial<Handler<Context>>;
    statusData?: {toxicTurns: number};
    item?: {id: ID} & Partial<Handler<Context.Pokemon>>;
    position?: number;
    transformed?: boolean;
    hp: number;
    types: [TypeName] | [TypeName, TypeName];
    addedType?: TypeName;
    switching?: 'in' | 'out';
    moveLastTurnResult?: unknown;
    hurtThisTurn?: unknown;
    weighthg: number;
    stats: StatsTable;
    boosts: BoostsTable;
    ability?: {id: ID} & Partial<Handler<Context.Pokemon>>;
  };

  export class Pokemon {
    species: Specie;
    level: number;
    teraType: TypeName;
    maxhp: number;
    gender?: GenderName;
    happiness?: number;

    readonly relevant: Relevancy.Pokemon;
    readonly side?: Context.Side;
    readonly move?: Context.Move;
    readonly gen: Generation;

    private nature?: NatureName;
    private evs?: Partial<StatsTable>;
    private ivs?: Partial<StatsTable>;

    possibilities: Distribution<PokemonPossibility>;

    constructor(
      gen: Generation,
      state: DeepReadonly<State.Pokemon>,
      relevant: Relevancy.Pokemon,
      options: {
        handlers?: Handlers;
        move?: Context.Move;
        side?: Context.Side;
      } = {}
    ) {
      this.relevant = relevant;
      this.side = options.side;
      this.move = options.move;
      this.gen = gen;
      this.species = state.species as Specie;
      this.level = state.level;
      this.teraType = state.teraType || state.types[0];
      const handlers = options.handlers || HANDLERS;

      this.maxhp = state.maxhp;
      this.nature = state.nature;
      this.evs = state.evs;
      this.ivs = state.ivs;

      this.possibilities = new Distribution<Possibility>({
        weighthg: state.weighthg,
        status: state.status
          ? reify({name: state.status}, state.status as ID, handlers.Conditions, () => {
              this.relevant.status = true;
            })
          : undefined,
        statusData: state.statusState ? extend({}, state.statusState) : undefined,
        item: state.item
          ? reify({id: state.item}, state.item, handlers.Items, () => {
              this.relevant.item = true;
            })
          : undefined,
        position: state.position,
        hp: state.hp,
        types: state.types.slice() as Possibility['types'],
        addedType: state.addedType,
        switching: state.switching,
        moveLastTurnResult: state.moveLastTurnResult,
        hurtThisTurn: state.hurtThisTurn,
        stats: state.stats ? extend({}, state.stats) : ({} as StatsTable),
        boosts: state.boosts ? extend({}, state.boosts) : ({} as BoostsTable),
      });
    }

    toState(): State.Pokemon {
      //TODO: handle multiple possibilities
      const temp = this.possibilities.reduce<Possibility | null>((acc, val) => {
        if (!acc || val.hp < acc.hp) return val;
        return acc;
      }, null)!;
      return {
        species: this.species,
        level: this.level,
        weighthg: temp.weighthg,
        item: temp.item?.id,
        ability: temp.ability?.id,
        gender: this.gender,
        teraType: this.teraType,
        happiness: this.happiness,
        status: temp.status?.name,
        statusState: temp.statusData && extend({}, temp.statusData),
        volatiles: {},
        types: temp.types.slice() as [TypeName] | [TypeName, TypeName],
        addedType: temp.addedType,
        maxhp: this.maxhp,
        hp: temp.hp,
        nature: this.nature,
        evs: this.evs && extend({}, this.evs),
        ivs: this.ivs && extend({}, this.ivs),
        stats: extend({}, temp.stats),
        boosts: extend({}, temp.boosts),
        position: temp.position,
        switching: temp.switching,
        moveLastTurnResult: temp.moveLastTurnResult,
        hurtThisTurn: temp.hurtThisTurn,
      };
    }

    //TODO: Reimplement boosts when we handle multiple possibilities
    // addBoost(stat: BoostID, stage: number) {
    //   this.boosts[stat] = this.boosts[stat] += stage;
    //   if (this.boosts[stat] > 6) this.boosts[stat] = 6;
    //   if (this.boosts[stat] < -6) this.boosts[stat] = -6;
    // }

    static pdzFromState(gen: Generation, pokemon: DeepReadonly<State.Pokemon>, relevancy: Relevancy.Pokemon, move: Context.Move): Pokemon {
      return new Pokemon(gen, pokemon, relevancy, {move});
    }
  }

  export class Move implements State.Move, DMove, Partial<Handler<Context>> {
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
    hasSheerForce?: boolean;
    isConfusionSelfHit?: boolean;
    isFutureMove?: boolean;
    noSketch?: boolean;
    stallingMove?: boolean;

    crit?: boolean;
    hits?: number;
    magnitude?: number;
    spread?: boolean;
    consecutive?: number; // Metronome

    basePowerCallback?(data: TestData): number;
    damageCallback?(context: TestData): number;
    onTryImmunity?(context: TestData): boolean;
    onBasePower?(context: TestData): number | undefined;
    onModifyAtk?(context: TestData): number | undefined;
    onModifySpA?(context: TestData): number | undefined;
    onModifyDef?(context: TestData): number | undefined;
    onModifySpD?(context: TestData): number | undefined;
    onModifySpe?(context: TestData): number | undefined;
    onModifyWeight?(context: TestData): number | undefined;
    onResidual?(context: TestData): number | undefined;
    onEffectiveness?(context: TestData): number | undefined;
    onModifyMove?(context: TestData): void;

    readonly relevant: Relevancy.Move;
    effectiveness: number = 0;

    //Lumaris draftzone addition
    constructor(state: DeepReadonly<State.Move>, relevant: Relevancy.Move, handlers: Handlers = HANDLERS) {
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

    updateData(context: Context) {
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

    pdzUpdateData(gen: Generation, pokemon: Context.Pokemon) {
      const testData = {attacker: pokemon, move: this, gen};
      if (this.onModifyMove) this.onModifyMove(testData);
      if (this.basePowerCallback) this.basePower = this.basePowerCallback(testData);

      let basePowerMod = 0x1000;
      if (pokemon.ability?.onModifyMove) pokemon.ability.onModifyMove(pokemon);
      if (pokemon.ability?.onBasePower) {
        const onBasePower = pokemon.ability.onBasePower(pokemon);
        if (onBasePower && pokemon.move) pokemon.move.relevant.modified.basePower = true;
        basePowerMod = chain(basePowerMod, onBasePower);
      }

      if (pokemon.item?.onBasePower) {
        basePowerMod = chain(basePowerMod, pokemon.item.onBasePower(pokemon));
      }

      if (this.onBasePower) basePowerMod = chain(basePowerMod, this.onBasePower(testData));

      this.basePower = apply(this.basePower, basePowerMod);
    }

    toState(): State.Move {
      return extend({}, this);
    }
  }
}

function reify<T>(obj: T & Partial<Handler<Context | Context.Pokemon | TestData>>, id: ID, handlers: Handlers[HandlerKind], cbfn?: () => void) {
  const handler = handlers[id];
  if (handler) {
    for (const n in handler) {
      const k = n as keyof Handler<Context | Context.Pokemon | TestData>; // not really, but HANDLER_FNS is checked below
      const fn = handler[k];
      if (fn && typeof fn === 'function') {
        obj[k] = (x: Context | Context.Pokemon) => {
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

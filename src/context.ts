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
import {HANDLERS, HANDLER_FNS, Handler, HandlerKind, Handlers} from './handlers';
import {Relevancy} from './relevancy';
import {Action, Slot, State} from './state';
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
  attackerSide: Context.Side;
  targetSide: Context.Side;
  move: Context.Move;
  field: Context.Field;

  readonly relevant: Relevancy;
  private readonly source: DeepReadonly<State>;

  constructor(
    state: DeepReadonly<State>,
    handlers: Handlers = HANDLERS,
    relevant: Relevancy = new Relevancy(state.sides.length)
  ) {
    this.source = state;
    this.gameType = state.gameType;
    this.gen = state.gen as Generation;
    const actor = state.action.actor as Slot;
    const target = state.action.target as Slot;
    this.move = new Context.Move(state.action.move, relevant.move, handlers);
    this.field = new Context.Field(state.field, relevant.field, handlers);
    this.attackerSide = new Context.Side(this, state.sides[actor.side], actor, relevant, handlers);
    this.targetSide = new Context.Side(this, state.sides[target.side], target, relevant, handlers);
    this.move.updateData(this);
    this.relevant = relevant;
  }

  get attacker(): Context.Pokemon {
    return this.attackerSide.pokemon;
  }

  get target(): Context.Pokemon {
    return this.targetSide.pokemon;
  }

  get action(): Action {
    return this.source.action as Action;
  }

  get relevantAttacker(): Relevancy.Pokemon {
    return this.relevant.pokemon(this.source.action.actor as Slot);
  }

  get relevantTarget(): Relevancy.Pokemon {
    return this.relevant.pokemon(this.source.action.target as Slot);
  }

  toState(): State {
    const actor = this.source.action.actor as Slot;
    const target = this.source.action.target as Slot;
    let state = new State(
      this.gen,
      this.source.sides as State.Side[],
      {actor, target, move: this.move.toState()},
      this.field.toState(),
      this.gameType
    );
    state = state.withSideAt(actor.side, this.attackerSide.toState(state.sides[actor.side], actor.active));
    state = state.withSideAt(target.side, this.targetSide.toState(state.sides[target.side], target.active));
    return state;
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
    allies?: Array<{
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

    constructor(context: Context, side: DeepReadonly<State.Side>, slot: Slot, relevant: Relevancy, handlers: Handlers) {
      this.relevant = relevant.side(slot.side);
      this.field = context.field;
      this.pokemon = new Pokemon(context.gen, side.active[slot.active], relevant.pokemon(slot), {
        handlers,
        move: context.move,
        side: this,
      });
      this.sideConditions = {};
      for (const sc in side.sideConditions) {
        this.sideConditions[sc] = reify(extend({}, side.sideConditions[sc]), sc as ID, handlers.Conditions, () => {
          this.relevant.sideConditions[sc] = true;
        });
      }
      this.allies = side.allies?.map(p => extend({}, p));
      this.team = side.team?.map(p => extend({}, p)) as Side['team'];
    }

    toState(base: State.Side, index: number): State.Side {
      return {
        ...base,
        active: base.active.map((pokemon, i) => (i === index ? this.pokemon.toState() : pokemon)),
        sideConditions: extend({}, this.sideConditions),
        allies: this.allies?.map(p => extend({}, p)),
        team: this.team?.map(p => extend({}, p)) as State.Side['team'],
      };
    }
  }

  export class Pokemon {
    species: Specie;
    level: number;
    weighthg: number;

    item?: {id: ID} & Partial<Handler<Context.Pokemon>>;
    ability?: {id: ID} & Partial<Handler<Context.Pokemon>>;
    gender?: GenderName;
    happiness?: number;

    status?: {name: StatusName} & Partial<Handler<Context>>;
    statusData?: {toxicTurns: number};
    volatiles: {[id: string]: {level?: number} & Partial<Handler<Context>>};

    types: [TypeName] | [TypeName, TypeName];
    baseTypes: [TypeName] | [TypeName, TypeName];
    addedType?: TypeName;
    teraType: TypeName;
    terastallized: boolean;

    maxhp: number;
    hp: number;

    // The stored stats based simply on spread and base stats.
    stats: StatsTable;
    boosts: BoostsTable;

    position?: number;
    transformed?: boolean;
    switching?: 'in' | 'out';
    moveLastTurnResult?: unknown;
    hurtThisTurn?: unknown;

    readonly relevant: Relevancy.Pokemon;
    readonly side?: Context.Side;
    readonly move?: Context.Move;
    readonly gen: Generation;

    private nature?: NatureName;
    private evs?: Partial<StatsTable>;
    private ivs?: Partial<StatsTable>;

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
      this.weighthg = state.weighthg;
      this.teraType = state.teraType || state.types[0];
      this.terastallized = !!state.terastallized;
      const handlers = options.handlers || HANDLERS;

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

      this.baseTypes = state.types.slice() as Pokemon['types'];
      this.types = this.terastallized ? [this.teraType] : (state.types.slice() as Pokemon['types']);
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
        const nature = state.nature && gen.natures.get(state.nature);
        for (const stat of gen.stats) {
          this.stats[stat] = gen.stats.calc(
            stat,
            this.species.baseStats[stat],
            state.ivs?.[stat] ?? 31,
            state.evs?.[stat] ?? (gen.num <= 2 ? 252 : 0),
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

      this.position = state.position;
      this.switching = state.switching;
      this.moveLastTurnResult = state.moveLastTurnResult;
      this.hurtThisTurn = state.hurtThisTurn;
    }

    toState(): State.Pokemon {
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
        terastallized: this.terastallized,
        happiness: this.happiness,
        status: this.status?.name,
        statusState: this.statusData && extend({}, this.statusData),
        volatiles,
        types: this.baseTypes.slice() as Pokemon['types'],
        addedType: this.addedType,
        maxhp: this.maxhp,
        hp: this.hp,
        nature: this.nature,
        evs: this.evs && extend({}, this.evs),
        ivs: this.ivs && extend({}, this.ivs),
        stats: extend({}, this.stats),
        boosts: extend({}, this.boosts),
        position: this.position,
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
    secondaries!: SecondaryEffect[];
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
    heal?: number[];
    forceSwitch?: boolean;
    selfSwitch?: boolean | 'copyvolatile';
    selfBoost?: {boosts?: Partial<BoostsTable>};
    selfdestruct?: boolean | 'ifHit' | 'always';
    breaksProtect?: boolean;
    recoil?: [number, number];
    drain?: [number, number];
    mindBlownRecoil?: boolean;
    stealsBoosts?: boolean;
    secondary?: SecondaryEffect;
    self?: HitEffect;
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
    hit?: number;
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

    constructor(state: DeepReadonly<State.Move>, relevant: Relevancy.Move, handlers: Handlers = HANDLERS) {
      extend(this, state);
      for (const fn of HANDLER_FNS) delete (this as Partial<Record<keyof Handler<unknown>, unknown>>)[fn];
      this.relevant = relevant;
      reify(this, this.id, handlers.Moves);
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
      if (context.attacker.ability?.onModifyMove) context.attacker.ability.onModifyMove(context.attacker);
      if (context.attacker.item?.onModifyMove) context.attacker.item.onModifyMove(context.attacker);

      this.effectiveness =
        this.EFFECTIVENESSBIT[context.gen.types.totalEffectiveness(this.type, context.target) as keyof typeof this.EFFECTIVENESSBIT];
      if (context.target.move?.onEffectiveness) {
        let effectiveness = context.target.move.onEffectiveness(context);
        if (effectiveness !== undefined) this.effectiveness = effectiveness;
      }
      if (context.target.item?.onEffectiveness) {
        let effectiveness = context.target.item.onEffectiveness(context.target);
        if (effectiveness !== undefined) this.effectiveness = effectiveness;
      }

      if (this.onModifyMove) this.onModifyMove(context);
      if (this.basePowerCallback) this.basePower = this.basePowerCallback(context);

      let basePowerMod = 0x1000;
      if (context.attacker.ability?.onBasePower) {
        basePowerMod = chain(basePowerMod, context.attacker.ability.onBasePower(context.attacker));
      }

      if (context.attacker.item?.onBasePower) {
        basePowerMod = chain(basePowerMod, context.attacker.item.onBasePower(context.attacker));
      }

      if (this.onBasePower) basePowerMod = chain(basePowerMod, this.onBasePower(context));

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
      const k = n as keyof Handler<Context | Context.Pokemon | TestData>;
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

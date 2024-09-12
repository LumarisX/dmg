import type {
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
} from "@pkmn/data";

import { TerrainName, WeatherName } from "./conditions";
import {
  HANDLERS,
  HANDLER_FNS,
  Handler,
  HandlerKind,
  Handlers,
} from "./mechanics";
import { Relevancy } from "./result";
import { DeepReadonly, extend, toID } from "./utils";
import { State } from "./state";
import { apply, chain } from "./math";

export class Context {
  gameType: GameType;
  gen: Generation;
  p1: Context.Side;
  p2: Context.Side;
  move: Context.Move;
  field: Context.Field;
  effectiveness: number;

  readonly relevant: Relevancy;

  constructor(
    state: DeepReadonly<State>,
    handlers: Handlers = HANDLERS,
    relevant: Relevancy = new Relevancy()
  ) {
    this.gameType = state.gameType;
    this.gen = state.gen as Generation;
    this.p1 = new Context.Side(this, state.p1, relevant.p1, handlers);
    this.p2 = new Context.Side(this, state.p2, relevant.p2, handlers);
    this.move = new Context.Move(state.move, relevant.move, handlers);
    this.move.updateData(this);
    this.field = new Context.Field(state.field, relevant.field, handlers);
    this.effectiveness = this.gen.types.totalEffectiveness(
      this.move.type,
      this.p2.pokemon
    );
    this.relevant = relevant;
  }

  toState() {
    return new State(
      this.gen,
      this.p1.toState(),
      this.p2.toState(),
      this.move.toState(),
      this.field.toState(),
      this.gameType
    );
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
    weather?: { name: WeatherName } & Partial<Handler<Context>>;
    terrain?: { name: TerrainName } & Partial<Handler<Context>>;
    pseudoWeather: {
      [id: string]: { data: object } & Partial<Handler<Context>>;
    };

    readonly relevant: Relevancy.Field;

    constructor(
      state: DeepReadonly<State.Field>,
      relevant: Relevancy.Field,
      handlers: Handlers
    ) {
      this.relevant = relevant;

      if (state.weather) {
        const id = toID(state.weather);
        this.weather = reify(
          { name: state.weather },
          id,
          handlers.Conditions,
          () => {
            this.relevant.weather = true;
          }
        );
      }
      if (state.terrain) {
        const id = toID(state.terrain);
        this.terrain = reify(
          { name: state.terrain },
          id,
          handlers.Conditions,
          () => {
            this.relevant.terrain = true;
          }
        );
      }
      this.pseudoWeather = {};
      for (const pw in state.pseudoWeather) {
        this.pseudoWeather[pw] = reify(
          { data: state.pseudoWeather[pw] },
          pw as ID,
          handlers.Conditions,
          () => {
            this.relevant.pseudoWeather[pw] = true;
          }
        );
      }
    }

    toState(): State.Field {
      const pseudoWeather: { [id: string]: object } = {};
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
      [id: string]: { level?: number } & Partial<Handler<Context>>;
    };
    active?: Array<{
      ability?: ID;
      position?: number;
      fainted?: boolean;
    } | null>;
    team?: Array<{
      species: { baseStat: { atk: number } };
      status?: StatusName;
      fainted?: boolean;
      position?: number;
    }>;
    readonly context: Context;
    readonly relevant: Relevancy.Side;

    constructor(
      context: Context,
      state: DeepReadonly<State.Side>,
      relevant: Relevancy.Side,
      handlers: Handlers
    ) {
      this.relevant = relevant;
      this.context = context;
      this.pokemon = new Pokemon(
        context,
        state.pokemon,
        relevant.pokemon,
        handlers
      );
      this.sideConditions = {};
      for (const sc in state.sideConditions) {
        this.sideConditions[sc] = reify(
          extend({}, state.sideConditions[sc]),
          sc as ID,
          handlers.Conditions,
          () => {
            this.relevant.sideConditions[sc] = true;
          }
        );
      }
      this.active = this.active?.map((p) => extend({}, p));
      this.team = this.team?.map((p) => extend({}, p));
    }

    toState(): State.Side {
      const sideConditions: { [id: string]: { level?: number } } = {};
      for (const sc in this.sideConditions) {
        sideConditions[sc] =
          "level" in this.sideConditions[sc]
            ? { level: this.sideConditions[sc].level }
            : {};
      }
      return {
        pokemon: this.pokemon.toState(),
        sideConditions: extend({}, this.sideConditions),
        active: this.active?.map((p) => extend({}, p)),
        team: this.team?.map((p) => extend({}, p)),
      };
    }
  }

  export class Pokemon {
    species: Specie;
    level: number;
    weighthg: number;

    item?: { id: ID } & Partial<Handler<Context.Pokemon>>;
    ability?: { id: ID } & Partial<Handler<Context.Pokemon>>;
    gender?: GenderName;
    happiness?: number;

    status?: { name: StatusName } & Partial<Handler<Context>>;
    statusData?: { toxicTurns: number };
    volatiles: { [id: string]: { level?: number } & Partial<Handler<Context>> };

    types: [TypeName] | [TypeName, TypeName];
    addedType?: TypeName;

    maxhp: number;
    hp: number;

    // The stored stats based simply on spread and base stats.
    stats: StatsTable;
    boosts: BoostsTable;

    position?: number;
    transformed?: boolean;
    switching?: "in" | "out";
    moveLastTurnResult?: unknown;
    hurtThisTurn?: unknown;

    readonly relevant: Relevancy.Pokemon;
    readonly context: Context;

    private nature?: NatureName;
    private evs?: Partial<StatsTable>;
    private ivs?: Partial<StatsTable>;

    constructor(
      context: Context,
      state: DeepReadonly<State.Pokemon>,
      relevant: Relevancy.Pokemon,
      handlers: Handlers
    ) {
      this.relevant = relevant;
      this.context = context;
      this.species = state.species as Specie;
      this.level = state.level;
      this.weighthg = state.weighthg;

      if (state.item) {
        this.item = reify(
          { id: state.item },
          state.item,
          handlers.Items,
          () => {
            this.relevant.item = true;
          }
        );
      }
      if (state.ability) {
        this.ability = reify(
          { id: state.ability },
          state.ability,
          handlers.Abilities,
          () => {
            this.relevant.ability = true;
          }
        );
      }
      this.gender = state.gender;
      this.happiness = state.happiness;

      if (state.status) {
        this.status = reify(
          { name: state.status },
          state.status as ID,
          handlers.Conditions,
          () => {
            this.relevant.status = true;
          }
        );
      }
      this.statusData = this.statusData && extend({}, state.statusState);
      this.volatiles = {};
      for (const v in state.volatiles) {
        this.volatiles[v] = reify(
          extend({}, state.volatiles[v]),
          v as ID,
          handlers.Conditions,
          () => {
            this.relevant.volatiles[v] = true;
          }
        );
      }

      this.types = state.types.slice() as Pokemon["types"];
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
          if (stat === "atk" && this.item?.onModifyAtk)
            statMod = chain(statMod, this.item.onModifyAtk(this));
          if (stat === "spa" && this.item?.onModifySpA)
            statMod = chain(statMod, this.item.onModifySpA(this));
          if (stat === "def" && this.item?.onModifyDef)
            statMod = chain(statMod, this.item.onModifyDef(this));
          if (stat === "spd" && this.item?.onModifySpD)
            statMod = chain(statMod, this.item.onModifySpD(this));
          if (stat === "spe" && this.item?.onModifySpe)
            statMod = chain(statMod, this.item.onModifySpe(this));
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
      const volatiles: { [id: string]: { level?: number } } = {};
      for (const v in this.volatiles) {
        volatiles[v] =
          "level" in this.volatiles[v]
            ? { level: this.volatiles[v].level }
            : {};
      }
      return {
        species: this.species,
        level: this.level,
        weighthg: this.weighthg,
        item: this.item?.id,
        ability: this.ability?.id,
        gender: this.gender,
        happiness: this.hp,
        status: this.status?.name,
        statusState: this.statusData && extend({}, this.statusData),
        volatiles,
        types: this.types.slice() as Pokemon["types"],
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
  }

  export class Move implements State.Move, Partial<Handler<Context>> {
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

    effectType!: "Move";
    kind!: "Move";
    secondaries!: SecondaryEffect[] | null;
    flags!: DMove["flags"];
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
    damage?: number | "level" | false | null;
    noPPBoosts?: boolean;

    ohko?: boolean | "Ice";
    thawsTarget?: boolean;
    heal?: number[] | null;
    forceSwitch?: boolean;
    selfSwitch?: boolean | "copyvolatile";
    selfBoost?: { boosts?: Partial<BoostsTable> };
    selfdestruct?: boolean | "ifHit" | "always";
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
    overrideOffensivePokemon?: "target" | "source";
    overrideOffensiveStat?: Exclude<StatID, "hp">;
    overrideDefensivePokemon?: "target" | "source";
    overrideDefensiveStat?: Exclude<StatID, "hp">;
    forceSTAB?: boolean;
    ignoreAbility?: boolean;
    ignoreAccuracy?: boolean;
    ignoreDefensive?: boolean;
    ignoreEvasion?: boolean;
    ignoreImmunity?: boolean | { [k in keyof TypeName]?: boolean };
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

    basePowerCallback?(context: Context): number;
    damageCallback?(context: Context): number;
    onBasePower?(context: Context): number | undefined;
    onModifyAtk?(pokemon: Context): number | undefined;
    onModifySpA?(pokemon: Context): number | undefined;
    onModifyDef?(pokemon: Context): number | undefined;
    onModifySpD?(pokemon: Context): number | undefined;
    onModifySpe?(pokemon: Context): number | undefined;
    onModifyWeight?(pokemon: Context): number | undefined;
    onResidual?(pokemon: Context): number | undefined;

    readonly relevant: Relevancy.Move;

    constructor(
      state: DeepReadonly<State.Move>,
      relevant: Relevancy.Move,
      handlers: Handlers
    ) {
      extend(this, state);
      this.relevant = relevant;
      reify(this, this.id, handlers.Moves);
    }

    updateData(context: Context) {
      if (this.basePowerCallback)
        this.basePower = this.basePowerCallback(context);

      let basePowerMod = 0x1000;
      if (context.p1.pokemon.ability?.onBasePower)
        basePowerMod = chain(
          basePowerMod,
          context.p1.pokemon.ability?.onBasePower(context.p1.pokemon)
        );

      if (this.onBasePower)
        basePowerMod = chain(basePowerMod, this.onBasePower(context));

      this.basePower = apply(this.basePower, basePowerMod);
    }

    toState(): State.Move {
      return extend({}, this);
    }
  }
}

function reify<T>(
  obj: T & Partial<Handler<Context | Context.Pokemon>>,
  id: ID,
  handlers: Handlers[HandlerKind],
  cbfn?: () => void
) {
  const handler = handlers[id];
  if (handler) {
    for (const n in handler) {
      const k = n as keyof Handler<Context | Context.Pokemon>; // not really, but HANDLER_FNS is checked below
      const fn = handler[k];
      if (fn && HANDLER_FNS.has(k) && typeof fn === "function") {
        obj[k] = (x: Context | Context.Pokemon) => {
          const r = (fn as any)(x);
          if (typeof r !== "undefined" && cbfn) cbfn();
          return r;
        };
      }
    }
  }
  return obj;
}

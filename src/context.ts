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

  export type Possibility = {
    status?: {name: StatusName} & Partial<Handler<Context>>;
    statusData?: {toxicTurns: number};
    item?: {id: ID} & Partial<Handler<PokemonPossibility>>;
    position?: number;
    transformed?: boolean;
    hp: number;
    types: [TypeName] | [TypeName, TypeName];
    addedType?: TypeName;
    switching?: 'in' | 'out';
    moveLastTurnResult?: unknown;
    hurtThisTurn?: unknown;
    weighthg: number;
    boosts: BoostsTable;
    ability?: {id: ID} & Partial<Handler<PokemonPossibility>>;
    volatiles: {[id: string]: {level?: number} & Partial<Handler<Context>>};
  };

  export class Pokemon {
    transformed?: boolean;
    statusData?: {toxicTurns: number};

    private _overrides: Partial<{
      weighthg: number;
      types: [TypeName] | [TypeName, TypeName];
      hp: number;
      position: number | undefined;
      switching: 'in' | 'out' | undefined;
      moveLastTurnResult: unknown;
      hurtThisTurn: unknown;
      addedType: TypeName | undefined;
      item: ({id: ID} & Partial<Handler<Context.Pokemon>>) | undefined;
      ability: ({id: ID} & Partial<Handler<Context.Pokemon>>) | undefined;
      status: ({name: StatusName} & Partial<Handler<Context>>) | undefined;
      volatiles: {[id: string]: {level?: number} & Partial<Handler<Context>>};
    }> = {};

    private pokemonItem?: {id: ID} & Partial<Handler<Context.Pokemon>>;
    private pokemonAbility?: {id: ID} & Partial<Handler<Context.Pokemon>>;
    private pokemonStatus?: {name: StatusName} & Partial<Handler<Context>>;
    private pokemonVolatiles?: {[id: string]: {level?: number} & Partial<Handler<Context>>};

    get weighthg(): number {
      return this._overrides.weighthg ?? this.pokemon.weighthg;
    }
    set weighthg(value: number) {
      this._overrides.weighthg = value;
    }

    get types(): [TypeName] | [TypeName, TypeName] {
      return this._overrides.types ?? [...this.pokemon.types];
    }
    set types(value: [TypeName] | [TypeName, TypeName]) {
      this._overrides.types = value;
    }

    get hp(): number {
      return this._overrides.hp ?? this.pokemon.hp;
    }
    set hp(value: number) {
      this._overrides.hp = value;
    }

    get position(): number | undefined {
      return this._overrides.position ?? this.pokemon.position;
    }
    set position(value: number | undefined) {
      this._overrides.position = value;
    }

    get switching(): 'in' | 'out' | undefined {
      return this._overrides.switching ?? this.pokemon.switching;
    }
    set switching(value: 'in' | 'out' | undefined) {
      this._overrides.switching = value;
    }

    get moveLastTurnResult(): unknown {
      return this._overrides.moveLastTurnResult ?? this.pokemon.moveLastTurnResult;
    }
    set moveLastTurnResult(value: unknown) {
      this._overrides.moveLastTurnResult = value;
    }

    get hurtThisTurn(): unknown {
      return this._overrides.hurtThisTurn ?? this.pokemon.hurtThisTurn;
    }
    set hurtThisTurn(value: unknown) {
      this._overrides.hurtThisTurn = value;
    }

    get addedType(): TypeName | undefined {
      return this._overrides.addedType ?? this.pokemon.addedType;
    }
    set addedType(value: TypeName | undefined) {
      this._overrides.addedType = value;
    }

    get item(): ({id: ID} & Partial<Handler<Context.Pokemon>>) | undefined {
      return this._overrides.item ?? this.pokemonItem;
    }
    set item(value: ({id: ID} & Partial<Handler<Context.Pokemon>>) | undefined) {
      this._overrides.item = value;
    }

    get ability(): ({id: ID} & Partial<Handler<Context.Pokemon>>) | undefined {
      return this._overrides.ability ?? this.pokemonAbility;
    }
    set ability(value: ({id: ID} & Partial<Handler<Context.Pokemon>>) | undefined) {
      this._overrides.ability = value;
    }

    get status(): ({name: StatusName} & Partial<Handler<Context>>) | undefined {
      return this._overrides.status ?? this.pokemonStatus;
    }
    set status(value: ({name: StatusName} & Partial<Handler<Context>>) | undefined) {
      this._overrides.status = value;
    }

    get volatiles(): {[id: string]: {level?: number} & Partial<Handler<Context>>} {
      return this._overrides.volatiles ?? this.pokemonVolatiles ?? {};
    }
    set volatiles(value: {[id: string]: {level?: number} & Partial<Handler<Context>>}) {
      this._overrides.volatiles = value;
    }

    readonly boosts: BoostsTable;
    readonly pokemon: DeepReadonly<State.Pokemon>;
    readonly side?: Context.Side;
    readonly move?: Context.Move;
    readonly gen: Generation;
    readonly gender?: GenderName;
    readonly species: Specie;
    readonly level: number;
    readonly teraType: TypeName;
    readonly nature?: NatureName;
    readonly evs?: Partial<StatsTable>;
    readonly ivs?: Partial<StatsTable>;
    readonly stats: StatsTable;
    readonly maxhp: number;
    readonly happiness?: number;

    constructor(
      gen: Generation,
      pokemon: DeepReadonly<State.Pokemon>,
      relevant: Relevancy.Pokemon,
      options: {
        handlers?: Handlers;
        move?: Context.Move;
        side?: Context.Side;
      } = {}
    ) {
      this.pokemon = pokemon;
      this.side = options.side;
      this.move = options.move;
      this.gen = gen;
      this.species = pokemon.species as Specie;
      this.level = pokemon.level;
      this.teraType = pokemon.teraType || pokemon.types[0];
      const handlers = options.handlers || HANDLERS;
      this.gender = pokemon.gender;
      this.happiness = pokemon.happiness;

      if (pokemon.item) {
        this.pokemonItem = reify({id: pokemon.item}, pokemon.item, handlers.Items, () => {
          // this.relevant.item = true;
        });
      }
      if (pokemon.ability) {
        this.pokemonAbility = reify({id: pokemon.ability}, pokemon.ability, handlers.Abilities, () => {
          // this.relevant.ability = true;
        });
      }

      if (pokemon.status) {
        this.pokemonStatus = reify({name: pokemon.status}, pokemon.status as ID, handlers.Conditions, () => {
          // this.relevant.status = true;
        });
      }
      this.pokemonVolatiles = {};
      for (const v in pokemon.volatiles) {
        this.pokemonVolatiles[v] = reify(extend({}, pokemon.volatiles[v]), v as ID, handlers.Conditions, () => {
          // this.relevant.volatiles[v] = true;
        });
      }

      this.maxhp = pokemon.maxhp;
      this.hp = pokemon.hp;

      this.nature = pokemon.nature;
      this.evs = pokemon.evs;
      this.ivs = pokemon.ivs;

      if (pokemon.stats) {
        this.stats = extend({}, pokemon.stats);
      } else {
        this.stats = {} as StatsTable;
        const nature = pokemon.nature && gen.natures.get(pokemon.nature);
        for (const stat of gen.stats) {
          this.stats[stat] = gen.stats.calc(
            stat,
            this.species.baseStats[stat],
            pokemon.ivs?.[stat] ?? 31,
            pokemon.evs?.[stat] ?? (gen.num <= 2 ? 252 : 0),
            pokemon.level,
            nature
          );
          let statMod = 0x1000;
          // if (stat === 'atk' && this.item?.onModifyAtk) {
          //   statMod = chain(statMod, this.item.onModifyAtk(this));
          // }
          // if (stat === 'spa' && this.item?.onModifySpA) {
          //   statMod = chain(statMod, this.item.onModifySpA(this));
          // }
          // if (stat === 'def' && this.item?.onModifyDef) {
          //   statMod = chain(statMod, this.item.onModifyDef(this));
          // }
          // if (stat === 'spd' && this.item?.onModifySpD) {
          //   statMod = chain(statMod, this.item.onModifySpD(this));
          // }
          // if (stat === 'spe' && this.item?.onModifySpe) {
          //   statMod = chain(statMod, this.item.onModifySpe(this));
          // }
          this.stats[stat] = apply(this.stats[stat], statMod);
        }
      }
      this.boosts = extend({}, pokemon.boosts);
    }

    getRelevancy() {
      return this._overrides;
    }

    toState(): State.Pokemon {
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
        volatiles: {},
        types: this.types.slice() as [TypeName] | [TypeName, TypeName],
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

  export class PokemonPossibility implements Possibility {
    status?: ({name: StatusName} & Partial<Handler<Context>>) | undefined;
    statusData?: {toxicTurns: number} | undefined;
    item?: ({id: ID} & Partial<Handler<PokemonPossibility>>) | undefined;
    position?: number | undefined;
    transformed?: boolean | undefined;
    hp: number;
    types: [TypeName] | [TypeName, TypeName];
    addedType?: TypeName | undefined;
    switching?: 'in' | 'out' | undefined;
    moveLastTurnResult?: unknown;
    hurtThisTurn?: unknown;
    weighthg: number;
    boosts: BoostsTable;
    ability?: ({id: ID} & Partial<Handler<PokemonPossibility>>) | undefined;
    volatiles: {[id: string]: {level?: number} & Partial<Handler<Context>>};

    readonly side?: Context.Side;
    readonly move?: Context.Move;
    readonly gen: Generation;
    readonly gender?: GenderName;
    readonly species: Specie;
    readonly level: number;
    readonly teraType: TypeName;
    readonly nature?: NatureName;
    readonly evs?: Partial<StatsTable>;
    readonly ivs?: Partial<StatsTable>;
    readonly stats: StatsTable;
    readonly maxhp: number;
    readonly happiness?: number;

    constructor(possibility: Possibility, pokemon: Pokemon);
    constructor(clone: PokemonPossibility);
    constructor(arg1: Possibility | PokemonPossibility, arg2?: Pokemon) {
      //TODO: Refactor to avoid duplication
      if (arg1 instanceof PokemonPossibility) {
        const clone = arg1;
        this.status = clone.status ? extend({}, clone.status) : undefined;
        this.statusData = clone.statusData ? extend({}, clone.statusData) : undefined;
        this.item = clone.item ? extend({}, clone.item) : undefined;
        this.position = clone.position;
        this.transformed = clone.transformed;
        this.hp = clone.hp;
        this.types = Array.isArray(clone.types) ? ([...clone.types] as typeof clone.types) : clone.types;
        this.addedType = clone.addedType;
        this.switching = clone.switching;
        this.moveLastTurnResult = clone.moveLastTurnResult;
        this.hurtThisTurn = clone.hurtThisTurn;
        this.weighthg = clone.weighthg;
        this.boosts = extend({}, clone.boosts);
        this.ability = clone.ability ? extend({}, clone.ability) : undefined;
        this.volatiles = extend({}, clone.volatiles);
        this.species = clone.species;
        this.level = clone.level;
        this.teraType = clone.teraType;
        this.gen = clone.gen;
        this.gender = clone.gender;
        this.nature = clone.nature;
        this.evs = clone.evs ? extend({}, clone.evs) : undefined;
        this.ivs = clone.ivs ? extend({}, clone.ivs) : undefined;
        this.side = clone.side;
        this.move = clone.move;
        this.maxhp = clone.maxhp;
        this.happiness = clone.happiness;
        this.stats = clone.stats ? extend({}, clone.stats) : ({} as StatsTable);
      } else {
        const possibility = arg1 as Possibility;
        const pokemon = arg2!;
        this.status = extend({}, possibility.status);
        this.statusData = possibility.statusData ? extend({}, possibility.statusData) : undefined;
        this.item = extend({}, possibility.item);
        this.position = possibility.position;
        this.transformed = possibility.transformed;
        this.hp = possibility.hp;
        this.types = possibility.types;
        this.addedType = possibility.addedType;
        this.switching = possibility.switching;
        this.moveLastTurnResult = possibility.moveLastTurnResult;
        this.hurtThisTurn = possibility.hurtThisTurn;
        this.weighthg = possibility.weighthg;
        this.boosts = possibility.boosts;
        this.ability = extend({}, possibility.ability);
        this.volatiles = extend({}, possibility.volatiles);
        this.species = pokemon.species;
        this.level = pokemon.level;
        this.teraType = pokemon.teraType;
        this.gen = pokemon.gen;
        this.gender = pokemon.gender;
        this.nature = pokemon.nature;
        this.evs = pokemon.evs;
        this.ivs = pokemon.ivs;
        this.side = pokemon.side;
        this.move = pokemon.move;
        this.maxhp = pokemon.maxhp;
        this.happiness = pokemon.happiness;
        if (pokemon.stats) {
          this.stats = extend({}, pokemon.stats);
        } else {
          this.stats = {} as StatsTable;
          const nature = pokemon.nature && this.gen.natures.get(pokemon.nature);
          for (const stat of this.gen.stats) {
            this.stats[stat] = this.gen.stats.calc(
              stat,
              this.species.baseStats[stat],
              pokemon.ivs?.[stat] ?? 31,
              pokemon.evs?.[stat] ?? (this.gen.num <= 2 ? 252 : 0),
              pokemon.level,
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
      }
    }

    addBoost(stat: BoostID, stage: number) {
      this.boosts[stat] = this.boosts[stat] += stage;
      if (this.boosts[stat] > 6) this.boosts[stat] = 6;
      if (this.boosts[stat] < -6) this.boosts[stat] = -6;
    }
  }

  // export class OldPokemon {
  //   species: Specie;
  //   level: number;
  //   teraType: TypeName;
  //   maxhp: number;
  //   gender?: GenderName;
  //   happiness?: number;

  //   readonly relevant: Relevancy.Pokemon;
  //   readonly side?: Context.Side;
  //   readonly move?: Context.Move;
  //   readonly gen: Generation;
  //   readonly nature?: NatureName;
  //   readonly evs?: Partial<StatsTable>;
  //   readonly ivs?: Partial<StatsTable>;
  //   readonly stats?: StatsTable;
  //   possibilities: Distribution<Possibility>;

  //   constructor(
  //     gen: Generation,
  //     state: DeepReadonly<State.Pokemon>,
  //     relevant: Relevancy.Pokemon,
  //     options: {
  //       handlers?: Handlers;
  //       move?: Context.Move;
  //       side?: Context.Side;
  //     } = {}
  //   ) {
  //     this.relevant = relevant;
  //     this.side = options.side;
  //     this.move = options.move;
  //     this.gen = gen;
  //     this.species = state.species as Specie;
  //     this.level = state.level;
  //     this.teraType = state.teraType || state.types[0];
  //     const handlers = options.handlers || HANDLERS;

  //     this.maxhp = state.maxhp;
  //     this.nature = state.nature;
  //     this.evs = state.evs;
  //     this.ivs = state.ivs;
  //     this.stats = state.stats;

  //     const volatiles: {[id: string]: {level?: number} & Partial<Handler<Context>>} = {};
  //     for (const v in state.volatiles) {
  //       volatiles[v] = reify(extend({}, state.volatiles[v]), v as ID, handlers.Conditions, () => {
  //         this.relevant.volatiles[v] = true;
  //       });
  //     }

  //     this.possibilities = new Distribution<Possibility>({
  //       weighthg: state.weighthg,
  //       status: state.status
  //         ? reify({name: state.status}, state.status as ID, handlers.Conditions, () => {
  //             this.relevant.status = true;
  //           })
  //         : undefined,
  //       statusData: state.statusState ? extend({}, state.statusState) : undefined,
  //       item: state.item
  //         ? reify({id: state.item}, state.item, handlers.Items, () => {
  //             this.relevant.item = true;
  //           })
  //         : undefined,
  //       position: state.position,
  //       hp: state.hp,
  //       types: state.types.slice() as Possibility['types'],
  //       addedType: state.addedType,
  //       switching: state.switching,
  //       moveLastTurnResult: state.moveLastTurnResult,
  //       hurtThisTurn: state.hurtThisTurn,
  //       boosts: state.boosts ? extend({}, state.boosts) : ({} as BoostsTable),
  //       volatiles,
  //     });
  //   }

  //   toState(): State.Pokemon {
  //     //TODO: handle multiple possibilities
  //     const temp = this.possibilities.reduce<Possibility | null>((acc, val) => {
  //       if (!acc || val.hp < acc.hp) return val;
  //       return acc;
  //     }, null)!;
  //     return {
  //       species: this.species,
  //       level: this.level,
  //       weighthg: temp.weighthg,
  //       item: temp.item?.id,
  //       ability: temp.ability?.id,
  //       gender: this.gender,
  //       teraType: this.teraType,
  //       happiness: this.happiness,
  //       status: temp.status?.name,
  //       statusState: temp.statusData && extend({}, temp.statusData),
  //       volatiles: {},
  //       types: temp.types.slice() as [TypeName] | [TypeName, TypeName],
  //       addedType: temp.addedType,
  //       maxhp: this.maxhp,
  //       hp: temp.hp,
  //       nature: this.nature,
  //       evs: this.evs && extend({}, this.evs),
  //       ivs: this.ivs && extend({}, this.ivs),
  //       stats: extend({}, this.stats),
  //       boosts: extend({}, temp.boosts),
  //       position: temp.position,
  //       switching: temp.switching,
  //       moveLastTurnResult: temp.moveLastTurnResult,
  //       hurtThisTurn: temp.hurtThisTurn,
  //     };
  //   }

  //   static pdzFromState(gen: Generation, pokemon: DeepReadonly<State.Pokemon>, relevancy: Relevancy.Pokemon, move: Context.Move): Pokemon {
  //     return new Pokemon(gen, pokemon, relevancy, {move});
  //   }
  // }

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
      //TODO: Handle types, abilities and items that modify effectiveness
      this.effectiveness =
        this.EFFECTIVENESSBIT[
          context.gen.types.totalEffectiveness(this.type, context.p2.pokemon.species.types) as keyof typeof this.EFFECTIVENESSBIT
        ];
      if (context.p2.pokemon.move?.onEffectiveness) {
        let effectiveness = context.p2.pokemon.move.onEffectiveness(context);
        if (effectiveness !== undefined) this.effectiveness = effectiveness;
      }
      // if (context.p2.pokemon.item?.onEffectiveness) {
      //   let effectiveness = context.p2.pokemon.item.onEffectiveness(context.p2.pokemon);
      //   if (effectiveness !== undefined) this.effectiveness = effectiveness;
      // }

      if (this.onModifyMove) this.onModifyMove(context);
      if (this.basePowerCallback) this.basePower = this.basePowerCallback(context);

      let basePowerMod = 0x1000;
      // if (context.p1.pokemon.ability?.onBasePower) {
      //   basePowerMod = chain(basePowerMod, context.p1.pokemon.ability.onBasePower(context.p1.pokemon));
      // }

      // if (context.p1.pokemon.item?.onBasePower) {
      //   basePowerMod = chain(basePowerMod, context.p1.pokemon.item.onBasePower(context.p1.pokemon));
      // }

      if (this.onBasePower) basePowerMod = chain(basePowerMod, this.onBasePower(context));

      this.basePower = apply(this.basePower, basePowerMod);
    }

    // pdzUpdateData(gen: Generation, pokemon: Context.Pokemon) {
    //   const testData = {attacker: pokemon, move: this, gen};
    //   if (this.onModifyMove) this.onModifyMove(testData);
    //   if (this.basePowerCallback) this.basePower = this.basePowerCallback(testData);

    //   let basePowerMod = 0x1000;
    //   if (pokemon.ability?.onModifyMove) pokemon.ability.onModifyMove(pokemon);
    //   if (pokemon.ability?.onBasePower) {
    //     const onBasePower = pokemon.ability.onBasePower(pokemon);
    //     if (onBasePower && pokemon.move) pokemon.move.relevant.modified.basePower = true;
    //     basePowerMod = chain(basePowerMod, onBasePower);
    //   }

    //   if (pokemon.item?.onBasePower) {
    //     basePowerMod = chain(basePowerMod, pokemon.item.onBasePower(pokemon));
    //   }

    //   if (this.onBasePower) basePowerMod = chain(basePowerMod, this.onBasePower(testData));

    //   this.basePower = apply(this.basePower, basePowerMod);
    // }

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

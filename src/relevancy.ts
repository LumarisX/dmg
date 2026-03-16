import type {BoostID, BoostsTable, Generation, Specie, StatID, StatsTable} from '@pkmn/data';

import {State} from '../../pokemon-draftzone-server/dmg/state';
import {DeepReadonly, extend} from './utils';

export class Relevancy {
  gameType: boolean;
  readonly p1: Relevancy.Side;
  readonly p2: Relevancy.Side;
  readonly move: Relevancy.Move;
  readonly field: Relevancy.Field;

  constructor() {
    this.gameType = false;
    this.p1 = {
      pokemon: {volatiles: {}, stats: {}, boosts: {}},
      sideConditions: {},
    };
    this.p2 = {
      pokemon: {volatiles: {}, stats: {}, boosts: {}},
      sideConditions: {},
    };
    this.field = {pseudoWeather: {}};
    this.move = {modified: {}};
  }

  static simplify(state: DeepReadonly<State>, relevant: Relevancy): State {
    const gen = state.gen as Generation;
    return {
      gen,
      gameType: relevant.gameType ? state.gameType : 'singles',
      p1: simplifySide(gen, state.p1, relevant.p1),
      p2: simplifySide(gen, state.p2, relevant.p2),
      move: simplifyMove(state.move, relevant.move),
      field: simplifyField(state.field, relevant.field),
    };
  }
}

export namespace Relevancy {
  export interface Field {
    weather?: boolean;
    terrain?: boolean;
    pseudoWeather: {[id: string]: boolean};
  }

  export interface Side {
    pokemon: Pokemon;
    sideConditions: {[id: string]: boolean};
    active?: boolean;
    team?: boolean;
  }

  export interface Pokemon {
    // species is always relevant
    // level is always relevant (though sometimes elided from the output)
    // weighthg is relevant for weight based moves, but that's covered by move base power

    item?: boolean;
    ability?: boolean;

    status?: boolean;
    // statusData is covered by status: 'tox' already
    volatiles: {[id: string]: boolean};

    // types are always relevant (though usually elided in output)
    // addedType is always relevant

    // TODO: hp/maxhp is only relevant for attacker under certain circumstances!
    // hp is relevant for the defender, but is checked when calculating OHKO chance

    // certain moves/conditions change which stats are relevant
    stats: Partial<Omit<StatsTable<boolean>, 'hp'>>;
    // usually only the boosts in the relevant stats matter, but Stored Power etc depends on more
    boosts: Partial<BoostsTable<boolean>>;

    // position is never relevant, it merely exists as an implementation detail

    // relevant for the specific moves that make use of them
    gender?: boolean;
    switching?: boolean;
    moveLastTurnResult?: boolean;
    hurtThisTurn?: boolean;
  }

  export interface Move {
    modified: {
      basePower?: boolean;
      accuracy?: boolean;
      type?: boolean;
    };
    crit?: boolean;
    hits?: boolean;
    magnitude?: boolean;
    consecutive?: boolean;
    spread?: boolean;
    useZ?: boolean;
  }
}

function simplifyField(state: DeepReadonly<State.Field>, relevant: Relevancy.Field) {
  const field: State.Field = {
    weather: relevant.weather ? state.weather : undefined,
    terrain: relevant.terrain ? state.terrain : undefined,
    pseudoWeather: {},
  };
  for (const id in state.pseudoWeather) {
    if (relevant.pseudoWeather[id]) field.pseudoWeather[id] = extend({}, state.pseudoWeather[id]);
  }
  return field;
}

function simplifySide(gen: Generation, state: DeepReadonly<State.Side>, relevant: Relevancy.Side) {
  const side: State.Side = {
    pokemon: simplifyPokemon(gen, state.pokemon, relevant.pokemon),
    sideConditions: {},
    active: relevant.active ? state.active!.map(p => extend({}, p)) : undefined,
    team: relevant.team ? state.team!.map(p => extend({}, p)) : undefined,
  };
  for (const id in state.sideConditions) {
    if (relevant.sideConditions[id]) {
      side.sideConditions[id] = extend({}, state.sideConditions[id]);
    }
  }
  return side;
}

function simplifyPokemon(gen: Generation, state: DeepReadonly<State.Pokemon>, relevant: Relevancy.Pokemon) {
  const pokemon: State.Pokemon = {
    species: state.species as Specie,
    level: state.level,
    weighthg: state.weighthg,
    item: relevant.item ? state.item : undefined,
    ability: relevant.ability ? state.ability : undefined,
    gender: relevant.gender ? state.gender : undefined,
    status: relevant.status ? state.status : undefined,
    volatiles: {},
    types: state.types as State.Pokemon['types'],
    maxhp: state.maxhp,
    hp: state.hp,
    nature: state.nature,
    evs: {},
    ivs: {},
    boosts: {},
    switching: relevant.switching ? state.switching : undefined,
    moveLastTurnResult: relevant.moveLastTurnResult ? state.moveLastTurnResult : undefined,
    hurtThisTurn: relevant.hurtThisTurn ? state.hurtThisTurn : undefined,
  };
  for (const id in state.volatiles) {
    if (relevant.volatiles[id]) pokemon.volatiles[id] = extend({}, state.volatiles[id]);
  }
  // TODO: Hidden Power needs to mark all IVs as relevant, encode takes care of eliding.
  for (const s in relevant.stats) {
    const stat = s as StatID;
    pokemon.evs![stat] = state.evs?.[stat] ?? (gen.num <= 2 ? 252 : 0);
    pokemon.ivs![stat] = state.ivs?.[stat] ?? 31;
  }
  for (const b in relevant.boosts) {
    const boost = b as BoostID;
    pokemon.boosts[boost] = state.boosts[boost];
  }
  return pokemon;
}

function simplifyMove(state: DeepReadonly<State.Move>, relevant: Relevancy.Move) {
  const move = extend({}, state) as State.Move;
  if (!relevant.crit) move.crit = undefined;
  if (!relevant.hits) move.hits = undefined;
  if (!relevant.magnitude) move.magnitude = undefined;
  if (!relevant.spread) move.spread = undefined;
  if (!relevant.consecutive) move.consecutive = undefined;
  if (!relevant.useZ) move.useZ = undefined;
  return move;
}

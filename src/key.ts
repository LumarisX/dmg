import type {BoostID, StatID} from '@pkmn/data';

import {Distribution} from './distribution';
import {clamp, max} from './math';
import {Action, Slot, State} from './state';
import {DeepReadonly} from './utils';

const BOOST_ORDER: BoostID[] = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'];

const STAT_ORDER: StatID[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

const MAX_TOXIC_TURNS = 15;

type Conditions = DeepReadonly<{[id: string]: {level?: number}}>;

function conditionsKey(conditions: Conditions): string {
  const ids = Object.keys(conditions);
  if (ids.length === 0) return '';
  if (ids.length > 1) ids.sort();
  let key = '';
  for (let i = 0; i < ids.length; i++) {
    const level = conditions[ids[i]]?.level;
    key += (i ? ',' : '') + (level === undefined ? ids[i] : ids[i] + '=' + level);
  }
  return key;
}

function boostsKey(boosts: DeepReadonly<Partial<Record<BoostID, number>>>): string {
  let key = '';
  for (const boost of BOOST_ORDER) {
    const value = boosts[boost];
    if (!value) continue;
    key += (key ? ',' : '') + boost + '=' + clamp(-6, value, 6);
  }
  return key;
}

function spreadKey(values: DeepReadonly<Partial<Record<StatID, number>>> | undefined, fallback: number): string {
  let key = '';
  for (let i = 0; i < STAT_ORDER.length; i++) {
    key += (i ? '/' : '') + (values?.[STAT_ORDER[i]] ?? fallback);
  }
  return key;
}

function statusKey(pokemon: State.Pokemon): string {
  if (!pokemon.status) return '';
  if (pokemon.status !== 'tox') return pokemon.status;
  const turns = pokemon.statusState?.toxicTurns;
  return turns === undefined ? 'tox' : `tox=${clamp(0, turns, MAX_TOXIC_TURNS)}`;
}

interface MemoisedKey {
  gen: number;
  key: string;
}

const sideKeys = new WeakMap<object, MemoisedKey>();

export function pokemonKey(genNum: number, pokemon: State.Pokemon): string {
  return (
    pokemon.species.id +
    ';' + pokemon.level +
    ';' + pokemon.weighthg +
    ';' + (pokemon.item ?? '') +
    ';' + (pokemon.ability ?? '') +
    ';' + (pokemon.gender ?? '') +
    ';' + (pokemon.happiness ?? '') +
    ';' + statusKey(pokemon) +
    ';' + conditionsKey(pokemon.volatiles) +
    ';' + pokemon.types.join('/') +
    ';' + (pokemon.addedType ?? '') +
    ';' + (pokemon.teraType ?? '') +
    ';' + (pokemon.terastallized ? 'tera' : '') +
    ';' + max(0, pokemon.hp) +
    ';' + pokemon.maxhp +
    ';' + (pokemon.nature ?? '') +
    ';' + spreadKey(pokemon.evs, genNum <= 2 ? 252 : 0) +
    ';' + spreadKey(pokemon.ivs, 31) +
    ';' + (pokemon.stats ? spreadKey(pokemon.stats, 0) : '') +
    ';' + boostsKey(pokemon.boosts) +
    ';' + (pokemon.position ?? '') +
    ';' + (pokemon.switching ?? '') +
    ';' + (pokemon.moveLastTurnResult === undefined ? '' : String(pokemon.moveLastTurnResult)) +
    ';' + (pokemon.hurtThisTurn === undefined ? '' : String(pokemon.hurtThisTurn))
  );
}

function alliesKey(side: State.Side): string {
  if (!side.allies) return '';
  let key = '';
  for (let i = 0; i < side.allies.length; i++) {
    const ally = side.allies[i];
    key += (i ? ',' : '') + (ally ? `${ally.ability ?? ''}@${ally.position ?? ''}${ally.fainted ? '!' : ''}` : '-');
  }
  return key;
}

function teamKey(side: State.Side): string {
  if (!side.team) return '';
  let key = '';
  for (let i = 0; i < side.team.length; i++) {
    const mate = side.team[i];
    key += (i ? ',' : '') + `${mate.species.baseStats.atk}@${mate.position ?? ''}:${mate.status ?? ''}${mate.fainted ? '!' : ''}`;
  }
  return key;
}

export function sideKey(genNum: number, side: State.Side): string {
  const memoised = sideKeys.get(side);
  if (memoised !== undefined && memoised.gen === genNum) return memoised.key;
  let active = '';
  for (let i = 0; i < side.active.length; i++) {
    active += (i ? '&' : '') + pokemonKey(genNum, side.active[i]);
  }
  const key = active + '|' + conditionsKey(side.sideConditions) + '|' + alliesKey(side) + '|' + teamKey(side);
  sideKeys.set(side, {gen: genNum, key});
  return key;
}

export function fieldKey(field: State.Field): string {
  return (field.weather ?? '') + '|' + (field.terrain ?? '') + '|' + conditionsKey(field.pseudoWeather);
}

export function moveKey(move: State.Move): string {
  return (
    move.id +
    ';' + (move.branch ?? '') +
    ';' + move.basePower +
    ';' + move.type +
    ';' + (move.crit ? 'crit' : '') +
    ';' + (move.hits ?? '') +
    ';' + (move.magnitude ?? '') +
    ';' + (move.spread ? 'spread' : '') +
    ';' + (move.consecutive ?? '') +
    ';' + (move.useZ ? 'z' : '')
  );
}

function slotKey(slot: Slot): string {
  return slot.side + '.' + slot.active;
}

export function actionKey(action: Action): string {
  return slotKey(action.actor) + '>' + slotKey(action.target) + '>' + moveKey(action.move);
}

export function stateKey(state: State): string {
  const genNum = state.gen.num;
  let sides = '';
  for (let i = 0; i < state.sides.length; i++) {
    sides += (i ? '#' : '') + sideKey(genNum, state.sides[i]);
  }
  return genNum + '#' + state.gameType + '#' + sides + '#' + actionKey(state.action) + '#' + fieldKey(state.field);
}

export function stateDistribution(states?: State | State[]): Distribution<State> {
  return new Distribution<State>(states, stateKey);
}

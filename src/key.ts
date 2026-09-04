import type {BoostID, StatID} from '@pkmn/data';

import {Distribution} from './distribution';
import {clamp, max} from './math';
import {State} from './state';
import {DeepReadonly} from './utils';

const BOOST_ORDER: BoostID[] = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'];

const STAT_ORDER: StatID[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

const MAX_TOXIC_TURNS = 15;

type Conditions = DeepReadonly<{[id: string]: {level?: number}}>;

function conditionsKey(conditions: Conditions): string {
  const ids = Object.keys(conditions).sort();
  return ids
    .map(id => {
      const level = conditions[id]?.level;
      return level === undefined ? id : `${id}=${level}`;
    })
    .join(',');
}

function boostsKey(boosts: DeepReadonly<Partial<Record<BoostID, number>>>): string {
  const parts: string[] = [];
  for (const boost of BOOST_ORDER) {
    const value = boosts[boost];
    if (!value) continue;
    parts.push(`${boost}=${clamp(-6, value, 6)}`);
  }
  return parts.join(',');
}

function spreadKey(values: DeepReadonly<Partial<Record<StatID, number>>> | undefined, fallback: number): string {
  return STAT_ORDER.map(stat => String(values?.[stat] ?? fallback)).join('/');
}

function statusKey(pokemon: State.Pokemon): string {
  if (!pokemon.status) return '';
  if (pokemon.status !== 'tox') return pokemon.status;
  const turns = pokemon.statusState?.toxicTurns;
  return turns === undefined ? 'tox' : `tox=${clamp(0, turns, MAX_TOXIC_TURNS)}`;
}

export function pokemonKey(genNum: number, pokemon: State.Pokemon): string {
  const hp = max(0, pokemon.hp);
  return [
    pokemon.species.id,
    pokemon.level,
    pokemon.weighthg,
    pokemon.item ?? '',
    pokemon.ability ?? '',
    pokemon.gender ?? '',
    pokemon.happiness ?? '',
    statusKey(pokemon),
    conditionsKey(pokemon.volatiles),
    pokemon.types.join('/'),
    pokemon.addedType ?? '',
    pokemon.teraType ?? '',
    hp,
    pokemon.maxhp,
    pokemon.nature ?? '',
    spreadKey(pokemon.evs, genNum <= 2 ? 252 : 0),
    spreadKey(pokemon.ivs, 31),
    pokemon.stats ? spreadKey(pokemon.stats, 0) : '',
    boostsKey(pokemon.boosts),
    pokemon.position ?? '',
    pokemon.switching ?? '',
    pokemon.moveLastTurnResult === undefined ? '' : String(pokemon.moveLastTurnResult),
    pokemon.hurtThisTurn === undefined ? '' : String(pokemon.hurtThisTurn),
  ].join(';');
}

function activeKey(side: State.Side): string {
  if (!side.active) return '';
  return side.active.map(ally => (ally ? `${ally.ability ?? ''}@${ally.position ?? ''}${ally.fainted ? '!' : ''}` : '-')).join(',');
}

function teamKey(side: State.Side): string {
  if (!side.team) return '';
  return side.team.map(mate => `${mate.species.baseStats.atk}@${mate.position ?? ''}:${mate.status ?? ''}${mate.fainted ? '!' : ''}`).join(',');
}

export function sideKey(genNum: number, side: State.Side): string {
  return [pokemonKey(genNum, side.pokemon), conditionsKey(side.sideConditions), activeKey(side), teamKey(side)].join('|');
}

export function fieldKey(field: State.Field): string {
  return [field.weather ?? '', field.terrain ?? '', conditionsKey(field.pseudoWeather)].join('|');
}

export function moveKey(move: State.Move): string {
  return [
    move.id,
    move.basePower,
    move.type,
    move.crit ? 'crit' : '',
    move.hits ?? '',
    move.magnitude ?? '',
    move.spread ? 'spread' : '',
    move.consecutive ?? '',
    move.useZ ? 'z' : '',
  ].join(';');
}

export function stateKey(state: State): string {
  const genNum = state.gen.num;
  return [genNum, state.gameType, sideKey(genNum, state.p1), sideKey(genNum, state.p2), moveKey(state.move), fieldKey(state.field)].join('#');
}

export function stateDistribution(states?: State | State[]): Distribution<State> {
  return new Distribution<State>(states, stateKey);
}

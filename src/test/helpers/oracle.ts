import {Battle, Dex, PRNGSeed} from '@pkmn/sim';

import {State} from '../../state';
import {applySide, setField, setTeam, startBattle} from './verifier';

const SEED = `gen5,[0x09917, 0x06924, 0x0e1c8, 0x06af0]` as PRNGSeed;

export const ROLL_PERCENTS = Array.from({length: 16}, (_, i) => 85 + i);

const PERCENT_DENOMINATOR = 100;

export function critCalls(log: BranchLog): [number, number][] {
  return log.randomChanceCalls.filter(([, denominator]) => denominator !== PERCENT_DENOMINATOR);
}

interface ScriptedBattle {
  trunc(n: number, bits?: number): number;
  randomizer(baseDamage: number): number;
  randomChance(numerator: number, denominator: number): boolean;
  sample<T>(items: readonly T[]): T;
  random(from?: number, to?: number): number;
}

export interface BranchLog {
  randomizerCalls: number;
  randomChanceCalls: [number, number][];
  sampleSizes: number[];
  randomCalls: [number | undefined, number | undefined][];
}

export interface BranchResult extends BranchLog {
  damage: number;
}

export interface BranchOptions {
  crit?: boolean;
  forcedHits?: number;
  secondariesTrigger?: boolean;
}

export function simulateBranch(state: State, rollPercent: number, crit = false, forcedHits?: number, options: BranchOptions = {}): BranchResult {
  const gameType = state.gameType === 'singles' ? '' : state.gameType;
  const format = Dex.formats.get(`gen${state.gen.num}${gameType}customgame`);
  const battle = new Battle({format, formatid: format.id, seed: SEED});

  const scripted = battle as unknown as ScriptedBattle;
  scripted.trunc = Dex.trunc.bind(Dex);

  const log: BranchLog = {randomizerCalls: 0, randomChanceCalls: [], sampleSizes: [], randomCalls: []};

  const originalRandom = scripted.random.bind(battle);
  scripted.random = (from?: number, to?: number): number => {
    log.randomCalls.push([from, to]);
    if (options.secondariesTrigger !== undefined && from === PERCENT_DENOMINATOR && to === undefined) {
      return options.secondariesTrigger ? 0 : PERCENT_DENOMINATOR - 1;
    }
    return originalRandom(from, to);
  };

  const originalSample = scripted.sample.bind(battle);
  scripted.sample = <T,>(items: readonly T[]): T => {
    log.sampleSizes.push(items.length);
    if (forcedHits !== undefined && items.every(item => typeof item === 'number')) {
      return forcedHits as unknown as T;
    }
    return originalSample(items);
  };

  scripted.randomizer = (baseDamage: number) => {
    log.randomizerCalls++;
    const tr = scripted.trunc;
    return tr(tr(baseDamage * rollPercent) / 100);
  };
  scripted.randomChance = (numerator: number, denominator: number) => {
    log.randomChanceCalls.push([numerator, denominator]);
    return denominator === PERCENT_DENOMINATOR ? true : crit;
  };

  setTeam('p1', battle, state);
  setTeam('p2', battle, state);
  startBattle(battle);
  const players = {p1: applySide('p1', battle, state), p2: applySide('p2', battle, state)};
  setField(battle, state.field);

  const before = players.p2.pokemon.hp;
  battle.makeChoices(players.p1.choice, players.p2.choice);

  return {damage: moveDamage(battle, before), ...log};
}

function moveDamage(battle: Battle, startingHp: number): number {
  let hp = startingHp;
  for (const line of battle.log) {
    if (!line.startsWith('|-damage|p2a:') || line.includes('[from]')) continue;
    const reported = line.split('|')[3] ?? '';
    const value = reported.startsWith('0 fnt') ? 0 : Number(reported.split('/')[0]);
    if (!Number.isNaN(value)) hp = value;
  }
  return startingHp - hp;
}

export function simulateRolls(state: State, crit = false, forcedHits?: number, options: BranchOptions = {}): number[] {
  return ROLL_PERCENTS.map(percent => simulateBranch(state, percent, crit, forcedHits, options).damage);
}

export function simulateFinalState(state: State, rollPercent: number, options: BranchOptions = {}) {
  const gameType = state.gameType === 'singles' ? '' : state.gameType;
  const format = Dex.formats.get(`gen${state.gen.num}${gameType}customgame`);
  const battle = new Battle({format, formatid: format.id, seed: SEED});
  const scripted = battle as unknown as ScriptedBattle;
  scripted.trunc = Dex.trunc.bind(Dex);

  scripted.randomizer = (baseDamage: number) => {
    const tr = scripted.trunc;
    return tr(tr(baseDamage * rollPercent) / 100);
  };
  scripted.randomChance = (_numerator: number, denominator: number) => (denominator === PERCENT_DENOMINATOR ? true : !!options.crit);

  const originalRandom = scripted.random.bind(battle);
  scripted.random = (from?: number, to?: number): number => {
    if (options.secondariesTrigger !== undefined && from === PERCENT_DENOMINATOR && to === undefined) {
      return options.secondariesTrigger ? 0 : PERCENT_DENOMINATOR - 1;
    }
    return originalRandom(from, to);
  };

  setTeam('p1', battle, state);
  setTeam('p2', battle, state);
  startBattle(battle);
  const players = {p1: applySide('p1', battle, state), p2: applySide('p2', battle, state)};
  setField(battle, state.field);

  battle.makeChoices(players.p1.choice, players.p2.choice);

  return {
    status: players.p2.pokemon.status,
    boosts: {...players.p2.pokemon.boosts},
    attackerBoosts: {...players.p1.pokemon.boosts},
    hp: players.p2.pokemon.hp,
  };
}

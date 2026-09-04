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
}

export interface BranchLog {
  randomizerCalls: number;
  randomChanceCalls: [number, number][];
  sampleSizes: number[];
}

export interface BranchResult extends BranchLog {
  damage: number;
}

export function simulateBranch(state: State, rollPercent: number, crit = false, forcedHits?: number): BranchResult {
  const gameType = state.gameType === 'singles' ? '' : state.gameType;
  const format = Dex.formats.get(`gen${state.gen.num}${gameType}customgame`);
  const battle = new Battle({format, formatid: format.id, seed: SEED});

  const scripted = battle as unknown as ScriptedBattle;
  scripted.trunc = Dex.trunc.bind(Dex);

  const log: BranchLog = {randomizerCalls: 0, randomChanceCalls: [], sampleSizes: []};

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
  const after = players.p2.pokemon.hp;

  return {damage: before - after, ...log};
}

export function simulateRolls(state: State, crit = false, forcedHits?: number): number[] {
  return ROLL_PERCENTS.map(percent => simulateBranch(state, percent, crit, forcedHits).damage);
}

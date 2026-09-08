import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {calculateDamage} from '../mechanics';
import {UnsupportedMoveError, labelCounts, moveDataBranches, resolveMove} from '../resolve';
import {State} from '../state';
import {simulateRolls} from './helpers/oracle';

const gens = new Generations(Dex as any);
const gen = gens.get(9);

function build(moveName: string, options: {hp?: number; ability?: string; defender?: string} = {}): State {
  const attacker = State.createPokemon(gen, 'Miraidon', {nature: 'Modest', evs: {spa: 252}, ability: options.ability as never});
  const target = State.createPokemon(gen, options.defender ?? 'Blissey', {evs: {hp: 252, spd: 252}});
  if (options.hp !== undefined) target.hp = options.hp;
  return State.oneOnOne(gen, attacker, target, State.createMove(gen, moveName), State.createField(gen, {}));
}

function branchMarginal(state: State): {[label: string]: number} {
  const distribution = resolveMove(state);
  const total = distribution.totalOutcomes;
  const counts = labelCounts(distribution, 'branch');
  const marginal: {[label: string]: number} = {};
  for (const label of Object.keys(counts)) marginal[label] = counts[label] / total;
  return marginal;
}

function damagesFor(state: State, branch?: string): number[] {
  const move = {...state.move, branch, crit: false};
  const branched = State.oneOnOne(state.gen, state.sides[0], state.sides[1], move, state.field, state.gameType);
  return calculateDamage(branched) as number[];
}

function reasonsFor(state: State): string[] {
  try {
    resolveMove(state);
    return [];
  } catch (error) {
    if (!(error instanceof UnsupportedMoveError)) throw error;
    return error.reasons;
  }
}

describe('move-data branches', () => {
  test('an ordinary move declares none, and gains no branch axis', () => {
    expect(moveDataBranches(build('Aura Sphere').move)).toEqual([{label: '', weight: 1}]);
    expect(branchMarginal(build('Aura Sphere'))).toEqual({});
  });

  test('Fickle Beam splits exactly 70/30', () => {
    expect(branchMarginal(build('Fickle Beam'))).toEqual({normal: 0.7, allOut: 0.3});
  });

  test('the split survives the target dying, and the answer collapses to one outcome', () => {
    const distribution = resolveMove(build('Fickle Beam', {hp: 1}));

    expect(distribution.size()).toBe(1);
    expect(distribution.outcomes[0].data.target.hp).toBe(0);
    expect(branchMarginal(build('Fickle Beam', {hp: 1}))).toEqual({normal: 0.7, allOut: 0.3});
  });

  test('the resulting state carries the original move, not the branch', () => {
    for (const outcome of resolveMove(build('Fickle Beam')).outcomes) {
      expect(outcome.data.move.branch).toBeUndefined();
      expect(outcome.data.move.basePower).toBe(80);
    }
  });

  test('both lobes appear in the damage distribution', () => {
    const state = build('Fickle Beam');
    const normal = damagesFor(state, 'normal');
    const allOut = damagesFor(state, 'allOut');

    expect(Math.min(...allOut)).toBeGreaterThan(Math.max(...normal));

    const damages = new Set(resolveMove(state).outcomes.map(o => state.target.hp - o.data.target.hp));
    for (const damage of [...normal, ...allOut]) expect(damages.has(damage)).toBe(true);
  });

  test('each lobe matches what the sim does when that branch is forced', () => {
    const state = build('Fickle Beam');

    expect(damagesFor(state, 'normal')).toEqual(simulateRolls(state, false, undefined, {dataBranch: false}));
    expect(damagesFor(state, 'allOut')).toEqual(simulateRolls(state, false, undefined, {dataBranch: true}));
  });

  test('mass stays exact across the added axis', () => {
    const distribution = resolveMove(build('Fickle Beam'));
    expect(distribution.exact).toBe(true);
    distribution.assertExact();
  });

  test('Parental Bond makes it multi-hit, which the axis refuses rather than approximates', () => {
    expect(reasonsFor(build('Fickle Beam', {ability: 'Parental Bond'}))).toContain('move-data branches on a multi-hit move');
  });
});

describe('moves whose data still branches unenumerated', () => {
  test('Present declares all four branches', () => {
    expect(moveDataBranches(build('Present').move).map(branch => [branch.label, branch.weight])).toEqual([
      ['heal', 2],
      ['40', 4],
      ['80', 3],
      ['120', 1],
    ]);
  });

  test('Present is refused for the heal branch, not for being unenumerated', () => {
    const reasons = reasonsFor(build('Present'));
    expect(reasons).toContain('target healing');
    expect(reasons).not.toContain('random move-data branches that are not enumerated');
  });

  test('Shell Side Arm is still refused outright', () => {
    expect(reasonsFor(build('Shell Side Arm'))).toContain('random move-data branches that are not enumerated');
  });
});

import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {State} from '../state';
import {critCounts, resolveMove} from '../resolve';

const gens = new Generations(Dex as any);
const gen = gens.get(9);

const HIT_WEIGHTS: [number, number][] = [
  [2, 7],
  [3, 7],
  [4, 3],
  [5, 3],
];
const HIT_WEIGHT_TOTAL = 20;
const CRIT = 1 / 24;
const NO_CRIT = 23 / 24;
const MAX_HITS = 5;

function build(attackerName: string, moveName: string, evs: Partial<Record<'atk' | 'spa', number>>, defenderHp?: number) {
  const attacker = State.createPokemon(gen, attackerName, {evs});
  const defender = State.createPokemon(gen, 'Blissey', {evs: {hp: 252}});
  if (defenderHp !== undefined) defender.hp = defenderHp;
  return State.oneOnOne(gen, attacker, defender, State.createMove(gen, moveName), State.createField(gen, {}));
}

function marginal(dist: ReturnType<typeof resolveMove>): number[] {
  const counts = critCounts(dist);
  const total = dist.totalOutcomes;
  const probabilities: number[] = [];
  for (let crits = 0; crits <= MAX_HITS; crits++) probabilities.push((counts[crits] ?? 0) / total);
  return probabilities;
}

function knockoutChance(dist: ReturnType<typeof resolveMove>): number {
  const total = dist.totalOutcomes;
  return dist.outcomes.filter(o => o.data.target.hp <= 0).reduce((sum, o) => sum + o.count, 0) / total;
}

function choose(n: number, k: number): number {
  let result = 1;
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return result;
}

function binomialMixture(accuracy: number): number[] {
  const probabilities: number[] = [];
  for (let crits = 0; crits <= MAX_HITS; crits++) {
    let landed = 0;
    for (const [hits, weight] of HIT_WEIGHTS) {
      if (crits > hits) continue;
      landed += (weight / HIT_WEIGHT_TOTAL) * choose(hits, crits) * CRIT ** crits * NO_CRIT ** (hits - crits);
    }
    probabilities.push(accuracy * landed + (crits === 0 ? 1 - accuracy : 0));
  }
  return probabilities;
}

describe('crit counts', () => {
  test('a single-hit move splits 23:1', () => {
    expect(marginal(resolveMove(build('Lucario', 'Aura Sphere', {spa: 252})))).toEqual([23 / 24, 1 / 24, 0, 0, 0, 0]);
  });

  test('a 2-5 hit move that cannot knock out matches the binomial mixture', () => {
    const dist = resolveMove(build('Cloyster', 'Rock Blast', {atk: 252}));
    const expected = binomialMixture(0.9);

    expect(knockoutChance(dist)).toBeLessThan(1e-5);
    marginal(dist).forEach((probability, crits) => expect(probability).toBeCloseTo(expected[crits], 12));
  });

  test('hits that never happen cannot crit', () => {
    const dist = resolveMove(build('Cloyster', 'Icicle Spear', {atk: 252}));
    const probabilities = marginal(dist);
    const expected = binomialMixture(1);

    expect(knockoutChance(dist)).toBeGreaterThan(0.1);
    expect(probabilities[0]).toBeCloseTo(expected[0], 12);
    expect(probabilities[MAX_HITS]).toBe(0);
    expect(probabilities[1]).toBeGreaterThan(expected[1]);
    expect(probabilities[3] + probabilities[4]).toBeLessThan(expected[3] + expected[4]);
  });

  test('every outcome accounts for its own count', () => {
    for (const [attacker, move, evs] of [
      ['Lucario', 'Aura Sphere', {spa: 252}],
      ['Cloyster', 'Icicle Spear', {atk: 252}],
    ] as const) {
      const dist = resolveMove(build(attacker, move, evs));
      for (const outcome of dist.outcomes) {
        const summed = Object.values(outcome.labels!.crits).reduce((sum, count) => sum + count, 0);
        expect(summed).toBeCloseTo(outcome.count, 6);
      }
    }
  });

  test('the marginal sums to one', () => {
    const summed = marginal(resolveMove(build('Cloyster', 'Rock Blast', {atk: 252}))).reduce((sum, p) => sum + p, 0);
    expect(summed).toBeCloseTo(1, 12);
  });

  test('an irrelevant crit still collapses to a single outcome', () => {
    const dist = resolveMove(build('Lucario', 'Aura Sphere', {spa: 252}, 1));

    expect(dist.size()).toBe(1);
    expect(dist.outcomes[0].data.target.hp).toBe(0);
    expect(dist.outcomes[0].labels!.crits).toEqual({0: 23, 1: 1});
  });
});

import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {calculateDamage} from '../mechanics';
import {State} from '../state';
import {accuracyBranches, hitCountBranches, resolveMove} from '../resolve';
import {ROLL_PERCENTS, simulateBranch, simulateRolls} from './helpers/oracle';

const gens = new Generations(Dex as any);
const gen = gens.get(9);

function build(moveName: string, options: {ability?: string; item?: string; defenderHp?: number} = {}) {
  const attacker = State.createPokemon(gen, 'Cloyster', {ability: options.ability, item: options.item});
  const defender = State.createPokemon(gen, 'Blissey', {evs: {hp: 252}});
  if (options.defenderHp !== undefined) defender.hp = options.defenderHp;
  return State.oneOnOne(gen, attacker, defender, State.createMove(gen, moveName), State.createField(gen, {}));
}

function sumsToOne(dist: ReturnType<typeof resolveMove>) {
  const total = dist.totalOutcomes;
  return dist.outcomes.reduce((sum, o) => sum + o.count / total, 0);
}

describe('hitCountBranches', () => {
  test('reproduces the 35/35/15/15 spread sim samples for 2-5 hit moves', () => {
    const move = State.createMove(gen, 'Rock Blast');
    expect(hitCountBranches(9, move)).toEqual([
      {hits: 2, weight: 7},
      {hits: 3, weight: 7},
      {hits: 4, weight: 3},
      {hits: 5, weight: 3},
    ]);
  });

  test('uses the older 3/3/1/1 spread before gen 5', () => {
    const move = State.createMove(gen, 'Rock Blast');
    expect(hitCountBranches(4, move)).toEqual([
      {hits: 2, weight: 3},
      {hits: 3, weight: 3},
      {hits: 4, weight: 1},
      {hits: 5, weight: 1},
    ]);
  });

  test('Skill Link and Grip Claw pin the count to the maximum', () => {
    const move = State.createMove(gen, 'Rock Blast');
    const skillLink = State.createPokemon(gen, 'Cloyster', {ability: 'Skill Link'});
    const gripClaw = State.createPokemon(gen, 'Cloyster', {item: 'Grip Claw'});

    expect(hitCountBranches(9, move, skillLink)).toEqual([{hits: 5, weight: 1}]);
    expect(hitCountBranches(9, move, gripClaw)).toEqual([{hits: 5, weight: 1}]);
  });

  test('a fixed-count multi-hit move has a single branch', () => {
    expect(hitCountBranches(9, State.createMove(gen, 'Double Kick'))).toEqual([{hits: 2, weight: 1}]);
  });

  test('a single-hit move has a single branch', () => {
    expect(hitCountBranches(9, State.createMove(gen, 'Aura Sphere'))).toEqual([{hits: 1, weight: 1}]);
  });
});

describe('accuracyBranches', () => {
  test('a never-miss move has one branch', () => {
    expect(accuracyBranches(State.createMove(gen, 'Aura Sphere'))).toEqual([{lands: true, weight: 1}]);
  });

  test('a perfectly accurate move has one branch', () => {
    expect(accuracyBranches(State.createMove(gen, 'Earthquake'))).toEqual([{lands: true, weight: 1}]);
  });

  test('a 90 percent move reduces to nine in ten rather than ninety in a hundred', () => {
    expect(accuracyBranches(State.createMove(gen, 'Rock Blast'))).toEqual([
      {lands: true, weight: 9},
      {lands: false, weight: 1},
    ]);
  });

  test('a forced miss is a single branch, never a zero-weight one', () => {
    const move = {...State.createMove(gen, 'Rock Blast'), accuracy: 0 as unknown as number};
    expect(accuracyBranches(move)).toEqual([{lands: false, weight: 1}]);
  });

  test('a forced miss resolves to the untouched state at certainty', () => {
    const base = build('Rock Blast');
    const state = State.oneOnOne(gen, base.sides[0], base.sides[1], {...base.move, accuracy: 0}, base.field);

    const dist = resolveMove(state);

    expect(dist.size()).toBe(1);
    expect(dist.outcomes[0].data.target.hp).toBe(base.target.hp);
    expect(sumsToOne(dist)).toBeCloseTo(1, 12);
  });
});

describe('resolveMove with variable hit counts', () => {
  test('Rock Blast resolves and its probabilities sum to one', () => {
    expect(sumsToOne(resolveMove(build('Rock Blast')))).toBeCloseTo(1, 12);
  });

  test('the miss branch keeps the target untouched at exactly one in ten', () => {
    const state = build('Rock Blast');
    const dist = resolveMove(state);

    const untouched = dist.outcomes.filter(o => o.data.target.hp === state.target.hp);
    const missMass = untouched.reduce((sum, o) => sum + o.count, 0) / dist.totalOutcomes;

    expect(missMass).toBeCloseTo(1 / 10, 12);
  });

  test('Skill Link removes the hit-count branching entirely', () => {
    const dist = resolveMove(build('Rock Blast', {ability: 'Skill Link'}));
    expect(sumsToOne(dist)).toBeCloseTo(1, 12);
  });

  test('a target that faints early absorbs the remaining hits', () => {
    const dist = resolveMove(build('Rock Blast', {ability: 'Skill Link', defenderHp: 12}));

    const fainted = dist.outcomes.filter(o => o.data.target.hp === 0);
    const faintMass = fainted.reduce((sum, o) => sum + o.count, 0) / dist.totalOutcomes;

    expect(faintMass).toBeCloseTo(9 / 10, 12);
    expect(fainted).toHaveLength(1);
  });
});

describe('multi-hit against the oracle', () => {
  test('Skill Link takes five hits with no hit-count sample at all', () => {
    const branch = simulateBranch(build('Rock Blast', {ability: 'Skill Link'}), 100);
    expect(branch.sampleSizes).toHaveLength(0);
    expect(branch.randomizerCalls).toBe(5);
  });

  test('Skill Link damage is exactly five times the single-hit roll', () => {
    const state = build('Rock Blast', {ability: 'Skill Link'});
    const perHit = calculateDamage(state) as number[];
    const totals = simulateRolls(state);

    ROLL_PERCENTS.forEach((_, i) => {
      expect(totals[i]).toBe(perHit[i] * 5);
    });
  });

  test('a forced three-hit Rock Blast is exactly three times the single-hit roll', () => {
    const state = build('Rock Blast');
    const perHit = calculateDamage(state) as number[];
    const totals = simulateRolls(state, false, 3);

    ROLL_PERCENTS.forEach((_, i) => {
      expect(totals[i]).toBe(perHit[i] * 3);
    });
  });

  test('sim samples the hit count from the twenty-entry table dmg mirrors', () => {
    const branch = simulateBranch(build('Rock Blast'), 100);
    expect(branch.sampleSizes).toEqual([20]);
  });

  test('resolveMove produces the totals sim produces for a pinned hit count', () => {
    const state = build('Rock Blast', {ability: 'Skill Link'});
    const startingHp = state.target.hp;

    const simTotals = new Set(simulateRolls(state));
    const resolved = new Set(resolveMove(state).outcomes.map(o => startingHp - o.data.target.hp));

    for (const total of simTotals) {
      expect(resolved.has(total)).toBe(true);
    }
  });
});

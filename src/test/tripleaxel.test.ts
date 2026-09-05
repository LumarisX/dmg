import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {NumberDistribution} from '../distribution';
import {calculateDamage} from '../mechanics';
import {State} from '../state';
import {resolveMove} from '../resolve';
import {ROLL_PERCENTS, simulateBranch, simulateRolls} from './helpers/oracle';

const gens = new Generations(Dex as any);
const gen = gens.get(9);

function build(moveName = 'Triple Axel', defenderHp?: number) {
  const attacker = State.createPokemon(gen, 'Sneasler', {evs: {atk: 252}});
  const defender = State.createPokemon(gen, 'Blissey', {evs: {hp: 252}});
  if (defenderHp !== undefined) defender.hp = defenderHp;
  return State.oneOnOne(gen, attacker, defender, State.createMove(gen, moveName), State.createField(gen, {}));
}

function hitDamage(state: State, hitNumber: number, crit = false): number[] {
  const move: State.Move = {...state.move, hit: hitNumber, crit};
  return calculateDamage(State.oneOnOne(state.gen, state.sides[0], state.sides[1], move, state.field, state.gameType)) as number[];
}

function sumsToOne(dist: ReturnType<typeof resolveMove>) {
  const total = dist.totalOutcomes;
  return dist.outcomes.reduce((sum, o) => sum + o.count / total, 0);
}

describe('escalating base power', () => {
  test('base power climbs 20/40/60 across the three hits', () => {
    const state = build();
    expect(hitDamage(state, 2)[0]).toBeGreaterThan(hitDamage(state, 1)[0]);
    expect(hitDamage(state, 3)[0]).toBeGreaterThan(hitDamage(state, 2)[0]);
  });

  test('each hit matches sim when the whole sequence lands', () => {
    const state = build();
    const totals = simulateRolls(state);

    ROLL_PERCENTS.forEach((_, i) => {
      const expected = hitDamage(state, 1)[i] + hitDamage(state, 2)[i] + hitDamage(state, 3)[i];
      expect(totals[i]).toBe(expected);
    });
  });

  test('sim takes a separate accuracy roll for every hit', () => {
    const branch = simulateBranch(build(), 100);
    const accuracyRolls = branch.randomChanceCalls.filter(([, d]) => d === 100);

    expect(accuracyRolls).toEqual([
      [90, 100],
      [90, 100],
      [90, 100],
    ]);
    expect(branch.randomizerCalls).toBe(3);
  });
});

describe('per-hit accuracy and early termination', () => {
  test('probabilities still sum to one', () => {
    expect(sumsToOne(resolveMove(build()))).toBeCloseTo(1, 12);
  });

  test('a completely untouched target happens exactly one tenth of the time', () => {
    const state = build();
    const dist = resolveMove(state);

    const untouched = dist.outcomes.filter(o => o.data.target.hp === state.target.hp);
    const mass = untouched.reduce((sum, o) => sum + o.count, 0) / dist.totalOutcomes;

    expect(mass).toBeCloseTo(1 / 10, 12);
  });

  test('stopping after exactly one hit has the probability of hit-then-miss', () => {
    const state = build();
    const dist = resolveMove(state);
    const startingHp = state.target.hp;

    const oneHitOnly = new Set([...hitDamage(state, 1), ...hitDamage(state, 1, true)]);
    const mass = dist.outcomes
      .filter(o => oneHitOnly.has(startingHp - o.data.target.hp))
      .reduce((sum, o) => sum + o.count, 0);

    expect(mass / dist.totalOutcomes).toBeCloseTo((9 / 10) * (1 / 10), 12);
  });

  test('convolution cannot express this, so it must differ from the naive product', () => {
    const state = build();
    const naive = NumberDistribution.chain(
      new NumberDistribution(hitDamage(state, 1)),
      new NumberDistribution(hitDamage(state, 2)),
      new NumberDistribution(hitDamage(state, 3))
    );
    const startingHp = state.target.hp;
    const resolved = resolveMove(state);

    const naiveDamages = new Set(naive.outcomes.map(o => o.data));
    const resolvedDamages = new Set(resolved.outcomes.map(o => startingHp - o.data.target.hp));

    expect(naiveDamages.has(0)).toBe(false);
    expect(resolvedDamages.has(0)).toBe(true);
  });
});

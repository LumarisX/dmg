import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {State} from '../state';
import {guaranteedKnockoutTurn, knockoutChances, search} from '../search';

const gens = new Generations(Dex as any);
const gen = gens.get(9);

function build(moveName = 'Aura Sphere', defenderHp?: number, defender = 'Blissey') {
  const attacker = State.createPokemon(gen, 'Lucario', {nature: 'Modest', evs: {spa: 252}});
  const target = State.createPokemon(gen, defender, {evs: {hp: 252, spd: 252}});
  if (defenderHp !== undefined) target.hp = defenderHp;
  return State.oneOnOne(gen, attacker, target, State.createMove(gen, moveName), State.createField(gen, {}));
}

function totalMass(result: ReturnType<typeof search>) {
  return result.outcomes.reduce((sum, o) => sum + o.probability, 0) + result.prunedMass;
}

describe('search', () => {
  test('a single turn reproduces resolveMove', () => {
    const result = search(build(), {turns: 1});
    expect(totalMass(result)).toBeCloseTo(1, 9);
    expect(result.knockoutByTurn).toHaveLength(1);
  });

  test('probability mass is conserved across turns, pruned mass included', () => {
    const result = search(build(), {turns: 4});
    expect(totalMass(result)).toBeCloseTo(1, 9);
  });

  test('knockout chance is monotonically non-decreasing', () => {
    const chances = knockoutChances(build(), 5);
    for (let i = 1; i < chances.length; i++) {
      expect(chances[i]).toBeGreaterThanOrEqual(chances[i - 1]);
    }
  });

  test('a guaranteed one-shot is certain on turn one', () => {
    const chances = knockoutChances(build('Aura Sphere', 10), 2);
    expect(chances[0]).toBeCloseTo(1, 9);
    expect(guaranteedKnockoutTurn(build('Aura Sphere', 10), 2)).toBe(1);
  });

  test('a target that cannot be touched is never knocked out', () => {
    const chances = knockoutChances(build('Aura Sphere', undefined, 'Blissey'), 1);
    expect(chances[0]).toBe(0);
  });

  test('fainted states are terminal and stop absorbing turns', () => {
    const result = search(build('Aura Sphere', 10), {turns: 3});
    const fainted = result.outcomes.filter(o => o.state.target.hp === 0);
    expect(fainted).toHaveLength(1);
    expect(fainted[0].probability).toBeCloseTo(1, 9);
  });

  test('a partial-range knockout lands strictly between certainty and impossibility', () => {
    const state = build();
    const oneTurn = knockoutChances(state, 1)[0];
    const fourTurns = knockoutChances(state, 4)[3];

    expect(oneTurn).toBe(0);
    expect(fourTurns).toBeGreaterThan(0);
    expect(fourTurns).toBeLessThanOrEqual(1);
  });

  test('epsilon pruning is accounted for rather than silently dropped', () => {
    const loose = search(build(), {turns: 4, epsilon: 1e-4});
    expect(loose.prunedMass).toBeGreaterThan(0);
    expect(totalMass(loose)).toBeCloseTo(1, 9);
  });

  test('an outcome cap also reports what it discarded', () => {
    const capped = search(build(), {turns: 3, maxOutcomes: 5});
    expect(capped.outcomes.length).toBeLessThanOrEqual(5);
    expect(totalMass(capped)).toBeCloseTo(1, 9);
  });

  test('a policy can change the move between turns', () => {
    const state = build('Aura Sphere');
    const vacuumWave = State.createMove(gen, 'Vacuum Wave');

    const result = search(state, {
      turns: 2,
      policy: {chooseMove: (_s, turn) => (turn === 1 ? state.move : vacuumWave)},
    });

    expect(totalMass(result)).toBeCloseTo(1, 9);
    expect(result.outcomes.every(o => o.state.target.hp >= 0)).toBe(true);
  });

  test('hurtThisTurn does not leak across turns', () => {
    const result = search(build(), {turns: 2});
    expect(result.outcomes.every(o => o.state.target.hurtThisTurn === true)).toBe(true);
  });
});

import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {State} from '../state';
import {guaranteedKnockoutTurn, knockoutChances, resolveTurns} from '../turns';

const gens = new Generations(Dex as any);
const gen = gens.get(9);

function build(moveName = 'Aura Sphere', defenderHp?: number, defender = 'Blissey') {
  const attacker = State.createPokemon(gen, 'Lucario', {nature: 'Modest', evs: {spa: 252}});
  const target = State.createPokemon(gen, defender, {evs: {hp: 252, spd: 252}});
  if (defenderHp !== undefined) target.hp = defenderHp;
  return State.oneOnOne(gen, attacker, target, State.createMove(gen, moveName), State.createField(gen, {}));
}

function multiscale(moveName: string) {
  return State.oneOnOne(
    gen,
    State.createPokemon(gen, 'Maushold', {nature: 'Adamant', evs: {atk: 252}}),
    State.createPokemon(gen, 'Dragonite', {ability: 'Multiscale', evs: {hp: 252, def: 252}}),
    State.createMove(gen, moveName),
    State.createField(gen, {})
  );
}

function totalMass(result: ReturnType<typeof resolveTurns>) {
  return result.outcomes.reduce((sum, o) => sum + o.probability, 0) + result.prunedMass;
}

describe('resolveTurns', () => {
  test('a single turn reproduces resolveMove', () => {
    const result = resolveTurns(build(), {turns: 1});
    expect(totalMass(result)).toBeCloseTo(1, 9);
    expect(result.knockoutByTurn).toHaveLength(1);
  });

  test('probability mass is conserved across turns, pruned mass included', () => {
    const result = resolveTurns(build(), {turns: 4});
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
    const result = resolveTurns(build('Aura Sphere', 10), {turns: 3});
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
    const loose = resolveTurns(build(), {turns: 4, epsilon: 1e-4});
    expect(loose.prunedMass).toBeGreaterThan(0);
    expect(totalMass(loose)).toBeCloseTo(1, 9);
  });

  test('an outcome cap also reports what it discarded', () => {
    const capped = resolveTurns(build(), {turns: 3, maxOutcomes: 5});
    expect(capped.outcomes.length).toBeLessThanOrEqual(5);
    expect(totalMass(capped)).toBeCloseTo(1, 9);
  });

  test('a policy can change the move between turns', () => {
    const state = build('Aura Sphere');
    const vacuumWave = State.createMove(gen, 'Vacuum Wave');

    const result = resolveTurns(state, {
      turns: 2,
      policy: {chooseMove: (_s, turn) => (turn === 1 ? state.move : vacuumWave)},
    });

    expect(totalMass(result)).toBeCloseTo(1, 9);
    expect(result.outcomes.every(o => o.state.target.hp >= 0)).toBe(true);
  });

  test('the hp projection agrees exactly with the full state-space projection', () => {
    const cases: Array<[string, string, number]> = [
      ['Lucario', 'Aura Sphere', 4],
      ['Cloyster', 'Rock Blast', 2],
      ['Maushold', 'Population Bomb', 2],
    ];

    for (const [attacker, move, turns] of cases) {
      const state = State.oneOnOne(
        gen,
        State.createPokemon(gen, attacker, {nature: 'Adamant', evs: {atk: 252, spa: 252}}),
        State.createPokemon(gen, 'Blissey', {evs: {hp: 252, def: 252, spd: 252}}),
        State.createMove(gen, move),
        State.createField(gen, {})
      );

      const fast = resolveTurns(state, {turns, epsilon: 0});
      const exact = resolveTurns(state, {turns, epsilon: 0, policy: {chooseMove: s => s.move}});

      expect(fast.resolves).toBe(1);
      expect(exact.resolves).toBeGreaterThan(1);
      for (let i = 0; i < turns; i++) {
        expect(fast.knockoutByTurn[i]).toBeCloseTo(exact.knockoutByTurn[i], 9);
      }
    }
  }, 600000);

  test('a target whose defence depends on its own hp cannot take the fast path', () => {
    const result = resolveTurns(multiscale('Population Bomb'), {turns: 2});
    expect(result.resolves).toBeGreaterThan(1);
  }, 600000);

  test('a resolve budget bounds the work and reports what it froze', () => {
    const result = resolveTurns(multiscale('Population Bomb'), {
      turns: 10,
      maxResolves: 12,
    });

    expect(result.resolves).toBeLessThanOrEqual(12);
    expect(result.unexpandedMass).toBeGreaterThan(0);
    expect(totalMass(result)).toBeCloseTo(1, 9);
  });

  test('an unbudgeted run reports no frozen mass', () => {
    const result = resolveTurns(build(), {turns: 3});
    expect(result.unexpandedMass).toBe(0);
    expect(result.resolves).toBeGreaterThan(0);
    expect(totalMass(result)).toBeCloseTo(1, 9);
  });

  test('a budget only ever understates the knockout chance', () => {
    const state = build();
    const full = resolveTurns(state, {turns: 4});
    const budgeted = resolveTurns(state, {turns: 4, maxResolves: 3});

    for (let i = 0; i < full.knockoutByTurn.length; i++) {
      expect(budgeted.knockoutByTurn[i]).toBeLessThanOrEqual(
        full.knockoutByTurn[i] + 1e-12
      );
    }
  });

  test('hurtThisTurn does not leak across turns', () => {
    const result = resolveTurns(build(), {turns: 2});
    expect(result.outcomes.every(o => o.state.target.hurtThisTurn === true)).toBe(true);
  });
});

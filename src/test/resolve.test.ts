import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {stateKey} from '../key';
import {calculateDamage} from '../mechanics';
import {State} from '../state';
import {UnsupportedMoveError, critDenominator, resolveMove} from '../resolve';

const gens = new Generations(Dex as any);
const gen = gens.get(9);

function build(moveName = 'Aura Sphere', defenderHp?: number) {
  const attacker = State.createPokemon(gen, 'Lucario', {nature: 'Modest', evs: {spa: 252}});
  const defender = State.createPokemon(gen, 'Blissey', {evs: {hp: 252, spd: 252}});
  if (defenderHp !== undefined) defender.hp = defenderHp;
  return State.oneOnOne(gen, attacker, defender, State.createMove(gen, moveName), State.createField(gen, {}));
}

function totalProbability(dist: ReturnType<typeof resolveMove>) {
  const total = dist.totalOutcomes;
  return dist.outcomes.reduce((sum, o) => sum + o.count / total, 0);
}

describe('critDenominator', () => {
  test('matches the generation tables sim uses', () => {
    expect(critDenominator(9, 1)).toBe(24);
    expect(critDenominator(9, 2)).toBe(8);
    expect(critDenominator(9, 3)).toBe(2);
    expect(critDenominator(9, 4)).toBe(1);
    expect(critDenominator(6, 1)).toBe(16);
    expect(critDenominator(5, 1)).toBe(16);
    expect(critDenominator(5, 5)).toBe(2);
  });

  test('a crit ratio of zero means no crit roll at all', () => {
    expect(critDenominator(9, 0)).toBeUndefined();
  });

  test('clamps out-of-range crit ratios rather than reading past the table', () => {
    expect(critDenominator(9, 99)).toBe(1);
    expect(critDenominator(5, 99)).toBe(2);
  });
});

describe('resolveMove', () => {
  test('probabilities always sum to one', () => {
    expect(totalProbability(resolveMove(build()))).toBeCloseTo(1, 12);
    expect(totalProbability(resolveMove(build('Aura Sphere', 10)))).toBeCloseTo(1, 12);
  });

  test('a healthy target keeps sixteen rolls times the crit branches', () => {
    const dist = resolveMove(build());
    expect(dist.totalOutcomes).toBe(16 * 24);
    expect(dist.size()).toBeGreaterThan(1);
  });

  test('overkill collapses to a single certain outcome', () => {
    const dist = resolveMove(build('Aura Sphere', 10));

    expect(dist.size()).toBe(1);
    expect(dist.outcomes[0].data.target.hp).toBe(0);
    expect(dist.probabilityOf(dist.outcomes[0].data)).toBe(1);
  });

  test('the crit branch carries exactly one twenty-fourth of the mass', () => {
    const state = build();
    const startingHp = state.target.hp;
    const nonCritDamage = calculateDamage(state) as number[];
    const lowestNonCritHp = startingHp - Math.max(...nonCritDamage);

    const dist = resolveMove(state);
    const critOutcomes = dist.outcomes.filter(o => o.data.target.hp < lowestNonCritHp);
    const critWeight = critOutcomes.reduce((sum, o) => sum + o.count, 0);

    expect(critWeight).toBe(16);
    expect(dist.totalOutcomes).toBe(16 * 24);
    expect(critWeight / dist.totalOutcomes).toBeCloseTo(1 / 24, 12);
  });

  test('outcome states never carry the crit flag that produced them', () => {
    const dist = resolveMove(build());
    for (const outcome of dist.outcomes) {
      expect(outcome.data.move.crit).toBeFalsy();
    }
  });

  test('damage marks the target as hurt this turn', () => {
    const dist = resolveMove(build());
    for (const outcome of dist.outcomes) {
      expect(outcome.data.target.hurtThisTurn).toBe(true);
    }
  });

  test('does not mutate the input state', () => {
    const state = build();
    const before = stateKey(state);

    resolveMove(state);

    expect(stateKey(state)).toBe(before);
    expect(state.move.crit).toBeFalsy();
  });

  test('rejects moves outside the supported class rather than guessing', () => {
    expect(() => resolveMove(build('Close Combat'))).toThrow(UnsupportedMoveError);
    expect(() => resolveMove(build('Brave Bird'))).toThrow(UnsupportedMoveError);
    expect(() => resolveMove(build('Draining Kiss'))).toThrow(UnsupportedMoveError);
  });

  test('the rejection says which properties are unsupported', () => {
    try {
      resolveMove(build('Brave Bird'));
      throw new Error('expected resolveMove to reject Brave Bird');
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedMoveError);
      expect((err as UnsupportedMoveError).reasons).toContain('recoil');
    }
  });

  test('multi-hit and secondaries are no longer rejection reasons', () => {
    expect(() => resolveMove(build('Rock Blast'))).not.toThrow();
    expect(() => resolveMove(build('Flamethrower'))).not.toThrow();
  });
});

function versus(options: Parameters<typeof State.createPokemon>[2], attackerOptions: Parameters<typeof State.createPokemon>[2] = {}) {
  const attacker = State.createPokemon(gen, 'Lucario', {nature: 'Modest', evs: {spa: 252}, ...attackerOptions});
  const defender = State.createPokemon(gen, 'Geodude', options);
  return State.oneOnOne(gen, attacker, defender, State.createMove(gen, 'Aura Sphere'), State.createField(gen, {}));
}

describe('enduring a lethal hit', () => {
  test('a guaranteed KO against a bare target leaves no survivors', () => {
    const dist = resolveMove(versus({ability: 'Rock Head'}));

    expect(dist.size()).toBe(1);
    expect(dist.outcomes[0].data.target.hp).toBe(0);
  });

  test('Sturdy survives at one HP from full', () => {
    const dist = resolveMove(versus({ability: 'Sturdy'}));

    expect(dist.size()).toBe(1);
    expect(dist.outcomes[0].data.target.hp).toBe(1);
    expect(dist.probabilityOf(dist.outcomes[0].data)).toBe(1);
  });

  test('Sturdy does nothing below full HP', () => {
    const state = versus({ability: 'Sturdy'});
    state.target.hp = state.target.maxhp - 1;

    const dist = resolveMove(state);

    expect(dist.outcomes.every(o => o.data.target.hp === 0)).toBe(true);
  });

  test('Focus Sash survives at one HP and is consumed', () => {
    const dist = resolveMove(versus({ability: 'Rock Head', item: 'Focus Sash'}));

    expect(dist.size()).toBe(1);
    expect(dist.outcomes[0].data.target.hp).toBe(1);
    expect(dist.outcomes[0].data.target.item).toBeUndefined();
  });

  test('Mold Breaker punches through Sturdy', () => {
    const dist = resolveMove(versus({ability: 'Sturdy'}, {ability: 'Mold Breaker'}));

    expect(dist.outcomes.every(o => o.data.target.hp === 0)).toBe(true);
  });

  test('Focus Band is rejected rather than silently ignored', () => {
    expect(() => resolveMove(versus({ability: 'Rock Head', item: 'Focus Band'}))).toThrow(UnsupportedMoveError);
  });
});

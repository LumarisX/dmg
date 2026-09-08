import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {State} from '../state';
import {UnsupportedMoveError, resolveMove} from '../resolve';

const gens = new Generations(Dex as any);
const gen = gens.get(9);

function build(attackerName: string, moveName: string, options: {item?: string; ability?: string} = {}) {
  const attacker = State.createPokemon(gen, attackerName, {evs: {atk: 252}, item: options.item, ability: options.ability});
  const defender = State.createPokemon(gen, 'Blissey', {evs: {hp: 252}});
  return State.oneOnOne(gen, attacker, defender, State.createMove(gen, moveName), State.createField(gen, {}));
}

function mass(dist: ReturnType<typeof resolveMove>): number {
  const total = dist.totalOutcomes;
  return dist.outcomes.reduce((sum, o) => sum + o.count / total, 0);
}

describe('determinism', () => {
  test('the engine samples no branch — the same state resolves identically', () => {
    for (const name of ['Aura Sphere', 'Rock Blast', 'Population Bomb']) {
      const first = resolveMove(build('Maushold', name));
      const second = resolveMove(build('Maushold', name));
      expect(second.outcomes.map(o => o.count)).toEqual(first.outcomes.map(o => o.count));
      expect(second.totalOutcomes).toBe(first.totalOutcomes);
    }
  });

  test('a move whose data branches randomly is rejected, not sampled', () => {
    const reasons = (() => {
      try {
        resolveMove(build('Maushold', 'Present'));
        return undefined;
      } catch (e) {
        return e instanceof UnsupportedMoveError ? e.reasons : undefined;
      }
    })();

    expect(reasons).toContain('random move-data branches that are not enumerated');
  });
});

describe('past the exact horizon', () => {
  test('a ten-hit move resolves instead of throwing', () => {
    const dist = resolveMove(build('Maushold', 'Population Bomb'));
    expect(dist.size()).toBeGreaterThan(0);
    expect(mass(dist)).toBeCloseTo(1, 12);
    expect(dist.exact).toBe(false);
  });

  test('a ten-hit move with Loaded Dice resolves', () => {
    const dist = resolveMove(build('Maushold', 'Population Bomb', {item: 'Loaded Dice'}));
    expect(mass(dist)).toBeCloseTo(1, 12);
    expect(dist.exact).toBe(false);
  });

  test('moves that still fit stay exact', () => {
    for (const [name, move] of [
      ['Lucario', 'Aura Sphere'],
      ['Cloyster', 'Rock Blast'],
      ['Cloyster', 'Icicle Spear'],
    ] as const) {
      const dist = resolveMove(build(name, move));
      expect(dist.exact).toBe(true);
      expect(mass(dist)).toBeCloseTo(1, 12);
    }
  });

  test('every outcome carries a positive, finite probability', () => {
    const dist = resolveMove(build('Maushold', 'Population Bomb'));
    const total = dist.totalOutcomes;
    for (const outcome of dist.outcomes) {
      const probability = outcome.count / total;
      expect(Number.isFinite(probability)).toBe(true);
      expect(probability).toBeGreaterThan(0);
      expect(probability).toBeLessThanOrEqual(1);
    }
  });

  test('a ten-hit move knocks Blissey out more often than a five-hit one', () => {
    const koChance = (dist: ReturnType<typeof resolveMove>) => {
      const total = dist.totalOutcomes;
      return dist.outcomes.reduce((sum, o) => sum + (o.data.target.hp <= 0 ? o.count / total : 0), 0);
    };
    const five = koChance(resolveMove(build('Maushold', 'Icicle Spear')));
    const ten = koChance(resolveMove(build('Maushold', 'Population Bomb')));
    expect(ten).toBeGreaterThanOrEqual(five);
  });
});

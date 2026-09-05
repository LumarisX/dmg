import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {calculateDamage} from '../mechanics';
import {State} from '../state';
import {UnsupportedMoveError, resolveMove, secondaryBranches} from '../resolve';
import {simulateFinalState, simulateRolls} from './helpers/oracle';

const gens = new Generations(Dex as any);
const gen = gens.get(9);

function build(moveName: string, options: {attacker?: string; ability?: string; defender?: string; defenderAbility?: string} = {}) {
  const attacker = State.createPokemon(gen, options.attacker ?? 'Dragapult', {ability: options.ability, evs: {spa: 252, atk: 252}});
  const defender = State.createPokemon(gen, options.defender ?? 'Garchomp', {ability: options.defenderAbility, evs: {hp: 252}});
  return State.oneOnOne(gen, attacker, defender, State.createMove(gen, moveName), State.createField(gen, {}));
}

function sumsToOne(dist: ReturnType<typeof resolveMove>) {
  const total = dist.totalOutcomes;
  return dist.outcomes.reduce((sum, o) => sum + o.count / total, 0);
}

function massWhere(dist: ReturnType<typeof resolveMove>, predicate: (s: State) => boolean) {
  const total = dist.totalOutcomes;
  return dist.outcomes.filter(o => predicate(o.data)).reduce((sum, o) => sum + o.count, 0) / total;
}

describe('secondaryBranches', () => {
  test('a 10 percent burn splits one-in-ten, reduced', () => {
    const branches = secondaryBranches(build('Flamethrower'));
    expect(branches.map(b => b.weight)).toEqual([1, 9]);
    expect(branches[0].effects[0].status).toBe('brn');
  });

  test('Serene Grace doubles the chance', () => {
    const branches = secondaryBranches(build('Flamethrower', {ability: 'Serene Grace'}));
    expect(branches.map(b => b.weight)).toEqual([1, 4]);
  });

  test('Sheer Force removes the branch entirely', () => {
    expect(secondaryBranches(build('Flamethrower', {ability: 'Sheer Force'}))).toEqual([{effects: [], weight: 1}]);
  });

  test('Shield Dust on the target removes the branch entirely', () => {
    expect(secondaryBranches(build('Flamethrower', {defenderAbility: 'Shield Dust'}))).toEqual([{effects: [], weight: 1}]);
  });

  test('a move with no secondary has a single empty branch', () => {
    expect(secondaryBranches(build('Aura Sphere'))).toEqual([{effects: [], weight: 1}]);
  });
});

describe('resolveMove with secondaries', () => {
  test('probabilities still sum to one', () => {
    expect(sumsToOne(resolveMove(build('Flamethrower')))).toBeCloseTo(1, 12);
  });

  test('the burn lands in exactly one tenth of outcomes', () => {
    const dist = resolveMove(build('Flamethrower'));
    expect(massWhere(dist, s => s.target.status === 'brn')).toBeCloseTo(1 / 10, 12);
  });

  test('a stat-drop secondary lands at its own rate', () => {
    const dist = resolveMove(build('Shadow Ball'));
    expect(massWhere(dist, s => (s.target.boosts.spd ?? 0) < 0)).toBeCloseTo(2 / 10, 12);
  });

  test('type-immune targets never take the status', () => {
    const dist = resolveMove(build('Flamethrower', {defender: 'Volcarona'}));
    expect(massWhere(dist, s => s.target.status === 'brn')).toBe(0);
    expect(sumsToOne(dist)).toBeCloseTo(1, 12);
  });

  test('a fainted target never takes the status', () => {
    const state = build('Flamethrower', {defender: 'Volcarona'});
    state.target.hp = 1;
    const dist = resolveMove(build('Flamethrower'));
    expect(sumsToOne(dist)).toBeCloseTo(1, 12);
    expect(massWhere(resolveMove(state), s => s.target.hp === 0 && s.target.status === 'brn')).toBe(0);
  });

  test('Sheer Force trades the secondary for damage', () => {
    const plain = build('Flamethrower');
    const forced = build('Flamethrower', {ability: 'Sheer Force'});

    const plainDamage = (calculateDamage(plain) as number[])[15];
    const forcedDamage = (calculateDamage(forced) as number[])[15];

    expect(forcedDamage).toBeGreaterThan(plainDamage);
    expect(massWhere(resolveMove(forced), s => s.target.status === 'brn')).toBe(0);
  });

  test('multi-hit moves with secondaries are rejected rather than approximated', () => {
    expect(() => resolveMove(build('Flamethrower', {ability: 'Parental Bond'}))).toThrow(UnsupportedMoveError);
  });

  test('status secondaries against unmodelled blockers are rejected', () => {
    expect(() => resolveMove(build('Flamethrower', {defenderAbility: 'Water Veil'}))).toThrow(UnsupportedMoveError);
  });
});

describe('secondaries against the oracle', () => {
  test('Sheer Force damage matches sim', () => {
    const state = build('Flamethrower', {ability: 'Sheer Force'});
    expect(calculateDamage(state)).toEqual(simulateRolls(state));
  });

  test('a triggered burn matches sim', () => {
    const state = build('Flamethrower');
    expect(simulateFinalState(state, 100, {secondariesTrigger: true}).status).toBe('brn');
  });

  test('a suppressed burn matches sim', () => {
    const state = build('Flamethrower');
    expect(simulateFinalState(state, 100, {secondariesTrigger: false}).status).toBe('');
  });

  test('a type-immune target is unburned in sim too', () => {
    const state = build('Flamethrower', {defender: 'Volcarona'});
    expect(simulateFinalState(state, 100, {secondariesTrigger: true}).status).toBe('');
  });

  test('a triggered stat drop matches sim', () => {
    const state = build('Shadow Ball');
    expect(simulateFinalState(state, 100, {secondariesTrigger: true}).boosts.spd).toBe(-1);
  });

  test('Shield Dust blocks the secondary in sim too', () => {
    const state = build('Shadow Ball', {defenderAbility: 'Shield Dust'});
    expect(simulateFinalState(state, 100, {secondariesTrigger: true}).boosts.spd).toBe(0);
  });
});

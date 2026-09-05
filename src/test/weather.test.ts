import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {Conditions} from '../mechanics/conditions';
import {calculateDamage} from '../mechanics';
import {State} from '../state';
import {simulateRolls} from './helpers/oracle';

const gens = new Generations(Dex as any);
const gen = gens.get(9);

function build(moveName: string, weather?: string, options: {attackerItem?: string; defenderItem?: string} = {}) {
  const attacker = State.createPokemon(gen, 'Volcarona', {item: options.attackerItem, evs: {spa: 252}});
  const defender = State.createPokemon(gen, 'Garchomp', {item: options.defenderItem, evs: {hp: 252}});
  return State.oneOnOne(gen, attacker, defender, State.createMove(gen, moveName), State.createField(gen, weather ? {weather} : {}));
}

function best(state: State): number {
  const damage = calculateDamage(state);
  return Array.isArray(damage) ? damage[15] : damage;
}

describe('weather is handler-driven', () => {
  test('the condition table now carries the weather modifiers', () => {
    expect(Conditions.sun).toBeDefined();
    expect(Conditions.rain).toBeDefined();
    expect(Conditions.harshsunshine).toBeDefined();
    expect(Conditions.heavyrain).toBeDefined();
  });
});

describe('weather damage modifiers', () => {
  test('sun boosts Fire and halves Water', () => {
    expect(best(build('Flamethrower', 'Sun'))).toBeGreaterThan(best(build('Flamethrower')));
    expect(best(build('Surf', 'Sun'))).toBeLessThan(best(build('Surf')));
  });

  test('rain boosts Water and halves Fire', () => {
    expect(best(build('Surf', 'Rain'))).toBeGreaterThan(best(build('Surf')));
    expect(best(build('Flamethrower', 'Rain'))).toBeLessThan(best(build('Flamethrower')));
  });

  test('harsh sunshine makes Water moves fail outright', () => {
    expect(calculateDamage(build('Surf', 'Harsh Sunshine'))).toBe(0);
  });

  test('heavy rain makes Fire moves fail outright', () => {
    expect(calculateDamage(build('Flamethrower', 'Heavy Rain'))).toBe(0);
  });
});

describe('Utility Umbrella', () => {
  test('on the defender it now suppresses the sun boost', () => {
    const exposed = best(build('Flamethrower', 'Sun'));
    const shielded = best(build('Flamethrower', 'Sun', {defenderItem: 'Utility Umbrella'}));

    expect(shielded).toBeLessThan(exposed);
    expect(shielded).toBe(best(build('Flamethrower')));
  });

  test('on the defender it suppresses the rain penalty too', () => {
    expect(best(build('Flamethrower', 'Rain', {defenderItem: 'Utility Umbrella'}))).toBe(best(build('Flamethrower')));
  });

  test('on the attacker it does not suppress the defender-side check', () => {
    expect(best(build('Flamethrower', 'Sun', {attackerItem: 'Utility Umbrella'}))).toBe(best(build('Flamethrower', 'Sun')));
  });
});

describe('weather against the oracle', () => {
  test('sun-boosted Fire matches sim', () => {
    const state = build('Flamethrower', 'Sun');
    expect(calculateDamage(state)).toEqual(simulateRolls(state));
  });

  test('sun-weakened Water matches sim', () => {
    const state = build('Surf', 'Sun');
    expect(calculateDamage(state)).toEqual(simulateRolls(state));
  });

  test('rain-boosted Water matches sim', () => {
    const state = build('Surf', 'Rain');
    expect(calculateDamage(state)).toEqual(simulateRolls(state));
  });

  test('a defender holding Utility Umbrella matches sim', () => {
    const state = build('Flamethrower', 'Sun', {defenderItem: 'Utility Umbrella'});
    expect(calculateDamage(state)).toEqual(simulateRolls(state));
  });

  test('Hydro Steam in sun matches sim', () => {
    const state = build('Hydro Steam', 'Sun');
    expect(calculateDamage(state)).toEqual(simulateRolls(state));
  });

  test('Hydro Steam with the attacker under an umbrella matches sim', () => {
    const state = build('Hydro Steam', 'Sun', {attackerItem: 'Utility Umbrella'});
    expect(calculateDamage(state)).toEqual(simulateRolls(state));
  });
});

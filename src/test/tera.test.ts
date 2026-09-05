import {Generations, TypeName} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {Context} from '../context';
import {calculateDamage} from '../mechanics';
import {State} from '../state';
import {stateKey} from '../key';
import {simulateRolls} from './helpers/oracle';

const gens = new Generations(Dex as any);
const gen = gens.get(9);

function build(options: {
  attacker?: string;
  ability?: string;
  move?: string;
  teraType?: TypeName;
  terastallized?: boolean;
  defender?: string;
  defenderTera?: TypeName;
  defenderTerastallized?: boolean;
}) {
  const attacker = State.createPokemon(gen, options.attacker ?? 'Dragapult', {
    ability: options.ability,
    evs: {atk: 252, spa: 252},
    teraType: options.teraType,
    terastallized: options.terastallized,
  });
  const defender = State.createPokemon(gen, options.defender ?? 'Garchomp', {
    evs: {hp: 252},
    teraType: options.defenderTera,
    terastallized: options.defenderTerastallized,
  });
  return State.oneOnOne(gen, attacker, defender, State.createMove(gen, options.move ?? 'Shadow Ball'), State.createField(gen, {}));
}

function best(state: State): number {
  const damage = calculateDamage(state);
  return Array.isArray(damage) ? damage[15] : damage;
}

describe('tera state plumbing', () => {
  test('an explicitly requested tera type is no longer discarded', () => {
    const pokemon = State.createPokemon(gen, 'Dragapult', {teraType: 'Fairy'});
    expect(pokemon.teraType).toBe('Fairy');
  });

  test('tera type still defaults to the primary type', () => {
    expect(State.createPokemon(gen, 'Dragapult').teraType).toBe('Dragon');
  });

  test('terastallizing is off unless asked for', () => {
    expect(State.createPokemon(gen, 'Dragapult').terastallized).toBe(false);
  });

  test('terastallizing replaces the effective types but keeps the base types', () => {
    const state = build({teraType: 'Fairy', terastallized: true});
    const context = Context.fromState(state);

    expect(context.attacker.types).toEqual(['Fairy']);
    expect(context.attacker.baseTypes).toEqual(['Dragon', 'Ghost']);
  });

  test('the round trip through Context preserves the base types', () => {
    const state = build({teraType: 'Fairy', terastallized: true});
    expect(Context.fromState(state).toState().attacker.types).toEqual(['Dragon', 'Ghost']);
  });

  test('terastallizing changes the key', () => {
    expect(stateKey(build({teraType: 'Fairy', terastallized: true}))).not.toBe(stateKey(build({teraType: 'Fairy'})));
  });
});

describe('tera STAB', () => {
  test('tera into a brand new type grants STAB it did not have', () => {
    const plain = build({move: 'Dazzling Gleam'});
    const teraed = build({move: 'Dazzling Gleam', teraType: 'Fairy', terastallized: true});

    expect(best(teraed) / best(plain)).toBeCloseTo(1.5, 1);
  });

  test('tera into an existing type doubles instead of one-and-a-half', () => {
    const normal = build({move: 'Shadow Ball'});
    const teraed = build({move: 'Shadow Ball', teraType: 'Ghost', terastallized: true});

    expect(best(teraed)).toBeGreaterThan(best(normal));
    expect(best(teraed) / best(normal)).toBeCloseTo(2 / 1.5, 1);
  });

  test('an off-type move keeps base STAB after terastallizing', () => {
    const teraed = build({move: 'Dragon Pulse', teraType: 'Fairy', terastallized: true});
    const plain = build({move: 'Dragon Pulse'});

    expect(best(teraed)).toBe(best(plain));
  });

  test('a non-STAB move stays non-STAB', () => {
    const plain = build({move: 'Flamethrower'});
    const teraed = build({move: 'Flamethrower', teraType: 'Fairy', terastallized: true});

    expect(best(teraed)).toBe(best(plain));
  });
});

describe('tera against the oracle', () => {
  test('tera into an existing type matches sim', () => {
    const state = build({move: 'Shadow Ball', teraType: 'Ghost', terastallized: true});
    expect(calculateDamage(state)).toEqual(simulateRolls(state));
  });

  test('tera into a new type matches sim', () => {
    const state = build({move: 'Dazzling Gleam', teraType: 'Fairy', terastallized: true});
    expect(calculateDamage(state)).toEqual(simulateRolls(state));
  });

  test('an off-type move after terastallizing matches sim', () => {
    const state = build({move: 'Dragon Pulse', teraType: 'Fairy', terastallized: true});
    expect(calculateDamage(state)).toEqual(simulateRolls(state));
  });

  test('a terastallized defender takes damage on its tera typing', () => {
    const state = build({move: 'Shadow Ball', defenderTera: 'Steel', defenderTerastallized: true});
    expect(calculateDamage(state)).toEqual(simulateRolls(state));
  });

  test('a defender that teras into an immunity takes nothing, exactly as sim', () => {
    const state = build({move: 'Shadow Ball', defenderTera: 'Normal', defenderTerastallized: true});
    expect(calculateDamage(state)).toBe(0);
    expect(simulateRolls(state)).toEqual(Array(16).fill(0));
  });

  test('Adaptability with tera on an existing type matches sim', () => {
    const state = build({attacker: 'Dragapult', ability: 'Adaptability', move: 'Shadow Ball', teraType: 'Ghost', terastallized: true});
    expect(calculateDamage(state)).toEqual(simulateRolls(state));
  });

  test('Adaptability without tera still matches sim', () => {
    const state = build({attacker: 'Dragapult', ability: 'Adaptability', move: 'Shadow Ball'});
    expect(calculateDamage(state)).toEqual(simulateRolls(state));
  });
});

import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {calculateDamage} from '../mechanics';
import {resolveMove} from '../resolve';
import {State} from '../state';
import {ROLL_PERCENTS, critCalls, simulateBranch, simulateRolls} from './helpers/oracle';

const gens = new Generations(Dex as any);
const gen = gens.get(9);

function build(attacker = 'Lucario', defender = 'Blissey', moveName = 'Aura Sphere') {
  return State.oneOnOne(
    gen,
    State.createPokemon(gen, attacker, {nature: 'Modest', evs: {spa: 252}}),
    State.createPokemon(gen, defender, {evs: {hp: 252, spd: 252}}),
    State.createMove(gen, moveName),
    State.createField(gen, {})
  );
}

function dmgRolls(state: State, crit = false): number[] {
  const move = {...state.move, crit};
  const branch = State.oneOnOne(state.gen, state.sides[0], state.sides[1], move, state.field, state.gameType);
  return calculateDamage(branch) as number[];
}

describe('scripted-branch oracle', () => {
  test('forcing a branch takes exactly one crit roll and one damage roll', () => {
    const branch = simulateBranch(build(), 100);

    expect(branch.randomizerCalls).toBe(1);
    expect(branch.randomChanceCalls).toEqual([[1, 24]]);
  });

  test('the crit denominator sim uses matches the table resolveMove weights with', () => {
    const [[numerator, denominator]] = critCalls(simulateBranch(build(), 100));
    expect(numerator).toBe(1);
    expect(denominator).toBe(24);
  });

  test('a never-miss move takes no accuracy roll at all', () => {
    const branch = simulateBranch(build('Lucario', 'Blissey', 'Aura Sphere'), 100);
    expect(branch.randomChanceCalls.filter(([, d]) => d === 100)).toHaveLength(0);
  });

  test('a sub-100 accuracy move takes an accuracy roll, which is forced to hit', () => {
    const branch = simulateBranch(build('Lucario', 'Blissey', 'Meteor Mash'), 100);

    expect(branch.randomChanceCalls).toContainEqual([90, 100]);
    expect(critCalls(branch)).toEqual([[1, 24]]);
    expect(branch.damage).toBeGreaterThan(0);
  });

  test('sixteen scripted runs reproduce the whole roll spread', () => {
    const damages = simulateRolls(build());

    expect(damages).toHaveLength(16);
    expect(new Set(damages).size).toBeGreaterThan(1);
    expect([...damages].sort((a, b) => a - b)).toEqual(damages);
  });

  test('non-crit rolls match calculateDamage exactly', () => {
    const state = build();
    expect(dmgRolls(state)).toEqual(simulateRolls(state));
  });

  test('crit rolls match calculateDamage exactly', () => {
    const state = build();
    expect(dmgRolls(state, true)).toEqual(simulateRolls(state, true));
  });

  test('a resisted matchup matches', () => {
    const state = build('Lucario', 'Toxapex', 'Aura Sphere');
    expect(dmgRolls(state)).toEqual(simulateRolls(state));
  });

  test('a neutral matchup matches', () => {
    const state = build('Lucario', 'Dragonite', 'Aura Sphere');
    expect(dmgRolls(state)).toEqual(simulateRolls(state));
  });

  test('a physical move matches', () => {
    const state = build('Lucario', 'Blissey', 'Earthquake');
    expect(dmgRolls(state)).toEqual(simulateRolls(state));
  });

  test('a move whose accuracy roll had to be forced still matches', () => {
    const state = build('Lucario', 'Blissey', 'Meteor Mash');
    expect(dmgRolls(state)).toEqual(simulateRolls(state));
  });

  test('STAB matches', () => {
    const state = build('Lucario', 'Blissey', 'Flash Cannon');
    expect(dmgRolls(state)).toEqual(simulateRolls(state));
  });

  test('resolveMove covers exactly the damage values sim produces', () => {
    const state = build();
    const startingHp = state.target.hp;

    const simDamage = new Set([...simulateRolls(state), ...simulateRolls(state, true)]);
    const resolvedDamage = new Set(resolveMove(state).outcomes.map(o => startingHp - o.data.target.hp));

    expect([...resolvedDamage].sort((a, b) => a - b)).toEqual([...simDamage].sort((a, b) => a - b));
  });

  test('an attacker offensive boost matches', () => {
    const state = build();
    state.attacker.boosts.spa = 2;
    expect(dmgRolls(state)).toEqual(simulateRolls(state));
  });

  test('a defender defensive boost matches', () => {
    const state = build();
    state.target.boosts.spd = 2;
    expect(dmgRolls(state)).toEqual(simulateRolls(state));
  });

  test('a negative defender boost matches', () => {
    const state = build();
    state.target.boosts.spd = -2;
    expect(dmgRolls(state)).toEqual(simulateRolls(state));
  });

  test('a crit ignores the defender positive boost, exactly as sim does', () => {
    const state = build();
    state.target.boosts.spd = 2;
    expect(dmgRolls(state, true)).toEqual(simulateRolls(state, true));
  });

  test('a crit keeps a negative attacker boost ignored, exactly as sim does', () => {
    const state = build();
    state.attacker.boosts.spa = -2;
    expect(dmgRolls(state, true)).toEqual(simulateRolls(state, true));
  });

  test('roll percents span the documented 85-100 range', () => {
    expect(ROLL_PERCENTS[0]).toBe(85);
    expect(ROLL_PERCENTS[15]).toBe(100);
  });
});

import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {calculateDamage} from '../mechanics';
import {State} from '../state';
import {simulateBranch} from './helpers/oracle';

const gens = new Generations(Dex as any);
const gen = gens.get(9);

interface Case {
  move: string;
  attacker: string;
  defender: string;
  ability?: string;
  targetAbility?: string;
  item?: string;
}

function damages(c: Case): {ours: number; theirs: number} {
  const attacker = State.createPokemon(gen, c.attacker, {
    ability: c.ability as never,
    item: c.item as never,
    evs: {atk: 252, spa: 252},
  });
  const target = State.createPokemon(gen, c.defender, {
    ability: c.targetAbility as never,
    evs: {hp: 252, def: 252, spd: 252},
  });
  const state = State.oneOnOne(gen, attacker, target, State.createMove(gen, c.move), State.createField(gen, {}));

  const rolls = calculateDamage({...state, move: {...state.move, crit: false}} as never);
  return {
    ours: Array.isArray(rolls) ? rolls[rolls.length - 1] : rolls,
    theirs: simulateBranch(state, 100, false).damage,
  };
}

const IMPLEMENTED: [string, Case][] = [
  ["Dragon's Maw", {move: 'Dragon Pulse', attacker: 'Dragapult', defender: 'Blissey', ability: "Dragon's Maw"}],
  ['Rocky Payload', {move: 'Power Gem', attacker: 'Garganacl', defender: 'Blissey', ability: 'Rocky Payload'}],
  ['Transistor', {move: 'Thunderbolt', attacker: 'Regieleki', defender: 'Blissey', ability: 'Transistor'}],
  ['Sharpness', {move: 'Psycho Cut', attacker: 'Gallade', defender: 'Blissey', ability: 'Sharpness'}],
  ['Technician', {move: 'Bullet Punch', attacker: 'Scizor', defender: 'Blissey', ability: 'Technician'}],

  ['Heatproof', {move: 'Flamethrower', attacker: 'Miraidon', defender: 'Bronzong', targetAbility: 'Heatproof'}],
  ['Thick Fat (Fire)', {move: 'Flamethrower', attacker: 'Miraidon', defender: 'Snorlax', targetAbility: 'Thick Fat'}],
  ['Thick Fat (Ice)', {move: 'Ice Beam', attacker: 'Miraidon', defender: 'Snorlax', targetAbility: 'Thick Fat'}],
  ['Purifying Salt', {move: 'Shadow Ball', attacker: 'Miraidon', defender: 'Garganacl', targetAbility: 'Purifying Salt'}],
  ['Water Bubble', {move: 'Flamethrower', attacker: 'Miraidon', defender: 'Palafin', targetAbility: 'Water Bubble'}],

  ['Volt Absorb', {move: 'Thunderbolt', attacker: 'Miraidon', defender: 'Lanturn', targetAbility: 'Volt Absorb'}],
  ['Motor Drive', {move: 'Thunderbolt', attacker: 'Miraidon', defender: 'Rotom', targetAbility: 'Motor Drive'}],
  ['Lightning Rod', {move: 'Thunderbolt', attacker: 'Miraidon', defender: 'Pikachu', targetAbility: 'Lightning Rod'}],
  ['Water Absorb', {move: 'Surf', attacker: 'Miraidon', defender: 'Quagsire', targetAbility: 'Water Absorb'}],
  ['Storm Drain', {move: 'Surf', attacker: 'Miraidon', defender: 'Gastrodon', targetAbility: 'Storm Drain'}],
  ['Sap Sipper', {move: 'Energy Ball', attacker: 'Miraidon', defender: 'Azumarill', targetAbility: 'Sap Sipper'}],
  ['Well-Baked Body', {move: 'Flamethrower', attacker: 'Miraidon', defender: 'Dachsbun', targetAbility: 'Well-Baked Body'}],
  ['Flash Fire', {move: 'Flamethrower', attacker: 'Miraidon', defender: 'Arcanine', targetAbility: 'Flash Fire'}],
  ['Earth Eater', {move: 'Earthquake', attacker: 'Miraidon', defender: 'Orthworm', targetAbility: 'Earth Eater'}],
  ['Wind Rider', {move: 'Bleakwind Storm', attacker: 'Miraidon', defender: 'Brambleghast', targetAbility: 'Wind Rider'}],
  ['Bulletproof', {move: 'Shadow Ball', attacker: 'Miraidon', defender: 'Chesnaught', targetAbility: 'Bulletproof'}],
  ['Soundproof', {move: 'Hyper Voice', attacker: 'Miraidon', defender: 'Electrode', targetAbility: 'Soundproof'}],
  ['Wonder Guard (neutral)', {move: 'Body Slam', attacker: 'Miraidon', defender: 'Orthworm', targetAbility: 'Wonder Guard'}],
  ['Wonder Guard (super effective)', {move: 'Earthquake', attacker: 'Miraidon', defender: 'Orthworm', targetAbility: 'Wonder Guard'}],
];

const SUPPRESSED: [string, Case][] = [
  ['Earth Eater', {move: 'Earthquake', attacker: 'Rampardos', defender: 'Orthworm', ability: 'Mold Breaker', targetAbility: 'Earth Eater'}],
  ['Volt Absorb', {move: 'Thunder Punch', attacker: 'Rampardos', defender: 'Lanturn', ability: 'Mold Breaker', targetAbility: 'Volt Absorb'}],
  ['Heatproof', {move: 'Flamethrower', attacker: 'Rampardos', defender: 'Bronzong', ability: 'Mold Breaker', targetAbility: 'Heatproof'}],
  ['Thick Fat', {move: 'Flamethrower', attacker: 'Rampardos', defender: 'Snorlax', ability: 'Mold Breaker', targetAbility: 'Thick Fat'}],
];

const CONTROLS: [string, Case][] = [
  ["Dragon's Maw", {move: 'Flamethrower', attacker: 'Dragapult', defender: 'Blissey', ability: "Dragon's Maw"}],
  ['Thick Fat', {move: 'Thunderbolt', attacker: 'Miraidon', defender: 'Snorlax', targetAbility: 'Thick Fat'}],
  ['Purifying Salt', {move: 'Earthquake', attacker: 'Miraidon', defender: 'Garganacl', targetAbility: 'Purifying Salt'}],
  ['Volt Absorb', {move: 'Surf', attacker: 'Miraidon', defender: 'Lanturn', targetAbility: 'Volt Absorb'}],
];

describe('ability coverage against @pkmn/sim', () => {
  test.each(IMPLEMENTED)('%s matches the sim', (_name, c) => {
    const {ours, theirs} = damages(c);
    expect(ours).toBe(theirs);
  });

  test.each(SUPPRESSED)('%s is suppressed by Mold Breaker', (_name, c) => {
    const {ours, theirs} = damages(c);
    expect(ours).toBe(theirs);
  });

  test.each(CONTROLS)('%s leaves unrelated types alone', (_name, c) => {
    const {ours, theirs} = damages(c);
    expect(ours).toBe(theirs);
  });
});

describe('burn', () => {
  test('halves physical damage', () => {
    const attacker = State.createPokemon(gen, 'Snorlax', {ability: 'Immunity' as never, status: 'brn' as never, evs: {atk: 252}});
    const target = State.createPokemon(gen, 'Dondozo', {evs: {hp: 252, def: 252}});
    const state = State.oneOnOne(gen, attacker, target, State.createMove(gen, 'Body Slam'), State.createField(gen, {}));
    const rolls = calculateDamage({...state, move: {...state.move, crit: false}} as never) as number[];
    expect(rolls[rolls.length - 1]).toBe(simulateBranch(state, 100, false).damage);
  });

  test.failing('does not touch special damage (known bug, pinned; see docs/PIPELINE.md)', () => {
    const attacker = State.createPokemon(gen, 'Snorlax', {ability: 'Immunity' as never, status: 'brn' as never, evs: {spa: 252}});
    const target = State.createPokemon(gen, 'Dondozo', {evs: {hp: 252, spd: 252}});
    const state = State.oneOnOne(gen, attacker, target, State.createMove(gen, 'Ice Beam'), State.createField(gen, {}));
    const rolls = calculateDamage({...state, move: {...state.move, crit: false}} as never) as number[];
    expect(rolls[rolls.length - 1]).toBe(simulateBranch(state, 100, false).damage);
  });
});

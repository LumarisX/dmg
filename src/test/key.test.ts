import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {stateDistribution, stateKey} from '../key';
import {State} from '../state';

const gens = new Generations(Dex as any);
const gen = gens.get(9);

function build(attackerHp?: number, defenderHp?: number) {
  const attacker = State.createPokemon(gen, 'Lucario', {ability: 'Inner Focus'});
  const defender = State.createPokemon(gen, 'Blissey');
  if (attackerHp !== undefined) attacker.hp = attackerHp;
  if (defenderHp !== undefined) defender.hp = defenderHp;
  return State.oneOnOne(gen, attacker, defender, State.createMove(gen, 'Aura Sphere'), State.createField(gen, {}));
}

describe('stateKey', () => {
  test('identical states key identically', () => {
    expect(stateKey(build())).toBe(stateKey(build()));
  });

  test('clamps hp at zero so overkill does not split states', () => {
    const dead = build(undefined, 0);
    const veryDead = build(undefined, -37);
    expect(stateKey(veryDead)).toBe(stateKey(dead));
  });

  test('still distinguishes surviving hp values', () => {
    expect(stateKey(build(undefined, 100))).not.toBe(stateKey(build(undefined, 101)));
  });

  test('an absent boost and an explicit zero are the same state', () => {
    const bare = build();
    const zeroed = build();
    zeroed.attacker.boosts.atk = 0;
    expect(stateKey(zeroed)).toBe(stateKey(bare));
  });

  test('clamps boosts to the legal range', () => {
    const beyond = build();
    const capped = build();
    beyond.attacker.boosts.atk = 8;
    capped.attacker.boosts.atk = 6;
    expect(stateKey(beyond)).toBe(stateKey(capped));
  });

  test('boosts still discriminate within the legal range', () => {
    const plusOne = build();
    const plusTwo = build();
    plusOne.attacker.boosts.atk = 1;
    plusTwo.attacker.boosts.atk = 2;
    expect(stateKey(plusOne)).not.toBe(stateKey(plusTwo));
  });

  test('caps the toxic counter where the damage stops growing', () => {
    const fifteen = build();
    const twenty = build();
    fifteen.target.status = 'tox';
    fifteen.target.statusState = {toxicTurns: 15};
    twenty.target.status = 'tox';
    twenty.target.statusState = {toxicTurns: 20};
    expect(stateKey(twenty)).toBe(stateKey(fifteen));
  });

  test('volatile insertion order does not change the key', () => {
    const forward = build();
    const backward = build();
    forward.attacker.volatiles = {charge: {}, stockpile: {level: 2}};
    backward.attacker.volatiles = {stockpile: {level: 2}, charge: {}};
    expect(stateKey(backward)).toBe(stateKey(forward));
  });

  test('volatile levels discriminate', () => {
    const one = build();
    const two = build();
    one.attacker.volatiles = {stockpile: {level: 1}};
    two.attacker.volatiles = {stockpile: {level: 2}};
    expect(stateKey(one)).not.toBe(stateKey(two));
  });

  test('keeps fields that handlers read', () => {
    const base = build();

    const hurt = build();
    hurt.target.hurtThisTurn = true;
    expect(stateKey(hurt)).not.toBe(stateKey(base));

    const itemised = build();
    itemised.target.item = 'leftovers' as typeof itemised.target.item;
    expect(stateKey(itemised)).not.toBe(stateKey(base));

    const switching = build();
    switching.target.switching = 'out';
    expect(stateKey(switching)).not.toBe(stateKey(base));

    const teraed = build();
    teraed.attacker.teraType = 'Water';
    expect(stateKey(teraed)).not.toBe(stateKey(base));
  });

  test('createPokemon defaults teraType to the primary type', () => {
    const base = build();
    expect(base.attacker.teraType).toBe('Fighting');

    const explicit = build();
    explicit.attacker.teraType = 'Fighting';
    expect(stateKey(explicit)).toBe(stateKey(base));
  });

  test('field conditions discriminate', () => {
    const base = build();
    const rain = build();
    rain.field.weather = 'Rain';
    expect(stateKey(rain)).not.toBe(stateKey(base));
  });

  test('side conditions discriminate', () => {
    const base = build();
    const screened = build();
    screened.sides[1].sideConditions = {reflect: {}};
    expect(stateKey(screened)).not.toBe(stateKey(base));
  });
});

describe('stateDistribution', () => {
  test('overkill collapses sixteen rolls into one certain outcome', () => {
    const hp = 80;
    const rolls = Array.from({length: 16}, (_, i) => 150 + i);

    const outcomes = rolls.map(damage => build(undefined, hp - damage));
    const distribution = stateDistribution(outcomes);

    expect(distribution.size()).toBe(1);
    expect(distribution.totalOutcomes).toBe(16);
    expect(distribution.probabilityOf(outcomes[0])).toBe(1);
  });

  test('a partially-surviving spread does not collapse', () => {
    const hp = 400;
    const rolls = Array.from({length: 16}, (_, i) => 150 + i);

    const distribution = stateDistribution(rolls.map(damage => build(undefined, hp - damage)));

    expect(distribution.size()).toBe(16);
    expect(distribution.totalOutcomes).toBe(16);
  });

  test('a spread straddling zero collapses only the lethal half', () => {
    const hp = 158;
    const rolls = Array.from({length: 16}, (_, i) => 150 + i);

    const distribution = stateDistribution(rolls.map(damage => build(undefined, hp - damage)));

    expect(distribution.size()).toBe(9);
    expect(distribution.totalOutcomes).toBe(16);
  });
});

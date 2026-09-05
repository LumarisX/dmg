import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {calculateDamage} from '../mechanics';
import {State} from '../state';
import {hitCountBranches, resolveMove} from '../resolve';
import {ROLL_PERCENTS, simulateBranch, simulateRolls} from './helpers/oracle';

const gens = new Generations(Dex as any);
const gen = gens.get(9);

function build(
  moveName: string,
  options: {attacker?: string; ability?: string; item?: string; defender?: string; defenderAbility?: string} = {}
) {
  const attacker = State.createPokemon(gen, options.attacker ?? 'Cloyster', {
    ability: options.ability,
    item: options.item,
    evs: {atk: 252},
  });
  const defender = State.createPokemon(gen, options.defender ?? 'Blissey', {
    ability: options.defenderAbility,
    evs: {hp: 252},
  });
  return State.oneOnOne(gen, attacker, defender, State.createMove(gen, moveName), State.createField(gen, {}));
}

function sumsToOne(dist: ReturnType<typeof resolveMove>) {
  const total = dist.totalOutcomes;
  return dist.outcomes.reduce((sum, o) => sum + o.count / total, 0);
}

describe('Loaded Dice', () => {
  test('collapses a 2-5 spread to an even split between four and five hits', () => {
    const move = State.createMove(gen, 'Rock Blast');
    const holder = State.createPokemon(gen, 'Cloyster', {item: 'Loaded Dice'});

    expect(hitCountBranches(9, move, holder)).toEqual([
      {hits: 4, weight: 1},
      {hits: 5, weight: 1},
    ]);
  });

  test('leaves pre-gen-5 spreads alone', () => {
    const move = State.createMove(gen, 'Rock Blast');
    const holder = State.createPokemon(gen, 'Cloyster', {item: 'Loaded Dice'});
    expect(hitCountBranches(4, move, holder)).toHaveLength(4);
  });

  test('turns a ten-hit move into a uniform four-to-ten spread', () => {
    const move = State.createMove(gen, 'Population Bomb');
    const holder = State.createPokemon(gen, 'Cloyster', {item: 'Loaded Dice'});

    const branches = hitCountBranches(9, move, holder);
    expect(branches.map(b => b.hits)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(branches.every(b => b.weight === 1)).toBe(true);
  });

  test('resolves and still sums to one', () => {
    expect(sumsToOne(resolveMove(build('Rock Blast', {item: 'Loaded Dice'})))).toBeCloseTo(1, 12);
  });
});

describe('Parental Bond', () => {
  const bondGen = gens.get(8);

  function bonded() {
    const attacker = State.createPokemon(bondGen, 'Kangaskhan', {ability: 'Parental Bond', evs: {atk: 252}});
    const defender = State.createPokemon(bondGen, 'Blissey', {evs: {hp: 252}});
    return State.oneOnOne(bondGen, attacker, defender, State.createMove(bondGen, 'Body Slam'), State.createField(bondGen, {}));
  }

  function hitDamage(state: State, hit: number) {
    return calculateDamage(State.oneOnOne(bondGen, state.sides[0], state.sides[1], {...state.move, hit}, state.field)) as number[];
  }

  test('turns a single-hit move into two hits', () => {
    const move = State.createMove(bondGen, 'Body Slam');
    const kangaskhan = State.createPokemon(bondGen, 'Kangaskhan', {ability: 'Parental Bond'});
    expect(hitCountBranches(8, move, kangaskhan)).toEqual([{hits: 2, weight: 1}]);
  });

  test('leaves genuinely multi-hit moves alone', () => {
    const move = State.createMove(bondGen, 'Rock Blast');
    const kangaskhan = State.createPokemon(bondGen, 'Kangaskhan', {ability: 'Parental Bond'});
    expect(hitCountBranches(8, move, kangaskhan)).toHaveLength(4);
  });

  test('the second hit is quartered after gen 6', () => {
    const state = bonded();
    const first = hitDamage(state, 1);
    const second = hitDamage(state, 2);

    expect(second[15]).toBeLessThan(first[15]);
    expect(second[15]).toBeGreaterThan(first[15] * 0.2);
    expect(second[15]).toBeLessThan(first[15] * 0.35);
  });

  test('matches sim across every roll', () => {
    const state = bonded();
    const totals = simulateRolls(state);
    const first = hitDamage(state, 1);
    const second = hitDamage(state, 2);

    ROLL_PERCENTS.forEach((_, i) => {
      expect(totals[i]).toBe(first[i] + second[i]);
    });
  });

  test('sim really is taking two hits', () => {
    expect(simulateBranch(bonded(), 100).randomizerCalls).toBe(2);
  });
});

describe('Stamina', () => {
  test('raises the target defense between hits, so later hits do less', () => {
    const state = build('Rock Blast', {ability: 'Skill Link', defender: 'Mudsdale', defenderAbility: 'Stamina'});
    const dist = resolveMove(state);

    const boosted = dist.outcomes.filter(o => (o.data.target.boosts.def ?? 0) > 0);
    expect(boosted.length).toBeGreaterThan(0);
    expect(sumsToOne(dist)).toBeCloseTo(1, 12);
  });

  test('five non-crit hits into Stamina deal less than five times the first hit', () => {
    const base = build('Rock Blast', {ability: 'Skill Link', defender: 'Mudsdale', defenderAbility: 'Stamina'});
    const state = State.oneOnOne(gen, base.sides[0], base.sides[1], {...base.move, critRatio: 0}, base.field);
    const startingHp = state.target.hp;
    const firstHit = (calculateDamage(state) as number[])[15];

    const worst = Math.max(...resolveMove(state).outcomes.map(o => startingHp - o.data.target.hp));

    expect(worst).toBeLessThan(firstHit * 5);
    expect(worst).toBeGreaterThan(firstHit);
  });

  test('a crit ignores the defense boost Stamina just gained', () => {
    const state = build('Rock Blast', {ability: 'Skill Link', defender: 'Mudsdale', defenderAbility: 'Stamina'});
    const boosted = State.oneOnOne(
      gen,
      state.sides[0],
      {...state.sides[1], active: [{...state.target, boosts: {...state.target.boosts, def: 2}}]},
      state.move,
      state.field
    );

    const normal = calculateDamage(boosted) as number[];
    const crit = calculateDamage(State.oneOnOne(gen, boosted.sides[0], boosted.sides[1], {...boosted.move, crit: true}, boosted.field)) as number[];
    const unboostedCrit = calculateDamage(State.oneOnOne(gen, state.sides[0], state.sides[1], {...state.move, crit: true}, state.field)) as number[];

    expect(normal[15]).toBeLessThan(unboostedCrit[15]);
    expect(crit[15]).toBe(unboostedCrit[15]);
  });

  test('matches sim, which also raises defense between hits', () => {
    const state = build('Rock Blast', {ability: 'Skill Link', defender: 'Mudsdale', defenderAbility: 'Stamina'});
    const startingHp = state.target.hp;

    const resolved = new Set(resolveMove(state).outcomes.map(o => startingHp - o.data.target.hp));

    for (const total of simulateRolls(state)) {
      expect(resolved.has(total)).toBe(true);
    }
  });
});

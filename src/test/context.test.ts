import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {Context, Reification} from '../context';
import {calculateDamage} from '../mechanics';
import {State} from '../state';

const gens = new Generations(Dex as any);
const gen = gens.get(9);

function build(moveName: string, options: {allies?: string[]; atks?: number[]; weather?: 'Sun' | 'Rain'} = {}) {
  const attacker = State.createPokemon(gen, 'Cloyster', {evs: {atk: 252}});
  const defender = State.createPokemon(gen, 'Blissey', {evs: {hp: 252}});
  const side = {abilities: options.allies, atks: options.atks};
  return State.oneOnOne(
    gen,
    State.createSide(gen, attacker, {...side, sideConditions: {reflect: {}}}),
    State.createSide(gen, defender, side),
    State.createMove(gen, moveName),
    State.createField(gen, {weather: options.weather})
  );
}

function damaged(state: State, hp: number): State {
  return state.withPokemonAt(state.action.target, {...state.target, hp});
}

describe('Reification', () => {
  test('a derived context calculates identically to a freshly built one', () => {
    const state = build('Rock Blast', {allies: ['Friend Guard'], atks: [100, 80]});
    const reification = new Reification();

    for (let hp = 100; hp <= 400; hp += 37) {
      for (const crit of [false, true]) {
        const next = damaged(state, hp);

        const fresh = Context.fromState(next.withMove({...next.move, crit}));
        const derived = reification.of(next);
        derived.move.crit = crit;

        expect(calculateDamage(derived)).toEqual(calculateDamage(fresh));
      }
    }
  });

  test('reuses the sub-contexts whose state fragment is unchanged by reference', () => {
    const state = build('Rock Blast', {allies: ['Friend Guard'], atks: [100, 80]});
    const reification = new Reification();

    const first = reification.of(state);
    const second = reification.of(damaged(state, 200));

    expect(second.field).toBe(first.field);
    expect(second.attackerSide).not.toBe(first.attackerSide);
    expect(second.attackerSide.sideConditions).toBe(first.attackerSide.sideConditions);
    expect(second.attackerSide.allies).toBe(first.attackerSide.allies);
    expect(second.attackerSide.team).toBe(first.attackerSide.team);
    expect(second.targetSide.allies).toBe(first.targetSide.allies);
  });

  test('rebuilds the fragments that did change', () => {
    const state = build('Rock Blast', {allies: ['Friend Guard'], atks: [100, 80]});
    const reification = new Reification();

    const first = reification.of(state);
    const second = reification.of(
      state.withSideAt(1, {...state.sides[1], allies: [{ability: 'levitate' as never, position: 0}]})
    );

    expect(second.targetSide.allies).not.toBe(first.targetSide.allies);
    expect(second.field).toBe(first.field);
  });

  test('never reuses across a different Relevancy', () => {
    const state = build('Rock Blast');
    const first = Context.fromState(state);
    const second = Context.fromState(state);

    expect(second.field).not.toBe(first.field);
    expect(second.relevant).not.toBe(first.relevant);
  });

  test('a reused sub-context still records relevancy against the shared Relevancy', () => {
    const state = build('Rock Blast', {weather: 'Rain'});
    const reification = new Reification();

    const first = reification.of(state);
    const second = reification.of(damaged(state, 200));

    expect(second.field).toBe(first.field);
    second.field.weather?.onWeatherModifyDamage?.(second);
    expect(second.relevant.field.weather).toBe(first.relevant.field.weather);
  });
});

describe('Context.Move', () => {
  test('resolves move data without reading the crit flag', () => {
    for (const name of ['Rock Blast', 'Aura Sphere', 'Triple Axel', 'Facade', 'Eruption', 'Weather Ball', 'Avalanche']) {
      const state = build(name);
      const without = Context.fromState(state.withMove({...state.move, crit: false}));
      const with_ = Context.fromState(state.withMove({...state.move, crit: true}));

      expect({
        basePower: with_.move.basePower,
        type: with_.move.type,
        accuracy: with_.move.accuracy,
        multihit: with_.move.multihit,
        effectiveness: with_.move.effectiveness,
      }).toEqual({
        basePower: without.move.basePower,
        type: without.move.type,
        accuracy: without.move.accuracy,
        multihit: without.move.multihit,
        effectiveness: without.move.effectiveness,
      });
    }
  });
});

describe('Context', () => {
  test.todo('restore Field/Side/Pokemon/Move coverage — see docs/PLAN.md Phase 2');

  // test("Field", () => {
  //   const { context, state, relevancy } = newContext();
  //   const before = serialize(state);
  //   const p1 = context.attacker;
  //   expect(context.field.weather?.basePowerCallback?.(context)).toBeUndefined();
  //   expect(relevancy.field.weather).toBeUndefined();
  //   expect(context.field.weather?.onModifyAtk?.(context)).toBe(1);
  //   expect(relevancy.field.weather).toBe(true);
  //   expect(context.field.terrain?.onModifyAtk?.(context)).toBeUndefined();
  //   expect(relevancy.field.terrain).toBeUndefined();
  //   expect(context.field.terrain?.onModifyDef?.(context)).toBe(2);
  //   expect(relevancy.field.terrain).toBe(true);
  //   expect(
  //     context.field.pseudoWeather["gravity"]?.onModifyAtk?.(context)
  //   ).toBeUndefined();
  //   expect(relevancy.field.pseudoWeather["gravity"]).toBeUndefined();
  //   expect(context.field.pseudoWeather["gravity"]?.onModifySpA?.(context)).toBe(3);
  //   expect(relevancy.field.pseudoWeather["gravity"]).toBe(true);
  //   context.field.weather = undefined;
  //   context.field.terrain = undefined;
  //   expect(serialize(state)).toEqual(before);
  // });
  // test("Side", () => {
  //   const { context, state, relevancy } = newContext();
  //   const before = serialize(state);
  //   const p1 = context.attacker;
  //   expect(
  //     context.sides[1].sideConditions["stealthrock"]?.onModifyAtk?.(p1)
  //   ).toBeUndefined();
  //   expect(relevancy.sides[1].sideConditions["stealthrock"]).toBeUndefined();
  //   expect(context.sides[0].sideConditions["tailwind"]?.onModifySpe?.(p1)).toBe(0);
  //   expect(relevancy.sides[0].sideConditions["tailwind"]).toBe(true);
  //   context.p1.active = [{ ability: "friendguard" as ID }];
  //   context.sides[1].team = [];
  //   expect(serialize(state)).toEqual(before);
  // });
  // test("Pokemon", () => {
  //   const { context, state, relevancy } = newContext();
  //   const before = serialize(state);
  //   const p1 = context.attacker;
  //   const p2 = context.target;
  //   expect(p1.status?.onModifyAtk?.(p1)).toBe(4);
  //   expect(p2.status?.onModifyAtk?.(p1)).toBeUndefined();
  //   expect(p1.ability?.onBasePower?.(context)).toBe(6);
  //   expect(p2.ability?.onModifySpA?.(p1)).toBeUndefined();
  //   expect(p1.item?.onBasePower?.(context)).toBeUndefined();
  //   expect(p2.item?.onResidual?.(p1)).toBe(5);
  //   expect(p1.volatiles["electrify"]?.onModifyWeight?.(p1)).toBeUndefined();
  //   expect(p2.volatiles["foo"]?.onResidual?.(p1)).toBeUndefined();
  //   expect(p2.volatiles["leechseed"]?.onResidual?.(p1)).toBe(7);
  //   p1;
  //   expect(relevancy.attacker.status).toBe(true);
  //   expect(relevancy.attacker.ability).toBe(true);
  //   expect(relevancy.attacker.item).toBeUndefined();
  //   expect(relevancy.attacker.volatiles["electrify"]).toBeUndefined();
  //   expect(relevancy.target.status).toBeUndefined();
  //   expect(relevancy.target.ability).toBeUndefined();
  //   expect(relevancy.target.item).toBe(true);
  //   expect(relevancy.target.volatiles["leechseed"]).toBe(true);
  //   p2.gender = "M";
  //   p1.addedType = "Grass";
  //   expect(serialize(state)).toEqual(before);
  // });
  // test("Move", () => {
  //   const { context, state } = newContext();
  //   const before = serialize(state);
  //   const p1 = context.attacker;
  //   expect(context.move.onModifyAtk?.(p1)).toBeUndefined();
  //   expect(context.move.basePowerCallback?.(context)).toBe(4);
  //   context.move.crit = true;
  //   expect(serialize(state)).toEqual(before);
  // });
  // test("toJSON", () => {
  //   expect(() => JSON.stringify(newContext().context.toJSON())).not.toThrow();
  // });
});

// function newContext() {
//   const gens = new Generations(Dex as any);
//   const gen = gens.get(7);
//   const relevancy = new Relevancy();

//   const state = State.oneOnOne(
//     gen,
//     {
//       pokemon: State.createPokemon(gen, 'Gengar', {
//         item: 'Choice Specs',
//         ability: 'Cursed Body',
//         status: 'burned',
//         volatiles: {electrify: {}},
//         boosts: {spa: 2},
//       }),
//       sideConditions: {tailwind: {}},
//     },
//     {
//       pokemon: State.createPokemon(gen, 'Blissey', {
//         item: 'Leftovers',
//         ability: 'Natural Cure',
//         status: 'tox',
//         statusState: {toxicTurns: 2},
//         volatiles: {leechseed: {}},
//       }),
//       sideConditions: {stealthrock: {}, spikes: {level: 1}},
//     },
//     State.createMove(gen, 'Sacred Sword'),
//     {weather: 'Sand', terrain: 'Misty', pseudoWeather: {gravity: {}}}
//   ) as DeepReadonly<State>;

//   const context = new Context(
//     state,
//     {
//       Items: {
//         choicespecs: {},
//         leftovers: {
//           onResidual() {
//             return 5;
//           },
//         },
//       },
//       Abilities: {
//         cursedbody: {
//           onBasePower() {
//             return 6;
//           },
//         },
//         naturalcure: {},
//       },
//       Conditions: {
//         brn: {
//           onModifyAtk() {
//             return 4;
//           },
//         },
//         electrify: {},
//         tailwind: {
//           onModifySpe() {
//             return 0;
//           },
//         },
//         tox: {},
//         lightscreen: {},
//         leechseed: {
//           onResidual() {
//             return 7;
//           },
//         },
//         stealthrock: {},
//         spikes: {},
//         sand: {
//           onModifyAtk() {
//             return 1;
//           },
//         },
//         misty: {
//           onModifyDef() {
//             return 2;
//           },
//         },
//         gravity: {
//           onModifySpA() {
//             return 3;
//           },
//         },
//       },
//       Moves: {
//         sacredsword: {
//           basePowerCallback() {
//             return 4;
//           },
//         },
//       },
//     },
//     relevancy
//   );

//   return {context, state, relevancy};
// }

// function serialize(state: DeepReadonly<State>) {
//   return JSON.stringify(State.toJSON(state as State));
// }

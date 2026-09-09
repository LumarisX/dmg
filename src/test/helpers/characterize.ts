import {Generation} from '@pkmn/data';

import {Distribution} from '../../distribution';
import {UnsupportedMoveError, resolveMove} from '../../resolve';
import {State} from '../../state';
import {resolveTurns} from '../../turns';

export interface Scenario {
  name: string;
  move: string;
  attacker: string;
  defender: string;
  attackerOptions?: {ability?: string; item?: string; nature?: string; status?: string};
  defenderOptions?: {ability?: string; item?: string; hp?: number};
  turns?: number;
}

export const CORPUS: Scenario[] = [
  {name: 'single hit', move: 'Aura Sphere', attacker: 'Lucario', defender: 'Blissey'},
  {name: 'sub-100 accuracy', move: 'Meteor Mash', attacker: 'Lucario', defender: 'Blissey'},
  {name: 'status secondary', move: 'Ice Beam', attacker: 'Miraidon', defender: 'Blissey'},
  {name: 'multi-hit 2-5', move: 'Rock Blast', attacker: 'Cloyster', defender: 'Blissey'},
  {name: 'multi-hit + loaded dice', move: 'Icicle Spear', attacker: 'Cloyster', defender: 'Blissey', attackerOptions: {item: 'Loaded Dice'}},
  {name: 'multi-hit + skill link', move: 'Rock Blast', attacker: 'Cloyster', defender: 'Blissey', attackerOptions: {ability: 'Skill Link'}},
  {name: 'multiaccuracy', move: 'Triple Axel', attacker: 'Weavile', defender: 'Blissey'},
  {name: 'ten hits, past the exact horizon', move: 'Population Bomb', attacker: 'Maushold', defender: 'Blissey'},
  {name: 'move-data branches', move: 'Fickle Beam', attacker: 'Miraidon', defender: 'Blissey'},
  {name: 'move-data branches that all kill', move: 'Fickle Beam', attacker: 'Miraidon', defender: 'Blissey', defenderOptions: {hp: 1}},
  {name: 'stamina', move: 'Aura Sphere', attacker: 'Lucario', defender: 'Dondozo', defenderOptions: {ability: 'Stamina'}},
  {name: 'stamina + multi-hit', move: 'Rock Blast', attacker: 'Cloyster', defender: 'Dondozo', defenderOptions: {ability: 'Stamina'}},
  {name: 'focus sash', move: 'Aura Sphere', attacker: 'Lucario', defender: 'Blissey', defenderOptions: {item: 'Focus Sash'}},
  {name: 'sturdy', move: 'Aura Sphere', attacker: 'Lucario', defender: 'Dondozo', defenderOptions: {ability: 'Sturdy'}},
  {name: 'absorbed outright', move: 'Thunderbolt', attacker: 'Miraidon', defender: 'Lanturn', defenderOptions: {ability: 'Volt Absorb'}},
  {name: 'defender-side reduction', move: 'Flamethrower', attacker: 'Miraidon', defender: 'Snorlax', defenderOptions: {ability: 'Thick Fat'}},
  {name: 'turns, single hit', move: 'Aura Sphere', attacker: 'Lucario', defender: 'Blissey', turns: 6},
  {name: 'turns, multi-hit', move: 'Rock Blast', attacker: 'Cloyster', defender: 'Blissey', turns: 4},
  {name: 'turns, full state path', move: 'Aura Sphere', attacker: 'Lucario', defender: 'Dragonite', defenderOptions: {ability: 'Multiscale'}, turns: 4},
];

export function build(gen: Generation, scenario: Scenario): State {
  const attacker = State.createPokemon(gen, scenario.attacker, {
    ability: scenario.attackerOptions?.ability as never,
    item: scenario.attackerOptions?.item as never,
    nature: scenario.attackerOptions?.nature as never,
    status: scenario.attackerOptions?.status as never,
    evs: {atk: 252, spa: 252},
  });
  const target = State.createPokemon(gen, scenario.defender, {
    ability: scenario.defenderOptions?.ability as never,
    item: scenario.defenderOptions?.item as never,
    evs: {hp: 252, def: 252, spd: 252},
  });
  if (scenario.defenderOptions?.hp !== undefined) target.hp = scenario.defenderOptions.hp;
  return State.oneOnOne(gen, attacker, target, State.createMove(gen, scenario.move), State.createField(gen, {}));
}

function round(value: number): number {
  return value === 0 ? 0 : Number(value.toPrecision(12));
}

function labelsOf(labels: {[axis: string]: {[value: string]: number}} | undefined, total: number) {
  if (!labels) return undefined;
  const out: {[axis: string]: {[value: string]: number}} = {};
  for (const axis of Object.keys(labels).sort()) {
    const counts: {[value: string]: number} = {};
    for (const value of Object.keys(labels[axis]).sort()) counts[value] = round(labels[axis][value] / total);
    out[axis] = counts;
  }
  return out;
}

export function characterizeMove(distribution: Distribution<State>) {
  const total = distribution.totalOutcomes;
  return {
    exact: distribution.exact,
    outcomes: distribution.outcomes
      .map(outcome => ({
        hp: outcome.data.target.hp,
        status: outcome.data.target.status ?? null,
        boosts: JSON.stringify(outcome.data.target.boosts),
        item: outcome.data.target.item ?? null,
        probability: round(outcome.count / total),
        labels: labelsOf(outcome.labels, total),
      }))
      .sort((a, b) => a.hp - b.hp || a.probability - b.probability || (a.status ?? '').localeCompare(b.status ?? '')),
  };
}

export function characterize(gen: Generation, scenario: Scenario) {
  let state: State;
  try {
    state = build(gen, scenario);
  } catch (error) {
    return {refused: `build: ${(error as Error).message}`};
  }

  try {
    if (scenario.turns) {
      const result = resolveTurns(state, {turns: scenario.turns});
      return {
        knockoutByTurn: result.knockoutByTurn.map(round),
        prunedMass: round(result.prunedMass),
        outcomes: result.outcomes.length,
      };
    }
    return characterizeMove(resolveMove(state));
  } catch (error) {
    if (error instanceof UnsupportedMoveError) return {refused: error.reasons.join('; ')};
    throw error;
  }
}

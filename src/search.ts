import {stateKey} from './key';
import {resolveMove} from './resolve';
import {State} from './state';

export interface Policy {
  chooseMove(state: State, turn: number): State.Move;
}

export const repeatMove: Policy = {
  chooseMove: state => state.move,
};

export interface SearchOptions {
  turns: number;
  policy?: Policy;
  epsilon?: number;
  maxOutcomes?: number;
}

export interface SearchOutcome {
  state: State;
  probability: number;
}

export interface SearchResult {
  turns: number;
  outcomes: SearchOutcome[];
  prunedMass: number;
  knockoutByTurn: number[];
}

const DEFAULT_EPSILON = 1e-9;

function startOfTurn(state: State): State {
  const defender = state.p2.pokemon;
  if (!defender.hurtThisTurn) return state;
  return new State(
    state.gen,
    state.p1,
    {...state.p2, pokemon: {...defender, hurtThisTurn: undefined}},
    state.move,
    state.field,
    state.gameType
  );
}

function withMove(state: State, move: State.Move): State {
  return move === state.move ? state : new State(state.gen, state.p1, state.p2, move, state.field, state.gameType);
}

export function search(state: State, options: SearchOptions): SearchResult {
  const policy = options.policy ?? repeatMove;
  const epsilon = options.epsilon ?? DEFAULT_EPSILON;

  let current = new Map<string, SearchOutcome>();
  current.set(stateKey(state), {state, probability: 1});

  let prunedMass = 0;
  const knockoutByTurn: number[] = [];

  for (let turn = 1; turn <= options.turns; turn++) {
    const next = new Map<string, SearchOutcome>();

    for (const outcome of current.values()) {
      if (outcome.state.p2.pokemon.hp <= 0) {
        accumulate(next, outcome.state, outcome.probability);
        continue;
      }

      const opening = withMove(startOfTurn(outcome.state), policy.chooseMove(outcome.state, turn));
      const resolved = resolveMove(opening);
      const total = resolved.totalOutcomes;

      for (const branch of resolved.outcomes) {
        const probability = outcome.probability * (branch.count / total);
        if (probability < epsilon) {
          prunedMass += probability;
          continue;
        }
        accumulate(next, branch.data, probability);
      }
    }

    current = capOutcomes(next, options.maxOutcomes, mass => (prunedMass += mass));
    knockoutByTurn.push(knockedOutMass(current));
  }

  return {
    turns: options.turns,
    outcomes: [...current.values()].sort((a, b) => b.probability - a.probability),
    prunedMass,
    knockoutByTurn,
  };
}

function accumulate(into: Map<string, SearchOutcome>, state: State, probability: number) {
  const key = stateKey(state);
  const existing = into.get(key);
  if (existing) {
    existing.probability += probability;
  } else {
    into.set(key, {state, probability});
  }
}

function capOutcomes(
  outcomes: Map<string, SearchOutcome>,
  maxOutcomes: number | undefined,
  onPruned: (mass: number) => void
): Map<string, SearchOutcome> {
  if (!maxOutcomes || outcomes.size <= maxOutcomes) return outcomes;

  const sorted = [...outcomes.entries()].sort((a, b) => b[1].probability - a[1].probability);
  const kept = sorted.slice(0, maxOutcomes);
  for (const [, outcome] of sorted.slice(maxOutcomes)) onPruned(outcome.probability);
  return new Map(kept);
}

function knockedOutMass(outcomes: Map<string, SearchOutcome>): number {
  let mass = 0;
  for (const outcome of outcomes.values()) {
    if (outcome.state.p2.pokemon.hp <= 0) mass += outcome.probability;
  }
  return mass;
}

export function knockoutChances(state: State, turns: number, options: Omit<SearchOptions, 'turns'> = {}): number[] {
  return search(state, {...options, turns}).knockoutByTurn;
}

export function guaranteedKnockoutTurn(state: State, turns: number, options: Omit<SearchOptions, 'turns'> = {}): number | undefined {
  const chances = knockoutChances(state, turns, options);
  const index = chances.findIndex(chance => chance >= 1);
  return index === -1 ? undefined : index + 1;
}

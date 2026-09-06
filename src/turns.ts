import {stateKey} from './key';
import {resolveMove} from './resolve';
import {State} from './state';

export interface Policy {
  chooseMove(state: State, turn: number): State.Move;
}

export const repeatMove: Policy = {
  chooseMove: state => state.move,
};

export interface TurnsOptions {
  turns: number;
  policy?: Policy;
  epsilon?: number;
  maxOutcomes?: number;
}

export interface TurnsOutcome {
  state: State;
  probability: number;
}

export interface TurnsResult {
  turns: number;
  outcomes: TurnsOutcome[];
  prunedMass: number;
  knockoutByTurn: number[];
}

const DEFAULT_EPSILON = 1e-9;

function startOfTurn(state: State): State {
  const defender = state.target;
  if (!defender.hurtThisTurn) return state;
  return state.withPokemonAt(state.action.target, {...defender, hurtThisTurn: undefined});
}

export function resolveTurns(state: State, options: TurnsOptions): TurnsResult {
  const policy = options.policy ?? repeatMove;
  const epsilon = options.epsilon ?? DEFAULT_EPSILON;

  let current = new Map<string, TurnsOutcome>();
  current.set(stateKey(state), {state, probability: 1});

  let prunedMass = 0;
  const knockoutByTurn: number[] = [];

  for (let turn = 1; turn <= options.turns; turn++) {
    const next = new Map<string, TurnsOutcome>();

    for (const outcome of current.values()) {
      if (outcome.state.target.hp <= 0) {
        accumulate(next, outcome.state, outcome.probability);
        continue;
      }

      const opening = startOfTurn(outcome.state).withMove(policy.chooseMove(outcome.state, turn));
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

function accumulate(into: Map<string, TurnsOutcome>, state: State, probability: number) {
  const key = stateKey(state);
  const existing = into.get(key);
  if (existing) {
    existing.probability += probability;
  } else {
    into.set(key, {state, probability});
  }
}

function capOutcomes(
  outcomes: Map<string, TurnsOutcome>,
  maxOutcomes: number | undefined,
  onPruned: (mass: number) => void
): Map<string, TurnsOutcome> {
  if (!maxOutcomes || outcomes.size <= maxOutcomes) return outcomes;

  const sorted = [...outcomes.entries()].sort((a, b) => b[1].probability - a[1].probability);
  const kept = sorted.slice(0, maxOutcomes);
  for (const [, outcome] of sorted.slice(maxOutcomes)) onPruned(outcome.probability);
  return new Map(kept);
}

function knockedOutMass(outcomes: Map<string, TurnsOutcome>): number {
  let mass = 0;
  for (const outcome of outcomes.values()) {
    if (outcome.state.target.hp <= 0) mass += outcome.probability;
  }
  return mass;
}

export function knockoutChances(state: State, turns: number, options: Omit<TurnsOptions, 'turns'> = {}): number[] {
  return resolveTurns(state, {...options, turns}).knockoutByTurn;
}

export function guaranteedKnockoutTurn(state: State, turns: number, options: Omit<TurnsOptions, 'turns'> = {}): number | undefined {
  const chances = knockoutChances(state, turns, options);
  const index = chances.findIndex(chance => chance >= 1);
  return index === -1 ? undefined : index + 1;
}

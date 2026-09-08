import {Distribution} from './distribution';
import {stateKey} from './key';
import {max} from './math';
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
  maxResolves?: number;
}

export interface TurnsOutcome {
  state: State;
  probability: number;
}

export interface TurnsResult {
  turns: number;
  outcomes: TurnsOutcome[];
  prunedMass: number;
  unexpandedMass: number;
  resolves: number;
  knockoutByTurn: number[];
}

const DEFAULT_EPSILON = 1e-9;

const TARGET_HP_SENSITIVE_ABILITIES = new Set(['multiscale', 'shadowshield', 'sturdy']);
const TARGET_HP_SENSITIVE_ITEMS = new Set(['figyberry', 'sitrusberry', 'focussash']);
const TARGET_HP_SENSITIVE_MOVES = new Set([
  'brine',
  'crushgrip',
  'naturesmadness',
  'superfang',
  'wringout',
]);

function damageIgnoresTargetHp(state: State, resolved: Distribution<State>): boolean {
  const target = state.target;
  if (target.ability && TARGET_HP_SENSITIVE_ABILITIES.has(target.ability)) return false;
  if (target.item && TARGET_HP_SENSITIVE_ITEMS.has(target.item)) return false;
  if (TARGET_HP_SENSITIVE_MOVES.has(state.move.id)) return false;

  const baseline = stateKey(state);
  for (const outcome of resolved.outcomes) {
    const restored = outcome.data.withPokemonAt(state.action.target, {
      ...outcome.data.target,
      hp: target.hp,
      hurtThisTurn: target.hurtThisTurn,
    });
    if (stateKey(restored) !== baseline) return false;
  }
  return true;
}

interface HpBucket {
  hp: number;
  hurt: boolean;
  probability: number;
}

function projectTargetHp(
  state: State,
  resolved: Distribution<State>,
  options: TurnsOptions,
  epsilon: number
): TurnsResult {
  const slot = state.action.target;
  const total = resolved.totalOutcomes;
  const damages = resolved.outcomes.map(outcome => ({
    damage: state.target.hp - max(0, outcome.data.target.hp),
    probability: outcome.count / total,
  }));

  let buckets = new Map<string, HpBucket>([
    [`${state.target.hp}|${!!state.target.hurtThisTurn}`, {hp: state.target.hp, hurt: !!state.target.hurtThisTurn, probability: 1}],
  ]);
  const knockoutByTurn: number[] = [];
  let prunedMass = 0;

  for (let turn = 1; turn <= options.turns; turn++) {
    const next = new Map<string, HpBucket>();
    for (const bucket of buckets.values()) {
      if (bucket.hp <= 0) {
        addBucket(next, bucket.hp, bucket.hurt, bucket.probability);
        continue;
      }
      for (const roll of damages) {
        const probability = bucket.probability * roll.probability;
        if (probability < epsilon) {
          prunedMass += probability;
          continue;
        }
        addBucket(next, max(0, bucket.hp - roll.damage), roll.damage > 0, probability);
      }
    }
    buckets = capBuckets(next, options.maxOutcomes, mass => (prunedMass += mass));
    knockoutByTurn.push(knockedOutHp(buckets));
  }

  const outcomes: TurnsOutcome[] = [...buckets.values()]
    .map(bucket => ({
      state: state.withPokemonAt(slot, {
        ...state.target,
        hp: bucket.hp,
        hurtThisTurn: bucket.hurt ? true : undefined,
      }),
      probability: bucket.probability,
    }))
    .sort((a, b) => b.probability - a.probability);

  return {turns: options.turns, outcomes, prunedMass, unexpandedMass: 0, resolves: 1, knockoutByTurn};
}

function capBuckets(
  buckets: Map<string, HpBucket>,
  maxOutcomes: number | undefined,
  onPruned: (mass: number) => void
): Map<string, HpBucket> {
  if (!maxOutcomes || buckets.size <= maxOutcomes) return buckets;

  const sorted = [...buckets.entries()].sort((a, b) => b[1].probability - a[1].probability);
  for (const [, bucket] of sorted.slice(maxOutcomes)) onPruned(bucket.probability);
  return new Map(sorted.slice(0, maxOutcomes));
}

function addBucket(into: Map<string, HpBucket>, hp: number, hurt: boolean, probability: number) {
  const key = `${hp}|${hurt}`;
  const existing = into.get(key);
  if (existing) {
    existing.probability += probability;
  } else {
    into.set(key, {hp, hurt, probability});
  }
}

function knockedOutHp(buckets: Map<string, HpBucket>): number {
  let mass = 0;
  for (const bucket of buckets.values()) {
    if (bucket.hp <= 0) mass += bucket.probability;
  }
  return mass;
}

function startOfTurn(state: State): State {
  const defender = state.target;
  if (!defender.hurtThisTurn) return state;
  return state.withPokemonAt(state.action.target, {...defender, hurtThisTurn: undefined});
}

export function resolveTurns(state: State, options: TurnsOptions): TurnsResult {
  const policy = options.policy ?? repeatMove;
  const epsilon = options.epsilon ?? DEFAULT_EPSILON;

  if (policy === repeatMove && options.turns > 0) {
    const opening = startOfTurn(state);
    const resolved = resolveMove(opening);
    if (damageIgnoresTargetHp(opening, resolved)) {
      return projectTargetHp(opening, resolved, options, epsilon);
    }
  }

  let current = new Map<string, TurnsOutcome>();
  current.set(stateKey(state), {state, probability: 1});

  let prunedMass = 0;
  let unexpandedMass = 0;
  let resolves = 0;
  const budget = options.maxResolves ?? Infinity;
  const knockoutByTurn: number[] = [];

  for (let turn = 1; turn <= options.turns; turn++) {
    const next = new Map<string, TurnsOutcome>();
    unexpandedMass = 0;

    const ordered =
      budget === Infinity
        ? [...current.values()]
        : [...current.values()].sort((a, b) => b.probability - a.probability);

    for (const outcome of ordered) {
      if (outcome.state.target.hp <= 0) {
        accumulate(next, outcome.state, outcome.probability);
        continue;
      }

      if (resolves >= budget) {
        unexpandedMass += outcome.probability;
        accumulate(next, outcome.state, outcome.probability);
        continue;
      }

      const opening = startOfTurn(outcome.state).withMove(policy.chooseMove(outcome.state, turn));
      resolves++;
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
    unexpandedMass,
    resolves,
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

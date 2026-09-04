import {Distribution, Outcome, greatestCommonDivisor} from './distribution';
import {stateDistribution, stateKey} from './key';
import {clamp, max} from './math';
import {bondsWith, calculateDamage} from './mechanics';
import {State} from './state';

export class UnsupportedMoveError extends Error {
  readonly reasons: string[];

  constructor(move: string, reasons: string[]) {
    super(`'${move}' is outside the move class resolveMove currently supports: ${reasons.join(', ')}`);
    this.reasons = reasons;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function critMultipliers(genNum: number): number[] {
  if (genNum <= 5) return [0, 16, 8, 4, 3, 2];
  if (genNum === 6) return [0, 16, 8, 2, 1];
  return [0, 24, 8, 2, 1];
}

export function critDenominator(genNum: number, critRatio: number): number | undefined {
  const table = critMultipliers(genNum);
  const ratio = clamp(0, critRatio, table.length - 1);
  return ratio === 0 ? undefined : table[ratio];
}

export interface HitCountBranch {
  hits: number;
  weight: number;
}

export function hitCountBranches(genNum: number, move: State.Move, attacker?: State.Pokemon): HitCountBranch[] {
  const multihit = move.multihit;
  const loadedDice = attacker?.item === 'loadeddice';

  if (multihit === undefined) {
    if (attacker?.ability === 'parentalbond' && bondsWith(move)) return [{hits: 2, weight: 1}];
    return [{hits: max(1, move.hits ?? 1), weight: 1}];
  }

  if (typeof multihit === 'number') {
    if (multihit === 10 && loadedDice) {
      const branches: HitCountBranch[] = [];
      for (let hits = 4; hits <= 10; hits++) branches.push({hits, weight: 1});
      return branches;
    }
    return [{hits: multihit, weight: 1}];
  }

  const [low, high] = multihit;
  if (attacker?.ability === 'skilllink' || attacker?.item === 'gripclaw') return [{hits: high, weight: 1}];

  if (low === 2 && high === 5) {
    if (loadedDice && genNum >= 5) {
      return [
        {hits: 4, weight: 1},
        {hits: 5, weight: 1},
      ];
    }
    return genNum >= 5
      ? [
          {hits: 2, weight: 7},
          {hits: 3, weight: 7},
          {hits: 4, weight: 3},
          {hits: 5, weight: 3},
        ]
      : [
          {hits: 2, weight: 3},
          {hits: 3, weight: 3},
          {hits: 4, weight: 1},
          {hits: 5, weight: 1},
        ];
  }

  const branches: HitCountBranch[] = [];
  for (let hits = low; hits <= high; hits++) branches.push({hits, weight: 1});
  return branches;
}

const CONTACT_PUNISHING_ITEMS = new Set(['rockyhelmet', 'stickybarb']);

const CONTACT_PUNISHING_ABILITIES = new Set([
  'roughskin',
  'ironbarbs',
  'aftermath',
  'effectspore',
  'flamebody',
  'static',
  'poisonpoint',
  'cutecharm',
  'gooey',
  'tanglinghair',
  'mummy',
  'lingeringaroma',
  'wanderingspirit',
  'perishbody',
  'pickpocket',
  'sandspit',
  'seedsower',
  'angershell',
  'toxicdebris',
  'steamengine',
  'electromorphosis',
  'windpower',
  'cottondown',
  'berserk',
  'justified',
  'rattled',
  'weakarmor',
  'innardsout',
  'gulpmissile',
  'illusion',
  'disguise',
  'iceface',
]);

function punishesContact(defender: State.Pokemon): boolean {
  if (defender.item && CONTACT_PUNISHING_ITEMS.has(defender.item)) return true;
  return !!defender.ability && CONTACT_PUNISHING_ABILITIES.has(defender.ability);
}

function unsupportedReasons(state: State): string[] {
  const move = state.move;
  const reasons: string[] = [];

  if (state.p1.pokemon.boosts.accuracy) reasons.push('accuracy boosts');
  if (state.p2.pokemon.boosts.evasion) reasons.push('evasion boosts');
  if (move.secondary || move.secondaries?.length) reasons.push('secondary effects');
  if (move.self) reasons.push('self effect');
  if (move.recoil || move.struggleRecoil || move.mindBlownRecoil) reasons.push('recoil');
  if (move.drain) reasons.push('drain');
  if (move.hasCrashDamage) reasons.push('crash damage');
  if (move.ohko) reasons.push('OHKO');
  if (move.selfdestruct) reasons.push('self-destruct');
  if (move.flags?.contact && punishesContact(state.p2.pokemon)) reasons.push('contact against a target that punishes it');
  if (state.gameType !== 'singles') reasons.push(`game type '${state.gameType}'`);

  return reasons;
}

export function assertSupported(state: State): void {
  const reasons = unsupportedReasons(state);
  if (reasons.length) throw new UnsupportedMoveError(state.move.name, reasons);
}

function damageRolls(state: State, crit: boolean, hitNumber = 1): number[] {
  const move: State.Move = {...state.move, crit, hit: hitNumber};
  const damage = calculateDamage(new State(state.gen, state.p1, state.p2, move, state.field, state.gameType));
  return Array.isArray(damage) ? damage : [damage];
}

function withDamage(state: State, damage: number): State {
  const defender = state.p2.pokemon;
  const hp = max(0, defender.hp - damage);
  const boosts = hp > 0 && damage > 0 && defender.ability === 'stamina' ? {...defender.boosts, def: clamp(-6, (defender.boosts.def ?? 0) + 1, 6)} : defender.boosts;

  const pokemon: State.Pokemon = {
    ...defender,
    hp,
    boosts,
    hurtThisTurn: damage > 0 ? true : defender.hurtThisTurn,
  };
  return new State(state.gen, state.p1, {...state.p2, pokemon}, state.move, state.field, state.gameType);
}

interface AccuracyBranch {
  lands: boolean;
  weight: number;
}

export function accuracyBranches(move: State.Move): AccuracyBranch[] {
  const accuracy = move.accuracy;
  if (accuracy === true || accuracy >= 100) return [{lands: true, weight: 1}];

  const divisor = greatestCommonDivisor(accuracy, 100);
  return [
    {lands: true, weight: accuracy / divisor},
    {lands: false, weight: (100 - accuracy) / divisor},
  ];
}

interface CritBranch {
  crit: boolean;
  weight: number;
}

export function critBranches(state: State): CritBranch[] {
  const denominator = state.move.crit || state.move.willCrit ? 1 : critDenominator(state.gen.num, state.move.critRatio ?? 0);

  if (denominator === undefined) return [{crit: false, weight: 1}];
  if (denominator === 1) return [{crit: true, weight: 1}];
  return [
    {crit: false, weight: denominator - 1},
    {crit: true, weight: 1},
  ];
}

function accumulate(into: Map<string, Outcome<State>>, state: State, count: number) {
  const key = stateKey(state);
  const existing = into.get(key);
  if (existing) {
    existing.count += count;
  } else {
    into.set(key, {data: state, count});
  }
}

interface Step {
  state: State;
  count: number;
  finished: boolean;
}

function accumulateStep(into: Map<string, Step>, state: State, count: number, finished: boolean) {
  const key = `${finished ? 'x' : 'o'}${stateKey(state)}`;
  const existing = into.get(key);
  if (existing) {
    existing.count += count;
  } else {
    into.set(key, {state, count, finished});
  }
}

function critExpansion(state: State, crits: CritBranch[]): number {
  return crits.reduce((sum, branch) => sum + branch.weight * damageRolls(state, branch.crit).length, 0);
}

function totalWeight(branches: {weight: number}[]): number {
  return branches.reduce((sum, branch) => sum + branch.weight, 0);
}

function advance(
  current: Map<string, Step>,
  crits: CritBranch[],
  perHitAccuracy: AccuracyBranch[],
  critExpansion: number,
  hitNumber: number
): Map<string, Step> {
  const next = new Map<string, Step>();
  const expansion = totalWeight(perHitAccuracy) * critExpansion;

  for (const step of current.values()) {
    if (step.finished || step.state.p2.pokemon.hp <= 0) {
      accumulateStep(next, step.state, step.count * expansion, true);
      continue;
    }

    for (const accuracy of perHitAccuracy) {
      if (!accuracy.lands) {
        accumulateStep(next, step.state, step.count * accuracy.weight * critExpansion, true);
        continue;
      }
      for (const branch of crits) {
        for (const damage of damageRolls(step.state, branch.crit, hitNumber)) {
          accumulateStep(next, withDamage(step.state, damage), step.count * accuracy.weight * branch.weight, false);
        }
      }
    }
  }

  return next;
}

export function resolveMove(state: State): Distribution<State> {
  assertSupported(state);

  const crits = critBranches(state);
  const hitBranches = hitCountBranches(state.gen.num, state.move, state.p1.pokemon);
  const critExp = critExpansion(state, crits);

  const perHit = accuracyBranches(state.move);
  const usesPerHitAccuracy = !!state.move.multiaccuracy;
  const wholeMoveAccuracy = usesPerHitAccuracy ? [{lands: true, weight: 1}] : perHit;
  const hitAccuracy = usesPerHitAccuracy ? perHit : [{lands: true, weight: 1}];

  const expansion = totalWeight(hitAccuracy) * critExp;
  const maxHits = hitBranches.reduce((highest, branch) => max(highest, branch.hits), 0);
  const perResolution = expansion ** maxHits;
  const hitWeightTotal = totalWeight(hitBranches);

  const merged = new Map<string, Outcome<State>>();
  let expectedTotal = 0;

  for (const accuracy of wholeMoveAccuracy) {
    if (!accuracy.lands) {
      const missed = accuracy.weight * hitWeightTotal * perResolution;
      accumulate(merged, state, missed);
      expectedTotal += missed;
      continue;
    }

    for (const hitBranch of hitBranches) {
      let current = new Map<string, Step>();
      accumulateStep(current, state, 1, false);

      for (let hit = 1; hit <= hitBranch.hits; hit++) {
        current = advance(current, crits, hitAccuracy, critExp, hit);
      }

      const scale = accuracy.weight * hitBranch.weight * expansion ** (maxHits - hitBranch.hits);
      for (const step of current.values()) {
        accumulate(merged, step.state, step.count * scale);
      }
      expectedTotal += accuracy.weight * hitBranch.weight * perResolution;
    }
  }

  const result = stateDistribution();
  result.outcomes = [...merged.values()];
  return result.assertExact(expectedTotal).normalize();
}

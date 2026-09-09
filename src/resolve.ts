import {Distribution, LabelCounts, Outcome, addLabels, greatestCommonDivisor} from './distribution';
import {HitBounds, LabelValues, Resolution, fromOutcomes, hitBounds, packHitKey, resolutionDistribution, single, toStateDistribution} from './resolution';
import {stateDistribution} from './key';
import type {BoostID, SecondaryEffect, TypeName} from '@pkmn/data';

import {Context, Reification} from './context';
import {MoveDataBranch} from './handlers';
import {clamp, max, min} from './math';
import {HANDLERS, bondsWith, calculateDamage} from './mechanics';
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

const UNBRANCHED: MoveDataBranch[] = [{label: '', weight: 1}];

const RANDOM_DATA_MOVES = new Set(['acupressure', 'conversion2', 'ficklebeam', 'metronome', 'present', 'shellsidearm', 'sleeptalk']);

export function moveDataBranches(move: State.Move): MoveDataBranch[] {
  const declared = HANDLERS.Moves[move.id]?.branches;
  return declared?.length ? declared : UNBRANCHED;
}

export function withBranch(state: State, branch: MoveDataBranch): State {
  if (!branch.move && !branch.flags) return state;
  const move = {...state.move, ...branch.move};
  if (branch.flags) move.flags = {...move.flags, ...branch.flags};
  return state.withMove(move);
}

function punishesContact(defender: State.Pokemon): boolean {
  if (defender.item && CONTACT_PUNISHING_ITEMS.has(defender.item)) return true;
  return !!defender.ability && CONTACT_PUNISHING_ABILITIES.has(defender.ability);
}

function unsupportedReasons(state: State): string[] {
  const move = state.move;
  const reasons: string[] = [];

  if (state.attacker.boosts.accuracy) reasons.push('accuracy boosts');
  if (state.target.boosts.evasion) reasons.push('evasion boosts');
  const secondaries = secondaryEffectsOf(move);
  if (secondaries.length) {
    const multiHit = !!move.multihit || (move.hits ?? 1) > 1 || state.attacker.ability === 'parentalbond';
    if (multiHit) reasons.push('secondary effects on a multi-hit move');
    if (state.target.ability && UNMODELLED_STATUS_ABILITIES.has(state.target.ability) && secondaries.some(s => s.status)) {
      reasons.push(`status secondary against '${state.target.ability}'`);
    }
    if (state.target.ability && UNMODELLED_BOOST_ABILITIES.has(state.target.ability) && secondaries.some(s => s.boosts)) {
      reasons.push(`boost secondary against '${state.target.ability}'`);
    }
    if (state.field.terrain === 'Misty' && secondaries.some(s => s.status)) reasons.push('status secondary under Misty Terrain');
    if (state.targetSide.sideConditions.safeguard && secondaries.some(s => s.status)) reasons.push('status secondary through Safeguard');
  }
  if (move.self) reasons.push('self effect');
  if (move.recoil || move.struggleRecoil || move.mindBlownRecoil) reasons.push('recoil');
  if (move.drain) reasons.push('drain');
  if (move.hasCrashDamage) reasons.push('crash damage');
  if (move.ohko) reasons.push('OHKO');
  if (move.selfdestruct) reasons.push('self-destruct');
  if (move.flags?.contact && punishesContact(state.target)) reasons.push('contact against a target that punishes it');
  const dataBranches = moveDataBranches(move);
  if (dataBranches === UNBRANCHED) {
    if (RANDOM_DATA_MOVES.has(move.id)) reasons.push('random move-data branches that are not enumerated');
  } else {
    if (hitCountBranches(state.gen.num, move, state.attacker).some(branch => branch.hits > 1)) {
      reasons.push('move-data branches on a multi-hit move');
    }
    if (move.heal || dataBranches.some(branch => branch.move?.heal)) reasons.push('target healing');
  }
  if (state.target.item === 'focusband') reasons.push('Focus Band');
  if (state.gameType !== 'singles') reasons.push(`game type '${state.gameType}'`);

  return reasons;
}

export function assertSupported(state: State): void {
  const reasons = unsupportedReasons(state);
  if (reasons.length) throw new UnsupportedMoveError(state.move.name, reasons);
}

function forHit(state: State, hitNumber: number): State {
  return state.withMove({...state.move, hit: hitNumber});
}

function damageRolls(context: Context, crit: boolean): number[] {
  context.move.crit = crit;
  const damage = calculateDamage(context);
  return Array.isArray(damage) ? damage : [damage];
}

const MOLD_BREAKERS = new Set(['moldbreaker', 'teravolt', 'turboblaze']);

function endures(state: State, damage: number): 'sturdy' | 'focussash' | undefined {
  const defender = state.target;
  if (defender.hp !== defender.maxhp || damage < defender.hp) return undefined;
  const suppressed = state.move.ignoreAbility || MOLD_BREAKERS.has(state.attacker.ability ?? '');
  if (defender.ability === 'sturdy' && !suppressed) return 'sturdy';
  if (defender.item === 'focussash') return 'focussash';
  return undefined;
}

function withDamage(state: State, damage: number): State {
  const defender = state.target;
  const endured = endures(state, damage);
  const hp = endured ? 1 : max(0, defender.hp - damage);
  const boosts = hp > 0 && damage > 0 && defender.ability === 'stamina' ? {...defender.boosts, def: clamp(-6, (defender.boosts.def ?? 0) + 1, 6)} : defender.boosts;

  const pokemon: State.Pokemon = {
    ...defender,
    hp,
    boosts,
    item: endured === 'focussash' ? undefined : defender.item,
    hurtThisTurn: damage > 0 ? true : defender.hurtThisTurn,
  };
  return state.withPokemonAt(state.action.target, pokemon);
}

const STATUS_TYPE_IMMUNITIES: {[status: string]: TypeName[]} = {
  brn: ['Fire'],
  par: ['Electric'],
  psn: ['Poison', 'Steel'],
  tox: ['Poison', 'Steel'],
  frz: ['Ice'],
};

const UNMODELLED_STATUS_ABILITIES = new Set([
  'immunity',
  'limber',
  'waterveil',
  'waterbubble',
  'magmaarmor',
  'insomnia',
  'vitalspirit',
  'comatose',
  'purifyingsalt',
  'thermalexchange',
  'leafguard',
  'flowerveil',
  'sweetveil',
  'shieldsdown',
  'synchronize',
]);

const UNMODELLED_BOOST_ABILITIES = new Set(['contrary', 'simple', 'defiant', 'competitive', 'clearbody', 'whitesmoke', 'fullmetalbody', 'mirrorarmor']);

export function secondaryEffectsOf(move: State.Move): SecondaryEffect[] {
  if (move.secondaries?.length) return move.secondaries;
  return move.secondary ? [move.secondary] : [];
}

function effectiveTypes(pokemon: State.Pokemon): TypeName[] {
  return pokemon.terastallized && pokemon.teraType ? [pokemon.teraType] : [...pokemon.types];
}

export interface SecondaryBranch {
  effects: SecondaryEffect[];
  weight: number;
}

export function secondaryBranches(state: State): SecondaryBranch[] {
  const attacker = state.attacker;
  const defender = state.target;

  if (attacker.ability === 'sheerforce' || defender.ability === 'shielddust') return [{effects: [], weight: 1}];

  const doubled = attacker.ability === 'serenegrace';
  let branches: SecondaryBranch[] = [{effects: [], weight: 1}];

  for (const secondary of secondaryEffectsOf(state.move)) {
    const raw = secondary.chance ?? 100;
    const chance = min(100, doubled ? raw * 2 : raw);

    if (chance >= 100) {
      branches = branches.map(branch => ({effects: [...branch.effects, secondary], weight: branch.weight}));
      continue;
    }

    const divisor = greatestCommonDivisor(chance, 100);
    const hits = chance / divisor;
    const misses = (100 - chance) / divisor;

    branches = branches.flatMap(branch => [
      {effects: [...branch.effects, secondary], weight: branch.weight * hits},
      {effects: branch.effects, weight: branch.weight * misses},
    ]);
  }

  return branches;
}

function applySecondaries(state: State, effects: SecondaryEffect[]): State {
  if (!effects.length) return state;

  let attacker = state.attacker;
  let defender = state.target;
  if (defender.hp <= 0) return state;

  for (const effect of effects) {
    if (effect.status && !defender.status) {
      const immune = STATUS_TYPE_IMMUNITIES[effect.status]?.some(type => effectiveTypes(defender).includes(type));
      if (!immune) defender = {...defender, status: effect.status as State.Pokemon['status']};
    }
    if (effect.volatileStatus && !defender.volatiles[effect.volatileStatus]) {
      defender = {...defender, volatiles: {...defender.volatiles, [effect.volatileStatus]: {}}};
    }
    if (effect.boosts) {
      defender = {...defender, boosts: boostedBy(defender.boosts, effect.boosts)};
    }
    if (effect.self?.boosts) {
      attacker = {...attacker, boosts: boostedBy(attacker.boosts, effect.self.boosts)};
    }
  }

  return state.withPokemonAt(state.action.actor, attacker).withPokemonAt(state.action.target, defender);
}

function boostedBy(current: State.Pokemon['boosts'], delta: Partial<Record<BoostID, number>>): State.Pokemon['boosts'] {
  const boosts = {...current};
  for (const key of Object.keys(delta) as BoostID[]) {
    boosts[key] = clamp(-6, (boosts[key] ?? 0) + (delta[key] ?? 0), 6);
  }
  return boosts;
}

interface AccuracyBranch {
  lands: boolean;
  weight: number;
}

export function accuracyBranches(move: State.Move): AccuracyBranch[] {
  const accuracy = move.accuracy;
  if (accuracy === true || accuracy >= 100) return [{lands: true, weight: 1}];
  if (accuracy <= 0) return [{lands: false, weight: 1}];

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

function critExpansion(reification: Reification, state: State, crits: CritBranch[]): number {
  const context = reification.of(forHit(state, 1));
  return crits.reduce((sum, branch) => sum + branch.weight * damageRolls(context, branch.crit).length, 0);
}

function totalWeight(branches: {weight: number}[]): number {
  return branches.reduce((sum, branch) => sum + branch.weight, 0);
}

function accuracyAxis(opening: Resolution, branches: AccuracyBranch[]): Distribution<Resolution> {
  const distribution = resolutionDistribution();
  distribution.outcomes = branches.map(branch => ({
    data: {...opening, done: !branch.lands, landed: branch.lands, labels: {...opening.labels, crits: 0}},
    count: branch.weight,
  }));
  return distribution;
}

function accumulateHit(into: Map<number, Outcome<Resolution>>, resolution: Resolution, count: number, bounds: HitBounds) {
  const key = packHitKey(resolution, bounds);
  const existing = into.get(key);
  if (existing) existing.count += count;
  else into.set(key, {data: resolution, count});
}

function expandHit(
  into: Map<number, Outcome<Resolution>>,
  reification: Reification,
  opening: Resolution,
  weight: number,
  crits: CritBranch[],
  perHitAccuracy: AccuracyBranch[],
  critExp: number,
  hitMove: State.Move,
  bounds: HitBounds
) {
  const expansion = totalWeight(perHitAccuracy) * critExp;

  if (opening.done || opening.remaining <= 0 || opening.state.target.hp <= 0) {
    accumulateHit(into, {...opening, done: true, remaining: 0}, weight * expansion, bounds);
    return;
  }

  const context = reification.of(opening.state.withMove(hitMove));
  const crittedSoFar = Number(opening.labels.crits ?? 0);
  const remaining = opening.remaining - 1;

  for (const accuracy of perHitAccuracy) {
    if (!accuracy.lands) {
      accumulateHit(into, {...opening, done: true, remaining: 0}, weight * accuracy.weight * critExp, bounds);
      continue;
    }
    for (const branch of crits) {
      const crittedNow = crittedSoFar + (branch.crit ? 1 : 0);
      const labels = {...opening.labels, crits: crittedNow};
      for (const damage of damageRolls(context, branch.crit)) {
        const next: Resolution = {
          state: withDamage(opening.state, damage),
          done: remaining === 0,
          landed: true,
          remaining,
          labels,
        };
        accumulateHit(into, next, weight * accuracy.weight * branch.weight, bounds);
      }
    }
  }
}

function hitCountAxis(opening: Resolution, branches: HitCountBranch[]): Distribution<Resolution> {
  return fromOutcomes(branches.map(branch => ({data: {...opening, remaining: branch.hits}, count: branch.weight})));
}

function hitSequence(
  reification: Reification,
  opening: Resolution,
  crits: CritBranch[],
  hitAccuracy: AccuracyBranch[],
  critExp: number,
  hitBranches: HitCountBranch[]
): Distribution<Resolution> {
  const maxHits = hitBranches.reduce((highest, branch) => max(highest, branch.hits), 0);

  const expansion = totalWeight(hitAccuracy) * critExp;
  const bounds = hitBounds(opening.state.target, maxHits);
  let current = hitCountAxis(opening, hitBranches);

  for (let hit = 1; hit <= maxHits; hit++) {
    const expected = current.totalOutcomes * expansion;
    const hitMove = {...opening.state.move, hit};
    const next = new Map<number, Outcome<Resolution>>();
    for (const outcome of current.outcomes) {
      expandHit(next, reification, outcome.data, outcome.count, crits, hitAccuracy, critExp, hitMove, bounds);
    }
    current = fromOutcomes([...next.values()]).assertMassConserved(expected).normalize();
  }

  return current;
}

function secondaryAxis(opening: Resolution, branches: SecondaryBranch[]): Distribution<Resolution> {
  const distribution = resolutionDistribution();
  distribution.outcomes = branches.map(branch => ({
    data: {...opening, state: applySecondaries(opening.state, branch.effects)},
    count: branch.weight,
  }));
  return distribution;
}

function resolveBranch(reification: Reification, opening: Resolution): Distribution<Resolution> {
  const branched = opening.state;
  const crits = critBranches(branched);
  const hitBranches = hitCountBranches(branched.gen.num, branched.move, branched.attacker);
  const critExp = critExpansion(reification, branched, crits);

  const perHit = accuracyBranches(branched.move);
  const usesPerHitAccuracy = !!branched.move.multiaccuracy;
  const wholeMoveAccuracy = usesPerHitAccuracy ? [{lands: true, weight: 1}] : perHit;
  const hitAccuracy = usesPerHitAccuracy ? perHit : [{lands: true, weight: 1}];
  const secondaries = secondaryBranches(branched);

  const alwaysLands = wholeMoveAccuracy.length === 1 && wholeMoveAccuracy[0].lands;
  const opened: Resolution = {...opening, landed: true, labels: {...opening.labels, crits: 0}};

  const hit = alwaysLands
    ? hitSequence(reification, opened, crits, hitAccuracy, critExp, hitBranches)
    : accuracyAxis(opening, wholeMoveAccuracy).flatMap(entry => (entry.landed ? hitSequence(reification, entry, crits, hitAccuracy, critExp, hitBranches) : single(entry)));

  if (secondaries.length === 1 && !secondaries[0].effects.length) return hit;
  return hit.flatMap(entry => (entry.landed ? secondaryAxis(entry, secondaries) : single(entry)));
}

export function resolveMove(state: State): Distribution<State> {
  assertSupported(state);

  const reification = new Reification();
  const originalMove = state.move;

  const opening = resolutionDistribution();
  opening.outcomes = moveDataBranches(originalMove).map(branch => {
    const labels: LabelValues = {};
    if (branch.label) labels.branch = branch.label;
    return {
      data: {state: withBranch(state, branch), done: false, landed: false, remaining: 0, labels},
      count: branch.weight,
    };
  });

  const resolved =
    opening.outcomes.length === 1
      ? resolveBranch(reification, opening.outcomes[0].data)
      : opening.flatMap(entry => resolveBranch(reification, entry));

  const result = stateDistribution();
  result.outcomes = toStateDistribution(resolved, originalMove);
  return result.assertMassConserved(resolved.totalOutcomes).normalize();
}

export function labelCounts(distribution: Distribution<State>, axis: string): LabelCounts {
  const totals: LabelCounts = {};
  for (const outcome of distribution.outcomes) {
    const counts = outcome.labels?.[axis];
    if (counts) addLabels({[axis]: totals}, {[axis]: counts});
  }
  return totals;
}

export function critCounts(distribution: Distribution<State>): LabelCounts {
  return labelCounts(distribution, 'crits');
}

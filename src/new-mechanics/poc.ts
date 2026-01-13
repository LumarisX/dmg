import {Generation} from '@pkmn/data';
import {applyMod, chain, floor, max, roundDown, shift, trunc} from '../math';
import {is} from '../utils';
import {DMG} from './dmg';
import {EventSpace} from './event-space';
import {DAG} from './dag';
import {StateTree} from './state-tree';

export type HitState = {
  damage: number;
  isCrit: boolean;
  missed: boolean;
  failed: boolean;
  effectiveness: number;
};

export interface Handler<S> {
  basePowerCallback(scope: S): number;
  damageCallback(scope: S): number;
  onAnyBasePower(scope: S): number | undefined;
  onBasePower(scope: S): number | undefined;
  onModifyMove(scope: S): void;
  onModifyAtk(scope: S): number | undefined;
  onModifySpA(scope: S): number | undefined;
  onModifyDef(scope: S): number | undefined;
  onModifySpD(scope: S): number | undefined;
  onModifySpe(scope: S): number | undefined;
  onModifyWeight(scope: S): number | undefined;
  onResidual(scope: S): number | undefined;
  onModifyDamageAttacker(scope: S): number | undefined;
  onModifyDamageDefender(scope: S): number | undefined;
  onUpdate(scope: S): void;
  onModifyMoveStat(scope: S): number | undefined;
  onModifySTAB(scope: S): number | undefined;
  onEffectiveness(scope: S): number | undefined;
  onTryImmunity(scope: S): boolean;
  onEat(scope: S): void;
  onHitActivate(scope: S): boolean;
  onModifyCritRatio(scope: S): number | undefined;
}

const Items: {
  [id: string]: Partial<Handler<DMG.PokemonState>>;
} = {
  sitrusberry: {
    onHitActivate(state) {
      return state.hp <= Math.floor(0.5 * state.data.stats.hp);
    },
    onEat(state) {
      state.hp = Math.min(state.hp + Math.floor(state.data.stats.hp / 4), state.data.stats.hp);
      state.item = null;
    },
  },
  scopelens: {
    onModifyCritRatio(state) {
      return 1;
    },
  },
  lifeorb: {
    onModifyDamageAttacker() {
      return 0x14cc;
    },
    // onAfterMoveSecondarySelf(source, target, move) {
    //   if (source && source !== target && move && move.category !== 'Status') {
    //     this.damage(source.baseMaxhp / 10, source, source, this.dex.getItem('lifeorb'));
    //   }
    // },
  },
  luckypunch: {
    onModifyCritRatio(state) {
      if (state.data.id === 'chansey') {
        return 2;
      }
    },
  },
};

const Moves: {
  [id: string]: Partial<{
    onTryImmunity: (scope: DMG.PokemonState) => boolean;
    basePowerCallback: (scope: DMG.Move) => number;
  }>;
} = {
  poltergeist: {
    onTryImmunity(scope: DMG.PokemonState) {
      return scope.item == null;
    },
  },
  triplekick: {
    basePowerCallback(move) {
      return move.basePower * move.hit;
    },
  },

  tripleaxel: {
    basePowerCallback(move) {
      return move.basePower * move.hit;
    },
  },
};

const Abilities: {
  [id: string]: Partial<{}>;
} = {};

const Conditions: {
  [id: string]: Partial<{}>;
} = {};

export const DMGHANDLERS = {Items, Moves, Abilities, Conditions};

export function calculateDamage(attacker: DMG.PokemonState, target: DMG.PokemonState, move: DMG.Move, hit: HitState): number[] {
  // if (move.onTryImmunity && move.onTryImmunity(context)) return [0];
  // if (move.effectiveness === -5) return [0];
  // if (move.damageCallback) return [move.damageCallback(context)];

  const attackStat = move.overrideOffensiveStat
    ? attacker.data.stats[move.overrideOffensiveStat]
    : is(move.category, 'Physical')
    ? attacker.data.stats.atk
    : is(move.category, 'Special')
    ? attacker.data.stats.spa
    : 0;
  const defenseStat = move.overrideDefensiveStat
    ? target.data.stats[move.overrideDefensiveStat]
    : is(move.category, 'Physical')
    ? target.data.stats.def
    : is(move.category, 'Special')
    ? target.data.stats.spd
    : 0;

  const basePower = Moves[move.id]?.basePowerCallback ? Moves[move.id].basePowerCallback!(move) : move.basePower;

  let baseDamage = getBaseDamage(attacker.data.level, basePower, attackStat, defenseStat);
  // const isSpread = context.gameType !== 'singles' && ['allAdjacent', 'allAdjacentFoes'].includes(move.target);
  // if (isSpread) {
  //   baseDamage = applyMod(baseDamage, 0xc00);
  // }

  // if (attacker.ability?.id === "Parental Bond (Child)") {
  //   baseDamage = applyMod(baseDamage, 0x400);
  // }

  // Convert to weather handler
  // if (context.field.weather?.name === 'Sun' && move.name === 'Hydro Steam' && attacker.item?.id !== 'Utility Umbrella') {
  //   baseDamage = applyMod(baseDamage, 0x1800);
  // } else if (target.item !== 'Utility Umbrella') {
  //   if (
  //     (['Sun', 'Harsh Sunshine'].includes(context.field.weather?.name || '') && move.type === 'Fire') ||
  //     (['Rain', 'Heavy Rain'].includes(context.field.weather?.name || '') && move.type === 'Water')
  //   ) {
  //     baseDamage = applyMod(baseDamage, 0x1800);
  //   } else if (
  //     (context.field.weather?.name === 'Sun' && move.type === 'Water') ||
  //     (context.field.weather?.name === 'Rain' && move.type === 'Fire')
  //   ) {
  //     baseDamage = applyMod(baseDamage, 0x800);
  //   }
  // }
  if (hit.isCrit) {
    baseDamage = applyMod(baseDamage, 0x1800);
  }
  const stabMod = getStabModifier(attacker, move);
  const finalMod = getFinalModifier(attacker, target, move);
  const protect = false;
  const damage = [];

  for (let i = 0; i < 16; i++) {
    let damageAmount = floor(trunc(baseDamage * (85 + i), 32) / 100);
    // If the stabMod would not accomplish anything we avoid applying it because it could cause
    // us to calculate damage overflow incorrectly (DaWoblefet)
    if (stabMod !== 0x1000) damageAmount = trunc(damageAmount * stabMod, 32) / 0x1000;
    damageAmount = floor(trunc(shift(damageAmount, hit.effectiveness), 32));
    // if (attacker.status?.onModifyAtk) damageAmount = applyMod(damageAmount, attacker.status?.onModifyAtk(context) || 0x1000);
    if (protect && move.zMove) damageAmount = applyMod(damageAmount, 0x400);
    damage.push(trunc(roundDown(max(1, trunc(damageAmount * finalMod, 32) / 0x1000)), 16));
  }

  // let rolls: {[key: number]: number} = {};
  // damage.forEach(num => {
  //   rolls[num] = (rolls[num] || 0) + 1;
  // });

  return damage;
}

function getBaseDamage(level: number, basePower: number, attack: number, defense: number) {
  return floor(trunc(floor(trunc(trunc(floor((2 * level) / 5 + 2) * basePower, 32) * attack, 32) / defense) / 50 + 2, 32));
}

function getStabModifier(pokemon: DMG.PokemonState, move: DMG.Move): number {
  let mod = 0x1000;
  // if (pokemon.ability?.onModifySTAB) {
  //   mod = chain(mod, pokemon.ability.onModifySTAB(pokemon));
  // } else
  if (pokemon.types.includes(move.type)) {
    mod = chain(mod, 0x1800);
  }
  // else if (context.p1.pokemon.hasAbility('Protean', 'Libero') && !pokemon.teraType) {
  //   mod += 0x800;
  //   desc.attackerAbility = pokemon.ability;
  // }
  // const teraType = context.p1.pokemon.teraType;
  // if (teraType === move.type && teraType !== 'Stellar') {
  //   mod += 0x800;
  //   desc.attackerTera = teraType;
  // }
  return mod;
}

function getFinalModifier(attacker: DMG.PokemonState, target: DMG.PokemonState, move: DMG.Move): number {
  let mod = 0x1000;
  // if (
  //   !move.crit &&
  //   attacker.ability?.id !== 'infiltrator' &&
  //   ('Aurora Veil' in context.p2.sideConditions ||
  //     (move.category === 'Physical' && 'Reflect' in context.p2.sideConditions) ||
  //     (move.category === 'Special' && 'Light Screen' in context.p2.sideConditions))
  // ) {
  //   mod = chain(mod, context.gameType === 'singles' ? 0x800 : 0xaac);
  // }

  if (attacker.ability?.onModifyDamageAttacker) {
    mod = chain(mod, attacker.ability.onModifyDamageAttacker(attacker));
  }

  // if (target.volatiles.dynamax && ['Dynamax Cannon', 'Behemoth Blade', 'Behemoth Bash'].includes(move.name)) {
  //   mod = chain(mod, 0x2000);
  // }

  // if (target.ability?.onModifyDamageDefender) {
  //   mod = chain(mod, target.ability.onModifyDamageDefender(attacker));
  // }

  // if (context.p2.active?.some(active => active?.ability === 'friendguard')) mod = chain(mod, 0xc00);

  if (attacker.item?.onModifyDamageAttacker) {
    mod = chain(mod, attacker.item.onModifyDamageAttacker(attacker));
  }

  // if (target.item?.onModifyDamageDefender) {
  //   mod = chain(mod, target.item.onModifyDamageDefender(attacker));
  // }

  // double damage moves ie minimize and body slam dragon rush etc, or dive and surf or whirlpool or dig and eq
  return mod;
}

const EFFECTIVENESSBIT: {[key: number]: number} = {
  0: -5,
  0.125: -3,
  0.25: -2,
  0.5: -1,
  1: 0,
  2: 1,
  4: 2,
  8: 3,
};

type StateSerializer = (s: DMG.PokemonState) => string;

const stateFullSerializer: StateSerializer = s => `${s.hp}|${s.types.toString()}|${s.item}|${s.ability}`;
const stateVariantSerializer: StateSerializer = s => `${s.types.toString()}|${s.item}|${s.ability}`;

function getHitOutcomes(
  gen: Generation,
  move: DMG.Move,
  attacker: DMG.PokemonState,
  target: DMG.PokemonState
): Array<{value: HitState; probability: number}> {
  const effectiveness = EFFECTIVENESSBIT[gen.types.totalEffectiveness(move.type, target.types)];
  const initial: HitState = {damage: 0, isCrit: false, missed: false, failed: false, effectiveness};
  const hitSpace = new EventSpace<HitState>(initial, v => {
    let key = v.damage.toString();
    if (v.isCrit) key += '-crit';
    if (v.missed) key += '-miss';
    if (v.failed) key += '-fail';
    return key;
  });

  const moveHandler = Moves[move.id];
  if (moveHandler?.onTryImmunity && moveHandler.onTryImmunity(target)) {
    return [{value: {...initial, failed: true}, probability: 1}];
  }

  const missProbability = move.accuracy === true || move.alwaysHit || (move.hit > 1 && !move.multiaccuracy) ? 0 : (100 - move.accuracy) / 100;
  hitSpace.splitEventByFilter(
    () => true,
    h => {
      h.missed = true;
    },
    missProbability
  );

  const CRITRATES = [0, 1 / 24, 1 / 8, 1 / 2];

  let critRatio = move.critRatio;
  if (attacker.item?.onModifyCritRatio) critRatio += attacker.item.onModifyCritRatio(attacker) ?? 0;

  const critRate = critRatio > CRITRATES.length - 1 ? 1 : CRITRATES[critRatio];

  hitSpace.splitEventByFilter(
    e => !e.missed,
    h => {
      h.isCrit = true;
    },
    critRate
  );

  const damageTransform = (isCrit: boolean) => (hitState: HitState) =>
    calculateDamage(attacker, target, move, hitState).map(d => ({
      transform: (h: HitState) => {
        h.damage = d;
      },
      weight: 1,
    }));

  hitSpace.transformEventByFilterPerEvent(e => !e.missed && e.isCrit, damageTransform(true));

  hitSpace.transformEventByFilterPerEvent(e => !e.missed && !e.isCrit, damageTransform(false));

  return hitSpace.getOutcomes();
}

export type TurnDAG = DAG<EventSpace<DMG.PokemonState>>;
export type TurnTree = StateTree<DMG.PokemonState>;

export type OutcomeWithMetadata = {
  state: DMG.PokemonState;
  probability: number;
  hitMetadata?: {missed: boolean; isCrit: boolean; damage: number};
};

export type TurnResult = {
  tree: TurnTree;
  outcomes: Array<{state: DMG.PokemonState; probability: number}>;
};

export function computeTurn(
  attacker: DMG.Pokemon,
  target: DMG.Pokemon,
  move: DMG.Move,
  previousTree?: TurnTree,
  previousOutcomes?: Array<{state: DMG.PokemonState; probability: number}>
): TurnResult {
  // Determine number of hits
  const hitDistribution: {[key: number]: number} = {};
  if (move.multihit) {
    if (Array.isArray(move.multihit)) {
      if (move.multihit.length == 2 && move.multihit[0] === 2 && move.multihit[1] === 5) {
        hitDistribution[2] = 0.3;
        hitDistribution[3] = 0.3;
        hitDistribution[4] = 0.2;
        hitDistribution[5] = 0.2;
      } else {
        const [minHits, maxHits] = move.multihit;
        const totalWays = maxHits - minHits + 1;
        for (let hits = minHits; hits <= maxHits; hits++) {
          hitDistribution[hits] = 1 / totalWays;
        }
      }
    } else {
      hitDistribution[move.multihit] = 1;
    }
  } else {
    hitDistribution[1] = 1;
  }

  console.log('Hit distribution:', hitDistribution);

  let turnTree: TurnTree;
  if (!previousTree) {
    const rootState = target.states.getOutcomes()[0].value;
    turnTree = new StateTree<DMG.PokemonState>(rootState, stateFullSerializer);
  } else {
    turnTree = previousTree;
  }

  const finalOutcomes: Array<OutcomeWithMetadata> = [];

  // Process each possible hit count from the distribution
  for (const hitCountStr in hitDistribution) {
    const hitCount = parseInt(hitCountStr);
    const hitProbability = hitDistribution[hitCount];

    let currentOutcomes: Array<OutcomeWithMetadata>;
    if (!previousTree) {
      const rootState = target.states.getOutcomes()[0].value;
      currentOutcomes = [{state: rootState, probability: 1}];
    } else {
      currentOutcomes = previousOutcomes ?? [];
    }

    // Process each hit sequentially for this hit count
    for (let hitNum = 0; hitNum < hitCount; hitNum++) {
      move.hit = hitNum + 1;
      const isFirstHit = hitNum === 0 && !previousTree;
      currentOutcomes = processSingleHit(attacker, target, move, turnTree, currentOutcomes, isFirstHit);

      // Stop processing subsequent hits if any outcome missed
      if (hitNum < hitCount - 1) {
        const continuingOutcomes: Array<OutcomeWithMetadata> = [];
        const stoppedOutcomes: Array<OutcomeWithMetadata> = [];

        for (const outcome of currentOutcomes) {
          if (outcome.hitMetadata && !outcome.hitMetadata.missed) {
            continuingOutcomes.push(outcome);
          } else {
            stoppedOutcomes.push(outcome);
          }
        }

        // Add stopped outcomes to final results with distribution weighting
        finalOutcomes.push(...stoppedOutcomes.map(o => ({...o, probability: o.probability * hitProbability})));

        if (continuingOutcomes.length > 0) {
          currentOutcomes = continuingOutcomes;
        } else {
          break;
        }
      }
    }

    // Add remaining outcomes with distribution weighting
    finalOutcomes.push(...currentOutcomes.map(o => ({...o, probability: o.probability * hitProbability})));
  }

  return {tree: turnTree, outcomes: finalOutcomes};
}

function processSingleHit(
  attacker: DMG.Pokemon,
  target: DMG.Pokemon,
  move: DMG.Move,
  turnTree: TurnTree,
  sourceOutcomes: Array<OutcomeWithMetadata>,
  isFirstHit: boolean
): Array<OutcomeWithMetadata> {
  const allOutcomesMap = new Map<
    string,
    {state: DMG.PokemonState; cumulativeProbability: number; hitMetadata?: {missed: boolean; isCrit: boolean; damage: number}}
  >();

  for (const sourceOutcome of sourceOutcomes) {
    const branchSpace = new EventSpace(sourceOutcome.state, stateFullSerializer);
    const hitOutcomes = computeHitOnSpace(attacker, target, move, branchSpace);

    const transformations: Array<{transform: (s: DMG.PokemonState) => DMG.PokemonState; probability: number; metadata?: Record<string, unknown>}> =
      [];

    for (const hitOutcome of hitOutcomes) {
      if (hitOutcome.probability <= 0) continue;

      const sourceId = stateFullSerializer(sourceOutcome.state);
      const targetId = stateFullSerializer(hitOutcome.value.state);

      if (sourceId !== targetId) {
        transformations.push({
          transform: () => hitOutcome.value.state,
          probability: hitOutcome.probability,
          metadata: {
            type: 'damage',
            hpChange: hitOutcome.value.state.hp - sourceOutcome.state.hp,
            itemChange: sourceOutcome.state.item !== hitOutcome.value.state.item,
          },
        });
      }

      const stateId = targetId;
      const accumulatedProb = isFirstHit ? hitOutcome.probability : sourceOutcome.probability * hitOutcome.probability;

      if (!allOutcomesMap.has(stateId)) {
        allOutcomesMap.set(stateId, {state: hitOutcome.value.state, cumulativeProbability: 0, hitMetadata: hitOutcome.value.hitMetadata});
      }
      allOutcomesMap.get(stateId)!.cumulativeProbability += accumulatedProb;
    }

    if (transformations.length > 0) {
      turnTree.addTransformations(sourceOutcome.state, transformations);
    }
  }

  return Array.from(allOutcomesMap.values()).map(({state, cumulativeProbability, hitMetadata}) => ({
    state,
    probability: cumulativeProbability,
    hitMetadata,
  }));
}

function computeHitOnSpace(
  attacker: DMG.Pokemon,
  target: DMG.Pokemon,
  move: DMG.Move,
  hitSpace: EventSpace<DMG.PokemonState>
): Array<{value: {state: DMG.PokemonState; hitMetadata: {missed: boolean; isCrit: boolean; damage: number}}; probability: number}> {
  const targetVariants = hitSpace.projectToSubspace(stateVariantSerializer).getOutcomes();
  const attackerVariants = attacker.states.projectToSubspace(stateVariantSerializer).getOutcomes();

  // Create a map to track hit metadata for each state - must be outside the loop
  const hitMetadataMap = new Map<string, {missed: boolean; isCrit: boolean; damage: number}>();

  for (const targetVariant of targetVariants) {
    const hitOutcomesForTarget: Array<{value: HitState; probability: number}> = [];

    for (const attackerVariant of attackerVariants) {
      const hitOutcomes = getHitOutcomes(attacker.generation, move, attackerVariant.value, targetVariant.value);
      const combinedProbability = attackerVariant.probability * targetVariant.probability;

      for (const hit of hitOutcomes) {
        hitOutcomesForTarget.push({
          value: hit.value,
          probability: hit.probability * combinedProbability,
        });
      }
    }

    hitSpace.transformEventByFilter(
      s => stateVariantSerializer(s) === targetVariant.id,
      hitOutcomesForTarget.map(o => ({
        transform: (state: DMG.PokemonState) => {
          const originalHp = state.hp;
          state.hp = Math.max(state.hp - o.value.damage, 0);
          const actualDamage = originalHp - state.hp;
          hitMetadataMap.set(stateFullSerializer(state), {
            missed: o.value.missed,
            isCrit: o.value.isCrit,
            damage: actualDamage,
          });
        },
        weight: o.probability,
      }))
    );

    const shouldActivateItemEffect = (state: DMG.PokemonState): boolean => {
      return state.hp > 0 && state.item != null && state.item?.onHitActivate?.(state) === true;
    };

    const applyItemEffect = (state: DMG.PokemonState) => {
      if (state.item != null) {
        state.item?.onEat?.(state);
      }
    };

    hitSpace.splitEventByFilter(shouldActivateItemEffect, applyItemEffect, 1.0);
  }

  return hitSpace.getOutcomes().map(outcome => ({
    value: {
      state: outcome.value,
      hitMetadata: hitMetadataMap.get(outcome.id) || {missed: false, isCrit: false, damage: 0},
    },
    probability: outcome.probability,
  }));
}

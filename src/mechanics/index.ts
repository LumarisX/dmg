import type {GameType, Generation, Generations, ID, MoveName, StatID, TypeName} from '@pkmn/data';

import {Context} from '../context';
import {HandlerKind, Handlers, HANDLERS} from '../handlers';
import {parse} from '../parse';
import {Result} from '../result';
import {State} from '../state';
import {computeBoostedStat} from '../stats';
import {has, is} from '../utils';

import {Abilities} from './abilities';
import {Items} from './items';

import {apply, applyMod, chain, floor, max, min, roundDown, shift, trunc} from '../math';

export {Applier, Handler, HandlerKind, Handlers, HANDLERS} from '../handlers';
export {computeStats} from '../stats';

export class Appliers {
  private handlers: Handlers;

  constructor(handlers: Handlers) {
    this.handlers = handlers;
  }

  apply(kind: Exclude<HandlerKind, 'Conditions'>, side: 'p1' | 'p2', id: ID | undefined, state: State, guaranteed?: boolean) {
    if (!id) return;

    switch (kind) {
      case 'Abilities':
      case 'Items':
        return this.handlers[kind][id]?.apply?.(side, state, guaranteed);
      case 'Moves': {
        // If a Move handler is defined, use it, otherwise try to see if an 'apply' function can
        // can be inferred based purely on information from the data files
        const handler = this.handlers.Moves[id];
        if (handler?.apply) return handler.apply(side, state, guaranteed);

        const move = state.gen.moves.get(id);
        if (!move) return;

        const secondaries = move.secondaries ? move.secondaries : move.secondary ? [move.secondary] : undefined;
        if (!secondaries) return;

        for (const secondary of secondaries) {
          if (guaranteed && secondary.chance && secondary.chance < 100) {
            continue;
          }
          // TODO apply secondary! need to take into account Simple etc for boosts, other affects
          // for slot conditions etc
        }
        return;
      }
      default:
        throw new Error(`Invalid handler kind: '${kind}'`);
    }
  }
}

export const APPLIERS = new Appliers(HANDLERS);

// Convenience overload for most programs
export function calculate(
  gen: Generation,
  attacker: State.Pokemon,
  defender: State.Side | State.Pokemon,
  move: State.Move,
  field?: State.Field,
  gameType?: GameType
): Result;
// Convenience overload for humans
export function calculate(gens: Generation | Generations, args: string): Result;
// Main API offered - state can be created and the mutated, handlers can be overriden
export function calculate(state: State, handlers?: Handlers): Result;
export function calculate(...args: any[]) {
  let state: State;
  let handlers = HANDLERS;
  if (args.length > 3) {
    state = State.oneOnOne(args[0], args[1], args[2], args[3], args[4], args[5]);
  } else if (typeof args[1] === 'string') {
    state = parse(args[0], args[1]);
  } else {
    state = args[0];
    handlers = args[1] || handlers;
  }

  // Admittedly, somewhat odd to be creating a result and then letting it get mutated, but
  // this means we don't need to plumb state/handlers/context/relevancy in separately
  // TODO mutate result and actually do calculations - should this part be in mechanics/index?
  const result = new Result(state, handlers); // TODO handle multihit / parental bond etc
  return result;
}

export function bondsWith(move: Pick<State.Move, 'category' | 'multihit' | 'flags' | 'isZ' | 'isMax'>): boolean {
  if (move.category === 'Status') return false;
  if (move.multihit) return false;
  if (move.isZ || move.isMax) return false;
  const flags = move.flags as {[flag: string]: unknown} | undefined;
  return !flags?.noparentalbond && !flags?.charge && !flags?.futuremove;
}

function offensiveStatId(move: Context['move']): StatID | undefined {
  if (move.overrideOffensiveStat) return move.overrideOffensiveStat;
  if (is(move.category, 'Physical')) return 'atk';
  if (is(move.category, 'Special')) return 'spa';
  return undefined;
}

function defensiveStatId(move: Context['move']): StatID | undefined {
  if (move.overrideDefensiveStat) return move.overrideDefensiveStat;
  if (is(move.category, 'Physical')) return 'def';
  if (is(move.category, 'Special')) return 'spd';
  return undefined;
}

function offensiveBoost(context: Context, stat: StatID): number {
  const move = context.move;
  if (move.ignoreOffensive || stat === 'hp') return 0;
  const boost = context.attacker.boosts[stat] ?? 0;
  if (boost < 0 && (move.ignoreNegativeOffensive || move.crit)) return 0;
  return boost;
}

function defensiveBoost(context: Context, stat: StatID): number {
  const move = context.move;
  if (move.ignoreDefensive || stat === 'hp') return 0;
  const boost = context.target.boosts[stat] ?? 0;
  if (boost > 0 && (move.ignorePositiveDefensive || move.crit)) return 0;
  return boost;
}

export function calculateDamage(context: Context | State): number | number[] {
  if (!('relevant' in context)) context = Context.fromState(context);

  if (context.move.onTryImmunity && context.move.onTryImmunity(context)) return 0;
  if (context.field.weather?.onTryImmunity?.(context)) return 0;
  if (context.move.effectiveness === -5) return 0;
  if (context.move.damageCallback) return context.move.damageCallback(context);

  const offensiveStat = offensiveStatId(context.move);
  const defensiveStat = defensiveStatId(context.move);

  const attackStat = offensiveStat
    ? computeBoostedStat(context.attacker.stats[offensiveStat], offensiveBoost(context, offensiveStat), context.gen)
    : 0;
  const defenseStat = defensiveStat
    ? computeBoostedStat(context.target.stats[defensiveStat], defensiveBoost(context, defensiveStat), context.gen)
    : 0;

  let baseDamage = getBaseDamage(context.attacker.level, context.move.basePower, attackStat, defenseStat);
  const isSpread = context.gameType !== 'singles' && ['allAdjacent', 'allAdjacentFoes'].includes(context.move.target);
  if (isSpread) {
    baseDamage = applyMod(baseDamage, 0xc00);
  }

  if (context.attacker.ability?.id === 'parentalbond' && (context.move.hit ?? 1) > 1 && bondsWith(context.move)) {
    baseDamage = applyMod(baseDamage, context.gen.num > 6 ? 0x400 : 0x800);
  }

  baseDamage = apply(baseDamage, context.field.weather?.onWeatherModifyDamage?.(context));
  if (context.move.crit) {
    baseDamage = applyMod(baseDamage, 0x1800);
  }
  const stabMod = getStabModifier(context);
  const finalMod = getFinalModifier(context);
  const protect = false;
  const damage = [];

  for (let i = 0; i < 16; i++) {
    let damageAmount = floor(trunc(baseDamage * (85 + i), 32) / 100);
    // If the stabMod would not accomplish anything we avoid applying it because it could cause
    // us to calculate damage overflow incorrectly (DaWoblefet)
    if (stabMod !== 0x1000) damageAmount = applyMod(damageAmount, stabMod);
    damageAmount = floor(trunc(shift(damageAmount, context.move.effectiveness), 32));
    if (context.attacker.status?.onModifyAtk) damageAmount = applyMod(damageAmount, context.attacker.status?.onModifyAtk(context) || 0x1000);
    if (protect && context.move.zMove) damageAmount = applyMod(damageAmount, 0x400);
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

function getStabModifier(context: Context) {
  const attacker = context.attacker;
  const type = context.move.type;
  if (type === '???') return 0x1000;

  const tera = attacker.terastallized ? attacker.teraType : undefined;
  const isStab = attacker.types.includes(type) || attacker.baseTypes.includes(type) || is(attacker.ability?.id, 'protean', 'libero');

  let mod = isStab ? 0x1800 : 0x1000;
  if (tera === type && attacker.baseTypes.includes(type)) mod = 0x2000;

  if (attacker.ability?.onModifySTAB) {
    const modified = attacker.ability.onModifySTAB(attacker);
    if (modified !== undefined) mod = modified;
  }
  return mod;
}

function getFinalModifier(context: Context): number {
  let mod = 0x1000;
  if (
    !context.move.crit &&
    context.attacker.ability?.id !== 'infiltrator' &&
    ('Aurora Veil' in context.targetSide.sideConditions ||
      (context.move.category === 'Physical' && 'Reflect' in context.targetSide.sideConditions) ||
      (context.move.category === 'Special' && 'Light Screen' in context.targetSide.sideConditions))
  ) {
    mod = chain(mod, context.gameType === 'singles' ? 0x800 : 0xaac);
  }

  if (context.attacker.ability?.onModifyDamageAttacker) {
    mod = chain(mod, context.attacker.ability.onModifyDamageAttacker(context.attacker));
  }

  if (context.target.volatiles.dynamax && ['Dynamax Cannon', 'Behemoth Blade', 'Behemoth Bash'].includes(context.move.name)) {
    mod = chain(mod, 0x2000);
  }

  if (context.target.ability?.onModifyDamageDefender) {
    mod = chain(mod, context.target.ability.onModifyDamageDefender(context.attacker));
  }

  if (context.targetSide.allies?.some(ally => ally?.ability === 'friendguard')) mod = chain(mod, 0xc00);

  if (context.attacker.item?.onModifyDamageAttacker) {
    mod = chain(mod, context.attacker.item.onModifyDamageAttacker(context.attacker));
  }

  if (context.target.item?.onModifyDamageDefender) {
    mod = chain(mod, context.target.item.onModifyDamageDefender(context.attacker));
  }

  // double damage moves ie minimize and body slam dragon rush etc, or dive and surf or whirlpool or dig and eq
  return mod;
}

export function computeModifiedSpeed(context: Context | State) {
  context = 'relevant' in context ? context : Context.fromState(context);
  const side = context.attackerSide;
  const pokemon = context.attacker;
  let spe = computeBoostedStat(pokemon.stats?.spe || 0, pokemon.boosts.spe || 0, context.gen);
  let mod = 0x1000;
  const ability = pokemon.ability && Abilities[pokemon.ability.id];
  if (ability?.onModifySpe) mod = chain(mod, ability.onModifySpe(pokemon));
  const item = pokemon.item && Items[pokemon.item.id];
  if (item?.onModifySpe) mod = chain(mod, item.onModifySpe(pokemon));
  if (side.sideConditions['tailwind']) mod = chain(mod, 0x2000);
  if (side.sideConditions['grasspledge']) mod = chain(mod, 0x400);
  spe = trunc(apply(spe, mod), 16);
  return context.gen.num <= 2 ? min(max(spe, 1), 999) : min(spe, 10000);
}

export function computeModifiedWeight(pokemon: Context.Pokemon | State.Pokemon) {
  const autotomize = pokemon.volatiles.autotomize?.level || 0;
  let weighthg = max(1, pokemon.weighthg - 1000 * autotomize);
  if (pokemon.ability === 'heavymetal') {
    weighthg *= 2;
  } else if (pokemon.ability === 'lightmetal') {
    weighthg = floor(weighthg / 2);
  }
  if (pokemon.item === 'floatstone') {
    weighthg = floor(weighthg / 2);
  }
  return weighthg;
}

const Z_MOVES: {[type in Exclude<TypeName, '???' | 'Stellar'>]: string} = {
  Bug: 'Savage Spin-Out',
  Dark: 'Black Hole Eclipse',
  Dragon: 'Devastating Drake',
  Electric: 'Gigavolt Havoc',
  Fairy: 'Twinkle Tackle',
  Fighting: 'All-Out Pummeling',
  Fire: 'Inferno Overdrive',
  Flying: 'Supersonic Skystrike',
  Ghost: 'Never-Ending Nightmare',
  Grass: 'Bloom Doom',
  Ground: 'Tectonic Rage',
  Ice: 'Subzero Slammer',
  Normal: 'Breakneck Blitz',
  Poison: 'Acid Downpour',
  Psychic: 'Shattered Psyche',
  Rock: 'Continental Crush',
  Steel: 'Corkscrew Crash',
  Water: 'Hydro Vortex',
};

export function getZMoveName(
  gen: Generation,
  move: State.Move,
  pokemon: {
    species?: {name: string};
    item?: string;
  } = {}
) {
  if (gen.num < 7) {
    throw new TypeError(`Z-Moves do not exist in gen ${gen.num}`);
  }
  if (pokemon.item) {
    const item = gen.items.get(pokemon.item);
    const matching = item?.zMove && has(item.itemUser, pokemon.species?.name) && item.zMoveFrom === move.name;
    if (matching) return item.zMove;
  }
  return Z_MOVES[move.type as Exclude<TypeName, '???' | 'Stellar'>];
}

const MAX_MOVES: {[type in Exclude<TypeName, '???' | 'Stellar'>]: string} = {
  Bug: 'Max Flutterby',
  Dark: 'Max Darkness',
  Dragon: 'Max Wyrmwind',
  Electric: 'Max Lightning',
  Fairy: 'Max Starfall',
  Fighting: 'Max Knuckle',
  Fire: 'Max Flare',
  Flying: 'Max Airstream',
  Ghost: 'Max Phantasm',
  Grass: 'Max Overgrowth',
  Ground: 'Max Quake',
  Ice: 'Max Hailstorm',
  Normal: 'Max Strike',
  Poison: 'Max Ooze',
  Psychic: 'Max Mindstorm',
  Rock: 'Max Rockfall',
  Steel: 'Max Steelspike',
  Water: 'Max Geyser',
};

export function getMaxMovename(
  gen: Generation,
  move: State.Move,
  pokemon: {
    species?: {isGigantamax: MoveName};
    item?: string;
  } = {}
) {
  if (gen.num < 8) {
    throw new TypeError(`Max Moves do not exist in gen ${gen.num}`);
  }
  if (move.category === 'Status') return 'Max Guard';
  if (pokemon.species?.isGigantamax) {
    const gmaxMove = gen.moves.get(pokemon.species.isGigantamax)!;
    if (move.type === gmaxMove.type) return pokemon.species.isGigantamax;
  }
  return MAX_MOVES[move.type as Exclude<TypeName, '???' | 'Stellar'>];
}

export {Distribution, NumberDistribution, ProbabilityMassError, ExactHorizonError} from '../distribution';
export type {Keyer, Outcome} from '../distribution';

// function takeItem(pokemon: State.Pokemon | Context.Pokemon, boost: BoostID, amount: number) {
//   if (pokemon.ability === 'sticky') {

//   }
//   // mega item

// }

// function setAbility(ability: string | Ability, source?: Pokemon | null, isFromFormeChange?: boolean) {
//     if (!this.hp) return false;
//     if (typeof ability === 'string') ability = this.battle.dex.getAbility(ability);
//     const oldAbility = this.ability;
//     if (!isFromFormeChange) {
//       const abilities = [
//         'battlebond', 'comatose', 'disguise', 'gulpmissile', 'hungerswitch', 'iceface',
//         'multitype', 'powerconstruct', 'rkssystem', 'schooling', 'shieldsdown', 'stancechange',
//       ];
//       if (ability.id === 'illusion' ||
//           abilities.includes(ability.id) ||
//           abilities.includes(oldAbility)) {
//         return false;
//       }
//       if (this.battle.gen >= 7 && (ability.id === 'zenmode' || oldAbility === 'zenmode')) {
//         return false;
//       }
//     }

// function ignoringItem() {
//   return !!((this.battle.gen >= 5 && !this.isActive) ||
//     (this.hasAbility('klutz') && !this.getItem().ignoreKlutz) ||
//     this.volatiles['embargo'] || this.battle.field.pseudoWeather['magicroom']);
// }

//  function isGrounded(negateImmunity = false) {
//     if ('gravity' in this.battle.field.pseudoWeather) return true;
//     if ('ingrain' in this.volatiles && this.battle.gen >= 4) return true;
//     if ('smackdown' in this.volatiles) return true;
//     const item = (this.ignoringItem() ? '' : this.item);
//     if (item === 'ironball') return true;
//     // If a Fire/Flying type uses Burn Up and Roost, it becomes ???/Flying-type,
//     // but it's still grounded.
//     if (!negateImmunity && this.hasType('Flying') && !('roost' in this.volatiles)) return false;
//     if (this.hasAbility('levitate') && !this.battle.suppressingAttackEvents()) return null;
//     if ('magnetrise' in this.volatiles) return false;
//     if ('telekinesis' in this.volatiles) return false;
//     return item !== 'airballoon';
//   }

//  function effectiveWeather() {
//     const weather = this.battle.field.effectiveWeather();
//     switch (weather) {
//     case 'sunnyday':
//     case 'raindance':
//     case 'desolateland':
//     case 'primordialsea':
//       if (this.hasItem('utilityumbrella')) return '';
//     }
//     return weather;
//   }

//  function ignoringAbility() {
//     const abilities = [
//       'battlebond', 'comatose', 'disguise', 'gulpmissile', 'multitype', 'powerconstruct',
//       'rkssystem', 'schooling', 'shieldsdown', 'stancechange',
//     ];
//     // Check if any active pokemon have the ability Neutralizing Gas
//     let neutralizinggas = false;
//     for (const pokemon of this.battle.getAllActive()) {
//       // can't use hasAbility because it would lead to infinite recursion
//       if (pokemon.ability === ('neutralizinggas' as ID) && !pokemon.volatiles['gastroacid'] &&
//         !pokemon.abilityData.ending) {
//         neutralizinggas = true;
//         break;
//       }
//     }

//     return !!(
//       (this.battle.gen >= 5 && !this.isActive) ||
//       ((this.volatiles['gastroacid'] ||
//         (neutralizinggas && this.ability !== ('neutralizinggas' as ID))) &&
//       !abilities.includes(this.ability))
//     );
//   }

// TODO white herb, mist, WONDER ROOM
// function applyBoost(pokemon: State.Pokemon | Context.Pokemon, boost: BoostID, amount: number) {
//   const ability = 'relevant' in pokemon ? pokemon.ability?.id : pokemon.ability;
//   let mod = 1;
//   if (is(ability, 'simple')) {
//     mod = 2;
//   } else if (is(ability, 'contrary')) {
//     mod *= -1;
//   } else if (is(ability, 'defiant') && amount < 0) {
//     pokemon.boosts.atk = clamp(-6, pokemon.boosts.atk + 2, 6);
//   } else if (is(ability, 'competitive') && amount < 0) {
//     pokemon.boosts.spa = clamp(-6, pokemon.boosts.spa + 2, 6);
//   }
//   pokemon.boosts[boost] = clamp(-6, pokemon.boosts[boost] + mod * amount, 6);

// }

// function is(x: string | string[] | undefined, ...xs: string[]) {
//   return !!(x && (Array.isArray(x) ? x.some(y => xs.includes(y)) : xs.includes(x)));
// }

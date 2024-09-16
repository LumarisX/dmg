import type {GameType, Generation, Generations, ID, MoveName, StatsTable, TypeName} from '@pkmn/data';

import {Context} from '../context';
import {parse} from '../parse';
import {HitResult, Result} from '../result';
import {State} from '../state';
import {DeepReadonly, has} from '../utils';

import {Abilities} from './abilities';
import {Conditions} from './conditions';
import {Items} from './items';
import {Moves} from './moves';

import {abs, apply, applyMod, chain, clamp, floor, max, min, roundDown, trunc} from '../math';

export interface Applier {
  apply(side: 'p1' | 'p2', state: State, guaranteed?: boolean): void;
}

export interface Handler<C> {
  basePowerCallback(context: C): number;
  damageCallback(context: C): number;
  onAnyBasePower(context: C): number | undefined;
  onBasePower(context: C): number | undefined;

  onModifyAtk(pokemon: C): number | undefined;
  onModifySpA(pokemon: C): number | undefined;
  onModifyDef(pokemon: C): number | undefined;
  onModifySpD(pokemon: C): number | undefined;
  onModifySpe(pokemon: C): number | undefined;
  onModifyWeight(pokemon: C): number | undefined;

  onResidual(pokemon: C): number | undefined;

  onModifyDamageAttacker(context: C): number | undefined;
  onModifyDamageDefender(context: C): number | undefined;

  onModifySTAB(context: C): number | undefined;

  onEffectiveness(context: C): number | undefined;

  /** Returns true if the target is immune. */
  onTryImmunity(context: Context): boolean;
}

export type HandlerKind = 'Abilities' | 'Items' | 'Moves' | 'Conditions';
export type Handlers = typeof HANDLERS;
export const HANDLERS = {Abilities, Conditions, Items, Moves};

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

// Unnecessary?
// export const HANDLER_FNS: Set<keyof Handler<Context>> = new Set([
//   "basePowerCallback",
//   "damageCallback",
//   "onBasePower",
//   "onModifyAtk",
//   "onModifySpA",
//   "onModifyDef",
//   "onModifySpD",
//   "onModifySpe",
//   "onModifyWeight",
//   "onModifyDamageAttacker",
//   "onResidual",
// ]);

// Convenience overload for most programs
export function calculate(
  gen: Generation,
  attacker: State.Side | State.Pokemon,
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
    state = new State(args[0], args[1], args[2], args[3], args[4], args[5]);
  } else if (typeof args[1] === 'string') {
    state = parse(args[0], args[1]);
  } else {
    state = args[0];
    handlers = args[1] || handlers;
  }

  // Admittedly, somewhat odd to be creating a result and then letting it get mutated, but
  // this means we don't need to plumb state/handlers/context/relevancy in separately
  // TODO mutate result and actually do calculations - should this part be in mechanics/index?
  const result = new Result(state as DeepReadonly<State>, handlers); // TODO handle multihit / parental bond etc
  return result;
}

export function calculateDamage(context: Context | State): number | [number, number][] {
  if (!('relevant' in context)) context = Context.fromState(context);

  if (context.move.onTryImmunity && context.move.onTryImmunity(context)) return 0;
  if (context.move.effectiveness === -5) return 0;
  if (context.move.damageCallback) return context.move.damageCallback(context);

  let attackStat = 0;
  let defenseStat = 0;

  if (context.move.category === 'Physical') {
    attackStat = context.p1.pokemon.stats?.atk;
    defenseStat = context.p2.pokemon.stats?.def;
  } else if (context.move.category === 'Special') {
    attackStat = context.p1.pokemon.stats?.spa;
    defenseStat = context.p2.pokemon.stats?.spd;
  }

  let baseDamage = getBaseDamage(context.p1.pokemon.level, context.move.basePower, attackStat, defenseStat);

  const isSpread = context.gameType !== 'singles' && ['allAdjacent', 'allAdjacentFoes'].includes(context.move.target);
  if (isSpread) {
    baseDamage = applyMod(baseDamage, 0xc00);
  }

  // if (context.p1.pokemon.ability?.id === "Parental Bond (Child)") {
  //   baseDamage = applyMod(baseDamage, 0x400);
  // }

  // Convert to weather handler
  if (context.field.weather?.name === 'Sun' && context.move.name === 'Hydro Steam' && context.p1.pokemon.item?.id !== 'Utility Umbrella') {
    baseDamage = applyMod(baseDamage, 0x1800);
  } else if (context.p2.pokemon.item?.id !== 'Utility Umbrella') {
    if (
      (['Sun', 'Harsh Sunshine'].includes(context.field.weather?.name || '') && context.move.type === 'Fire') ||
      (['Rain', 'Heavy Rain'].includes(context.field.weather?.name || '') && context.move.type === 'Water')
    ) {
      baseDamage = applyMod(baseDamage, 0x1800);
    } else if (
      (context.field.weather?.name === 'Sun' && context.move.type === 'Water') ||
      (context.field.weather?.name === 'Rain' && context.move.type === 'Fire')
    ) {
      baseDamage = applyMod(baseDamage, 0x800);
    }
  }
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
    if (stabMod !== 0x1000) damageAmount = trunc(damageAmount * stabMod, 32) / 0x1000;
    damageAmount = floor(trunc(damageAmount << context.move.effectiveness, 32));
    if (context.p1.pokemon.status?.onModifyAtk) damageAmount = applyMod(damageAmount, context.p1.pokemon.status?.onModifyAtk(context) || 0x1000);
    if (protect && context.move.zMove) damageAmount = applyMod(damageAmount, 0x400);
    damage.push(trunc(roundDown(max(1, trunc(damageAmount * finalMod, 32) / 0x1000)), 16));
  }

  let rolls: {[key: number]: number} = {};
  damage.forEach(num => {
    rolls[num] = (rolls[num] || 0) + 1;
  });
  return Object.entries(rolls).map(([num, count]) => [parseInt(num), count]);
}

function getBaseDamage(level: number, basePower: number, attack: number, defense: number) {
  return floor(trunc(floor(trunc(trunc(floor((2 * level) / 5 + 2) * basePower, 32) * attack, 32) / defense) / 50 + 2, 32));
}

function getStabModifier(context: Context) {
  let mod = 0x1000;
  if (context.p1.pokemon.ability?.onModifySTAB) {
    mod = chain(mod, context.p1.pokemon.ability.onModifySTAB(context.p1.pokemon));
  } else if (context.p1.pokemon.types.includes(context.move.type)) {
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

function getFinalModifier(context: Context): number {
  let mod = 0x1000;
  if (
    !context.move.crit &&
    context.p1.pokemon.ability?.id !== 'infiltrator' &&
    ('Aurora Veil' in context.p2.sideConditions ||
      (context.move.category === 'Physical' && 'Reflect' in context.p2.sideConditions) ||
      (context.move.category === 'Special' && 'Light Screen' in context.p2.sideConditions))
  ) {
    mod = chain(mod, context.gameType === 'singles' ? 0x800 : 0xaac);
  }

  if (context.p1.pokemon.ability?.onModifyDamageAttacker) {
    mod = chain(mod, context.p1.pokemon.ability.onModifyDamageAttacker(context.p1.pokemon));
  }

  if (context.p2.pokemon.volatiles.dynamax && ['Dynamax Cannon', 'Behemoth Blade', 'Behemoth Bash'].includes(context.move.name)) {
    mod = chain(mod, 0x2000);
  }

  if (context.p2.pokemon.ability?.onModifyDamageDefender) {
    mod = chain(mod, context.p2.pokemon.ability.onModifyDamageDefender(context.p1.pokemon));
  }

  if (context.p2.active?.some(active => active?.ability === 'friendguard')) mod = chain(mod, 0xc00);

  if (context.p1.pokemon.item?.onModifyDamageAttacker) {
    mod = chain(mod, context.p1.pokemon.item.onModifyDamageAttacker(context.p1.pokemon));
  }

  if (context.p2.pokemon.item?.onModifyDamageDefender) {
    mod = chain(mod, context.p2.pokemon.item.onModifyDamageDefender(context.p1.pokemon));
  }

  // double damage moves ie minimize and body slam dragon rush etc, or dive and surf or whirlpool or dig and eq
  return mod;
}

// FIXME: other modifiers beyond just boosts
export function computeStats(gen: Generation, pokemon: State.Pokemon) {
  const stats = {} as StatsTable;
  if (pokemon.stats) {
    for (const stat of gen.stats) {
      stats[stat] = stat === 'hp' ? pokemon.stats[stat] : computeBoostedStat(pokemon.stats[stat], pokemon.boosts?.[stat] || 0, gen);
    }
    return stats;
  } else {
    for (const stat of gen.stats) {
      stats[stat] = gen.stats.calc(
        stat,
        pokemon.species.baseStats[stat],
        pokemon.ivs?.[stat] ?? 31,
        pokemon.evs?.[stat] ?? (gen.num <= 2 ? 252 : 0),
        pokemon.level,
        gen.natures.get(pokemon.nature!)
      );
      if (stat !== 'hp') {
        stats[stat] = computeBoostedStat(stats[stat], pokemon.boosts?.[stat] || 0, gen);
      }
    }
  }
  return stats;
}

const LEGACY_BOOSTS = [25, 28, 33, 40, 50, 66, 100, 150, 200, 250, 300, 350, 400];

function computeBoostedStat(stat: number, mod: number, gen?: Generation) {
  if (gen && gen.num <= 2) {
    return clamp(1, (stat * LEGACY_BOOSTS[mod + 6]) / 100, 999);
  }
  return floor(trunc(stat * (mod >= 0 ? 2 + mod : 2), 16) / (mod >= 0 ? 2 : abs(mod) + 2));
}

export function computeModifiedSpeed(context: Context | State) {
  context = 'relevant' in context ? context : Context.fromState(context);
  const {p1} = context;
  let spe = computeBoostedStat(p1.pokemon.stats?.spe || 0, p1.pokemon.boosts.spe || 0, context.gen);
  let mod = 0x1000;
  const ability = p1.pokemon.ability && Abilities[p1.pokemon.ability.id];
  if (ability?.onModifySpe) mod = chain(mod, ability.onModifySpe(p1.pokemon));
  const item = p1.pokemon.item && Items[p1.pokemon.item.id];
  if (item?.onModifySpe) mod = chain(mod, item.onModifySpe(p1.pokemon));
  if (p1.sideConditions['tailwind']) mod = chain(mod, 0x2000);
  if (p1.sideConditions['grasspledge']) mod = chain(mod, 0x400);
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

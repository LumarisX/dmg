import {applyMod, chain, floor, max, roundDown, shift, trunc} from '../math';
import {is} from '../utils';
import {DMG} from './dmg';
import {EventSpace} from './event-space';

type HitState = {
  damage: number;
  isCrit: boolean;
  missed: boolean;
  failed: boolean;
};

export interface Handler<S> {
  onHitActivate(scope: S): boolean;
  onEat(scope: S): void;
}

const Items: {
  [id: string]: Partial<Handler<DMG.PokemonState>>;
} = {
  sitrusberry: {
    onHitActivate(state) {
      return state.hp <= Math.floor(0.5 * state.stats.hp);
    },
    onEat(state) {
      state.hp = Math.min(state.hp + Math.floor(state.stats.hp / 4), state.stats.hp);
      state.item = null;
    },
  },
};

const Moves: {
  [id: string]: Partial<{
    onTryImmunity: (scope: DMG.PokemonState) => boolean;
  }>;
} = {
  poltergeist: {
    onTryImmunity(scope: DMG.PokemonState) {
      return scope.item == null;
    },
  },
};

export function calculateDamage(attacker: DMG.PokemonState, target: DMG.PokemonState, move: DMG.Move, hit: HitState): number[] {
  // if (move.onTryImmunity && move.onTryImmunity(context)) return [0];
  // if (move.effectiveness === -5) return [0];
  // if (move.damageCallback) return [move.damageCallback(context)];

  const attackStat = move.overrideOffensiveStat
    ? attacker.stats[move.overrideOffensiveStat]
    : is(move.category, 'Physical')
    ? attacker.stats.atk
    : is(move.category, 'Special')
    ? attacker.stats.spa
    : 0;
  const defenseStat = move.overrideDefensiveStat
    ? target.stats[move.overrideDefensiveStat]
    : is(move.category, 'Physical')
    ? target.stats.def
    : is(move.category, 'Special')
    ? target.stats.spd
    : 0;

  let baseDamage = getBaseDamage(attacker.level, move.basePower, attackStat, defenseStat);
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
    const effectiveness = 1;
    damageAmount = floor(trunc(shift(damageAmount, effectiveness), 32));
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

  // if (attacker.ability?.onModifyDamageAttacker) {
  //   mod = chain(mod, attacker.ability.onModifyDamageAttacker(attacker));
  // }

  // if (target.volatiles.dynamax && ['Dynamax Cannon', 'Behemoth Blade', 'Behemoth Bash'].includes(move.name)) {
  //   mod = chain(mod, 0x2000);
  // }

  // if (target.ability?.onModifyDamageDefender) {
  //   mod = chain(mod, target.ability.onModifyDamageDefender(attacker));
  // }

  // if (context.p2.active?.some(active => active?.ability === 'friendguard')) mod = chain(mod, 0xc00);

  // if (attacker.item?.onModifyDamageAttacker) {
  //   mod = chain(mod, attacker.item.onModifyDamageAttacker(attacker));
  // }

  // if (target.item?.onModifyDamageDefender) {
  //   mod = chain(mod, target.item.onModifyDamageDefender(attacker));
  // }

  // double damage moves ie minimize and body slam dragon rush etc, or dive and surf or whirlpool or dig and eq
  return mod;
}

function getHitOutcomes(move: DMG.Move, attacker: DMG.PokemonState, target: DMG.PokemonState) {
  const inital: HitState = {damage: 0, isCrit: false, missed: false, failed: false};
  const hitSpace = new EventSpace<HitState>(inital, v => {
    let key = v.damage.toString();
    if (v.isCrit) key += '-crit';
    if (v.missed) key += '-miss';
    if (v.failed) key += '-fail';
    return key;
  });

  const moveHandler = Moves[move.id];
  hitSpace.splitEventByFilter(
    e => true,
    h => (h.failed = moveHandler?.onTryImmunity ? moveHandler.onTryImmunity(target) : false),
    1
  );

  // Split off miss chance using filter
  hitSpace.splitEventByFilter(
    e => !e.failed,
    h => (h.missed = true),
    move.accuracy === true || move.alwaysHit ? 0 : (100 - move.accuracy) / 100
  );

  // Split crit from regular hits using filter
  hitSpace.splitEventByFilter(
    e => !e.failed && !e.missed,
    h => (h.isCrit = true),
    move.critChance
  );

  hitSpace.distributeEventByFilterPerEvent(
    e => !e.failed && !e.missed,
    (hitState: HitState) =>
      calculateDamage(attacker, target, move, hitState).map(d => ({
        value: {damage: d},
        weight: 1,
      }))
  );

  return hitSpace.getOutcomes();
}

export function computeTurn(attacker: DMG.Pokemon, target: DMG.Pokemon, move: DMG.Move) {
  const attackerOutcomes = attacker.states.getOutcomes();
  const targetOutcomes = target.states.getOutcomes();

  for (const tEvent of targetOutcomes) {
    const hitOutcomesForTarget: Array<{value: HitState; probability: number}> = [];

    for (const aEvent of attackerOutcomes) {
      const hitOutcomes = getHitOutcomes(move, aEvent.value, tEvent.value);

      const combinedProbability = aEvent.probability * tEvent.probability;
      for (const hit of hitOutcomes) {
        hitOutcomesForTarget.push({
          value: hit.value,
          probability: hit.probability * combinedProbability,
        });
      }
    }

    // console.table(
    //   hitOutcomesForTarget.map(o => ({
    //     ...o.value,
    //     probability: `${Math.round(o.probability * 1000) / 100}%`,
    //   }))
    // );

    target.states.distributeEvent(
      tEvent.value,
      hitOutcomesForTarget.map(o => ({
        value: (d: DMG.PokemonState) => ({
          hp: Math.max(d.hp - o.value.damage, 0),
        }),
        weight: o.probability,
      }))
    );

    target.states.splitEventByFilter(
      state => (state.hp > 0 && state.item && Items[state.item] && Items[state.item].onHitActivate ? Items[state.item].onHitActivate!(state) : false),
      state => {
        if (state.item && Items[state.item] && Items[state.item].onEat) Items[state.item].onEat!(state);
      },
      1.0
    );
  }
}

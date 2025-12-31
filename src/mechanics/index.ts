import type {GameType, Generation, Generations, ID, MoveName, StatsTable, TypeName} from '@pkmn/data';

import {Context} from '../context';
import {parse} from '../parse';
import {Relevancy, Result} from '../result';
import {State} from '../state';
import {DeepReadonly, has, is} from '../utils';

import {Abilities} from './abilities';
import {Conditions} from './conditions';
import {Items} from './items';
import {Moves} from './moves';

import {abs, apply, applyMod, chain, clamp, floor, max, min, round, roundDown, shift, trunc} from '../math';

export interface Applier {
  apply(side: 'p1' | 'p2', state: State, guaranteed?: boolean): void;
}

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
  const result = new Result(state, handlers); // TODO handle multihit / parental bond etc
  return result;
}

//Added by lumaris for testing with draftzone
export function pdzCalculateMove(gen: Generation, p: State.Pokemon, m: State.Move) {
  const relevancy = new Relevancy();
  const move = new Context.Move(m, relevancy.move);
  const pokemon = new Context.Pokemon(gen, p as DeepReadonly<State.Pokemon>, relevancy.p1.pokemon, {move});
  move.pdzUpdateData(gen, pokemon);
  const strength = pdzCalculateStrength(pokemon);
  return {move, pokemon, strength};
}

const CRIT_KEY: number[] = [0, 1, 3, 12] as const;
const situationalMoves = ['steelroller', 'dreameater'];

export function pdzEffectivePowerModifier(move: Context.Move) {
  let value = 1;
  if (move.accuracy !== true && move.accuracy < 100) value *= move.accuracy / 100;
  value *= !move.willCrit && move.critRatio && move.critRatio < CRIT_KEY.length ? 1 + (1.5 * CRIT_KEY[move.critRatio]) / 24 : 1.5;
  if (Array.isArray(move.multihit)) {
    if (move.multihit[0] === 2 && move.multihit[1] === 5) value *= 3.3;
    else value *= (move.multihit[0] + move.multihit[1]) / 2;
  } else if (typeof move.multihit === 'number' && move.multihit > 1) value *= move.multihit;
  if (move.condition?.duration) value /= move.condition.duration === 1 ? 4 : 2;
  if ('charge' in move.flags || 'recharge' in move.flags) value *= 0.5;
  if (move.self?.volatileStatus === 'lockedmove') value *= 0.5;
  if (move.mindBlownRecoil) value *= 0.5;
  if (move.id in situationalMoves) value *= 0.1;
  if (move.selfdestruct) value *= 0.01;
  return value;
}

function pdzGetStabModifier(pokemon: Context.Pokemon) {
  let mod = 0x1000;
  if (!pokemon.move) return mod;
  if (pokemon.ability?.onModifySTAB) {
    mod = chain(mod, pokemon.ability.onModifySTAB(pokemon));
  } else if (pokemon.types.includes(pokemon.move?.type)) {
    mod = chain(mod, 0x1800);
  }
  return mod;
}

export function pdzCalculateStrength(pokemon: Context.Pokemon): number {
  const move = pokemon.move;
  if (!move) return 0;
  const attackStat = pokemon.move.overrideOffensiveStat
    ? pokemon.species.baseStats[pokemon.move.overrideOffensiveStat]
    : is(pokemon.move.category, 'Physical')
    ? pokemon.species.baseStats.atk
    : is(pokemon.move.category, 'Special')
    ? pokemon.species.baseStats.spa
    : 0;
  const baseDamage = move.basePower * attackStat;
  const stabMod = pdzGetStabModifier(pokemon);
  let damageAmount = baseDamage;
  if (stabMod !== 0x1000) damageAmount = (damageAmount * stabMod) / 0x1000;
  damageAmount = shift(damageAmount, move.effectiveness);
  const epMod = pdzEffectivePowerModifier(move);
  damageAmount = damageAmount * epMod;
  return round((damageAmount * 10) / 2048) / 10;
}

export function calculateDamage(context: Context | State): number | number[] {
  if (!('relevant' in context)) context = Context.fromState(context);

  if (context.move.onTryImmunity && context.move.onTryImmunity(context)) return 0;
  if (context.move.effectiveness === -5) return 0;
  if (context.move.damageCallback) return context.move.damageCallback(context);

  const attackStat = context.move.overrideOffensiveStat
    ? context.p1.pokemon.stats[context.move.overrideOffensiveStat]
    : is(context.move.category, 'Physical')
    ? context.p1.pokemon.stats.atk
    : is(context.move.category, 'Special')
    ? context.p1.pokemon.stats.spa
    : 0;
  const defenseStat = context.move.overrideDefensiveStat
    ? context.p2.pokemon.stats[context.move.overrideDefensiveStat]
    : is(context.move.category, 'Physical')
    ? context.p2.pokemon.stats.def
    : is(context.move.category, 'Special')
    ? context.p2.pokemon.stats.spd
    : 0;

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
    damageAmount = floor(trunc(shift(damageAmount, context.move.effectiveness), 32));
    if (context.p1.pokemon.status?.onModifyAtk) damageAmount = applyMod(damageAmount, context.p1.pokemon.status?.onModifyAtk(context) || 0x1000);
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

export class Distribution<T> {
  outcomes: {data: T; count: number}[] = [];
  constructor(data?: T | T[]) {
    if (data === undefined) return;
    if (Array.isArray(data)) {
      const map = new Map<T, number>();
      for (const value of data) {
        map.set(value, (map.get(value) || 0) + 1);
      }
      this.outcomes = Array.from(map, ([data, count]) => ({data, count}));
    } else {
      this.outcomes = [{data: data, count: 1}];
    }
  }

  get totalOutcomes(): number {
    return this.outcomes.reduce((sum, value) => sum + value.count, 0);
  }

  isEmpty(): boolean {
    return this.outcomes.length === 0;
  }

  size(): number {
    return this.outcomes.length;
  }

  toArray(): T[] {
    return this.outcomes.flatMap(entry => Array(entry.count).fill(entry.data));
  }

  map(mapFunction: (value: T) => T): this {
    const map = new Map<T, number>();
    for (const outcome of this.outcomes) {
      const mappedValue = mapFunction(outcome.data);
      map.set(mappedValue, (map.get(mappedValue) || 0) + outcome.count);
    }
    this.outcomes = Array.from(map, ([data, count]) => ({data, count}));
    return this;
  }

  mapped(mapFunction: (value: T) => T): Distribution<T> {
    const result = new Distribution<T>();
    const map = new Map<T, number>();
    for (const outcome of this.outcomes) {
      const mappedValue = mapFunction(outcome.data);
      map.set(mappedValue, (map.get(mappedValue) || 0) + outcome.count);
    }
    result.outcomes = Array.from(map, ([data, count]) => ({data, count}));
    return result;
  }

  filter(predicate: (value: T) => boolean): this {
    this.outcomes = this.outcomes.filter(outcome => predicate(outcome.data));
    return this;
  }

  filtered(predicate: (value: T) => boolean): Distribution<T> {
    const result = new Distribution<T>();
    result.outcomes = this.outcomes.filter(outcome => predicate(outcome.data));
    return result;
  }

  forEach(callback: (data: T, count: number) => void): void {
    this.outcomes.forEach(outcome => callback(outcome.data, outcome.count));
  }

  reduce<U>(callback: (acc: U, data: T, count: number) => U, initial: U): U {
    return this.outcomes.reduce((acc, outcome) => callback(acc, outcome.data, outcome.count), initial);
  }

  clone(): Distribution<T> {
    const result = new Distribution<T>();
    result.outcomes = this.outcomes.map(o => ({...o}));
    return result;
  }

  equals(other: Distribution<T>): boolean {
    if (this.outcomes.length !== other.outcomes.length) return false;
    const thisMap = new Map(this.outcomes.map(o => [o.data, o.count]));
    for (const outcome of other.outcomes) {
      if (thisMap.get(outcome.data) !== outcome.count) return false;
    }
    return true;
  }

  probabilityOf(value: T): number {
    const outcome = this.outcomes.find(o => o.data === value);
    return outcome ? outcome.count / this.totalOutcomes : 0;
  }

  probabilityOfAtLeast(value: T): number {
    const count = this.outcomes.filter(o => o.data >= value).reduce((sum, o) => sum + o.count, 0);
    return count / this.totalOutcomes;
  }

  toJSON(): {outcomes: {data: T; count: number}[]} {
    return {outcomes: this.outcomes};
  }

  static fromJSON<T>(json: {outcomes: {data: T; count: number}[]}): Distribution<T> {
    const dist = new Distribution<T>();
    dist.outcomes = json.outcomes;
    return dist;
  }
}

export class NumberDistribution extends Distribution<number> {
  constructor(damageAmounts?: number | number[]) {
    super(damageAmounts);
  }

  assertNotEmpty(): asserts this is NumberDistribution & {outcomes: [{data: number; count: number}, ...{data: number; count: number}[]]} {
    if (this.outcomes.length === 0) {
      throw new Error('Distribution is empty');
    }
  }

  get min(): number {
    return this.outcomes.length > 0 ? min(...this.outcomes.map(outcome => outcome.data)) : NaN;
  }

  get max(): number {
    return this.outcomes.length > 0 ? max(...this.outcomes.map(outcome => outcome.data)) : NaN;
  }

  get expected(): number {
    if (this.outcomes.length === 0) return NaN;
    return this.outcomes.reduce((sum, outcome) => (sum += outcome.data * outcome.count), 0) / this.totalOutcomes;
  }

  get range(): [number, number] {
    return [this.min, this.max];
  }

  get median(): number {
    if (this.outcomes.length === 0) return NaN;
    const sorted = [...this.outcomes].sort((a, b) => a.data - b.data);
    const total = this.totalOutcomes;
    let cumulative = 0;
    for (const outcome of sorted) {
      cumulative += outcome.count;
      if (cumulative >= total / 2) {
        return outcome.data;
      }
    }
    return sorted[sorted.length - 1].data;
  }

  get mode(): number {
    if (this.outcomes.length === 0) return NaN;
    let maxCount = 0;
    let modeValue = this.outcomes[0].data;
    for (const outcome of this.outcomes) {
      if (outcome.count > maxCount) {
        maxCount = outcome.count;
        modeValue = outcome.data;
      }
    }
    return modeValue;
  }

  get variance(): number {
    if (this.outcomes.length === 0) return NaN;
    const mean = this.expected;
    const sumSquaredDiff = this.outcomes.reduce((sum, outcome) => sum + outcome.count * (outcome.data - mean) ** 2, 0);
    return sumSquaredDiff / this.totalOutcomes;
  }

  get standardDeviation(): number {
    return Math.sqrt(this.variance);
  }

  percentile(p: number): number {
    if (this.outcomes.length === 0) return NaN;
    if (p < 0 || p > 100) throw new Error('Percentile must be between 0 and 100');
    const sorted = [...this.outcomes].sort((a, b) => a.data - b.data);
    const targetCount = (p / 100) * this.totalOutcomes;
    let cumulative = 0;
    for (const outcome of sorted) {
      cumulative += outcome.count;
      if (cumulative >= targetCount) {
        return outcome.data;
      }
    }
    return sorted[sorted.length - 1].data;
  }

  cumulativeProbability(value: number): number {
    if (this.outcomes.length === 0) return 0;
    let cumulative = 0;
    for (const outcome of this.outcomes) {
      if (outcome.data <= value) {
        cumulative += outcome.count;
      }
    }
    return cumulative / this.totalOutcomes;
  }

  multiply(scalar: number): this {
    const map = new Map<number, number>();
    for (const outcome of this.outcomes) {
      const newValue = outcome.data * scalar;
      map.set(newValue, (map.get(newValue) || 0) + outcome.count);
    }
    this.outcomes = Array.from(map, ([data, count]) => ({data, count}));
    return this;
  }

  multiplied(scalar: number): NumberDistribution {
    const result = new NumberDistribution();
    const map = new Map<number, number>();
    for (const outcome of this.outcomes) {
      const newValue = outcome.data * scalar;
      map.set(newValue, (map.get(newValue) || 0) + outcome.count);
    }
    result.outcomes = Array.from(map, ([data, count]) => ({data, count}));
    return result;
  }

  add(scalar: number): this {
    const map = new Map<number, number>();
    for (const outcome of this.outcomes) {
      const newValue = outcome.data + scalar;
      map.set(newValue, (map.get(newValue) || 0) + outcome.count);
    }
    this.outcomes = Array.from(map, ([data, count]) => ({data, count}));
    return this;
  }

  added(scalar: number): NumberDistribution {
    const result = new NumberDistribution();
    const map = new Map<number, number>();
    for (const outcome of this.outcomes) {
      const newValue = outcome.data + scalar;
      map.set(newValue, (map.get(newValue) || 0) + outcome.count);
    }
    result.outcomes = Array.from(map, ([data, count]) => ({data, count}));
    return result;
  }

  subtract(other: NumberDistribution): NumberDistribution {
    const result = new NumberDistribution();
    const map = new Map<number, number>();
    for (const outcome1 of this.outcomes) {
      for (const outcome2 of other.outcomes) {
        const diff = outcome1.data - outcome2.data;
        map.set(diff, (map.get(diff) || 0) + outcome1.count * outcome2.count);
      }
    }
    result.outcomes = Array.from(map, ([data, count]) => ({data, count}));
    return result;
  }

  combine(other: NumberDistribution, operation: (a: number, b: number) => number): NumberDistribution {
    const result = new NumberDistribution();
    const map = new Map<number, number>();
    for (const outcome1 of this.outcomes) {
      for (const outcome2 of other.outcomes) {
        const value = operation(outcome1.data, outcome2.data);
        map.set(value, (map.get(value) || 0) + outcome1.count * outcome2.count);
      }
    }
    result.outcomes = Array.from(map, ([data, count]) => ({data, count}));
    return result;
  }

  clone(): NumberDistribution {
    const result = new NumberDistribution();
    result.outcomes = this.outcomes.map(o => ({...o}));
    return result;
  }

  toString(notation: '%' | '#' | 'e' | '%%' = '%'): string {
    if (notation === '#') return this.outcomes.map(value => `${value.data}: ${value.count}`).join(', ');
    if (notation === 'e') return this.outcomes.map(value => `${value.data}, ${value.count}`).join('\n');
    if (notation === '%%') return this.outcomes.map(value => `${value.data}: ${((value.count / this.totalOutcomes) * 100).toFixed(2)}%`).join(', ');
    else return this.outcomes.map(value => `${value.data}: ${((value.count / this.totalOutcomes) * 100).toFixed(1)}%`).join(', ');
  }

  static chain(...distributions: NumberDistribution[]): NumberDistribution {
    const result = new NumberDistribution();
    if (distributions.length === 0) return result;

    // Optimized chain using single Map accumulator
    let aggregated = new Map<number, number>();
    for (const outcome of distributions[0].outcomes) {
      aggregated.set(outcome.data, outcome.count);
    }

    for (let i = 1; i < distributions.length; i++) {
      const nextAggregated = new Map<number, number>();
      for (const [value1, count1] of aggregated) {
        for (const outcome2 of distributions[i].outcomes) {
          const sum = value1 + outcome2.data;
          const count = count1 * outcome2.count;
          nextAggregated.set(sum, (nextAggregated.get(sum) || 0) + count);
        }
      }
      aggregated = nextAggregated;
    }

    result.outcomes = Array.from(aggregated, ([data, count]) => ({data, count}));
    return result;
  }
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

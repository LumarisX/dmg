import {Distribution, Keyer, Labels, Outcome} from './distribution';
import {stateKey} from './key';
import {State} from './state';

export interface Resolution {
  state: State;
  done: boolean;
  landed: boolean;
  remaining: number;
  labels: LabelValues;
}

export interface LabelValues {
  [axis: string]: string | number;
}

export function resolutionKey(resolution: Resolution): string {
  let key = (resolution.done ? 'x' : 'o') + (resolution.landed ? 'h' : 'm') + resolution.remaining;
  for (const axis of Object.keys(resolution.labels).sort()) {
    key += ';' + axis + '=' + resolution.labels[axis];
  }
  return key + '|' + stateKey(resolution.state);
}

export function single(resolution: Resolution): Distribution<Resolution> {
  const distribution = resolutionDistribution();
  distribution.outcomes = [{data: resolution, count: 1}];
  return distribution;
}

const BOOST_ORDER: (keyof State.Pokemon['boosts'])[] = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'];

export class VariantIds {
  private readonly boostIdByObject = new WeakMap<object, number>();
  private readonly boostIdByValue = new Map<string, number>();
  private readonly itemIds = new Map<string, number>();
  private nextBoost = 0;

  private boostId(boosts: State.Pokemon['boosts']): number {
    const cached = this.boostIdByObject.get(boosts);
    if (cached !== undefined) return cached;

    let value = '';
    for (const stat of BOOST_ORDER) {
      const level = boosts[stat];
      if (level) value += stat + level;
    }
    let id = this.boostIdByValue.get(value);
    if (id === undefined) {
      id = this.nextBoost++;
      this.boostIdByValue.set(value, id);
    }
    this.boostIdByObject.set(boosts, id);
    return id;
  }

  private itemId(item: string | undefined): number {
    const key = item ?? '';
    let id = this.itemIds.get(key);
    if (id === undefined) {
      id = this.itemIds.size;
      this.itemIds.set(key, id);
    }
    return id;
  }

  of(pokemon: State.Pokemon): number {
    return (this.boostId(pokemon.boosts) * 64 + this.itemId(pokemon.item)) * 2 + (pokemon.hurtThisTurn ? 1 : 0);
  }
}

export interface HitBounds {
  variants: VariantIds;
  hitSpan: number;
  hpSpan: number;
}

export function hitBounds(target: State.Pokemon, maxHits: number): HitBounds {
  return {variants: new VariantIds(), hitSpan: maxHits + 1, hpSpan: target.maxhp + 1};
}

export function packHitKey(resolution: Resolution, bounds: HitBounds): number {
  const target = resolution.state.target;
  const flags = (resolution.done ? 2 : 0) + (resolution.landed ? 1 : 0);
  const crits = Number(resolution.labels.crits ?? 0);
  const variant = bounds.variants.of(target);
  return ((((variant * bounds.hitSpan + resolution.remaining) * bounds.hitSpan + crits) * 4 + flags) * bounds.hpSpan) + target.hp;
}

export function fromOutcomes(outcomes: Outcome<Resolution>[]): Distribution<Resolution> {
  const distribution = resolutionDistribution();
  distribution.outcomes = outcomes;
  return distribution;
}

const VARIES_DURING_HITS: {[K in keyof State.Pokemon]-?: boolean} = {
  hp: true,
  boosts: true,
  item: true,
  hurtThisTurn: true,

  ability: false,
  addedType: false,
  evs: false,
  gender: false,
  happiness: false,
  ivs: false,
  level: false,
  maxhp: false,
  moveLastTurnResult: false,
  nature: false,
  position: false,
  species: false,
  statusState: false,
  status: false,
  stats: false,
  switching: false,
  teraType: false,
  terastallized: false,
  types: false,
  volatiles: false,
  weighthg: false,
};

const VARYING_FIELDS = (Object.keys(VARIES_DURING_HITS) as (keyof State.Pokemon)[]).filter(field => VARIES_DURING_HITS[field]);

function fieldKeyOf(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    let key = '';
    for (const k of Object.keys(value).sort()) key += k + ':' + (value as Record<string, unknown>)[k] + ',';
    return key;
  }
  return String(value);
}

export function hitResolutionKey(resolution: Resolution): string {
  let key = (resolution.done ? 'x' : 'o') + (resolution.landed ? 'h' : 'm') + resolution.remaining;
  for (const axis of Object.keys(resolution.labels).sort()) {
    key += ';' + axis + '=' + resolution.labels[axis];
  }
  const target = resolution.state.target;
  for (const field of VARYING_FIELDS) key += '|' + fieldKeyOf(target[field]);
  return key;
}

export function hitDistribution(): Distribution<Resolution> {
  return new Distribution<Resolution>(undefined, hitResolutionKey as Keyer<Resolution>);
}

export function rekeyed(distribution: Distribution<Resolution>): Distribution<Resolution> {
  const result = resolutionDistribution();
  result.outcomes = distribution.outcomes;
  return result;
}

export function resolutionDistribution(): Distribution<Resolution> {
  return new Distribution<Resolution>(undefined, resolutionKey as Keyer<Resolution>);
}

export function withLabel(resolution: Resolution, axis: string, value: string | number): Resolution {
  return {...resolution, labels: {...resolution.labels, [axis]: value}};
}

export function toStateDistribution(resolved: Distribution<Resolution>, move: State.Move): Outcome<State>[] {
  const merged = new Map<string, Outcome<State>>();
  for (const outcome of resolved.outcomes) {
    const {labels} = outcome.data;
    const state = outcome.data.state.withMove(move);
    const key = stateKey(state);
    const existing = merged.get(key);
    if (existing) {
      existing.count += outcome.count;
      for (const axis of Object.keys(labels)) {
        const counts = (existing.labels![axis] ??= {});
        counts[labels[axis]] = (counts[labels[axis]] ?? 0) + outcome.count;
      }
    } else {
      const collected: Labels = {};
      for (const axis of Object.keys(labels)) collected[axis] = {[labels[axis]]: outcome.count};
      merged.set(key, {data: state, count: outcome.count, labels: collected});
    }
  }
  return [...merged.values()];
}

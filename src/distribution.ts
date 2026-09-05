import {max, min} from './math';

export type Keyer<T> = (value: T) => string;

export interface Outcome<T> {
  data: T;
  count: number;
}

export class ProbabilityMassError extends Error {
  constructor(expected: number, actual: number) {
    super(`Probability mass changed during merge: expected total ${expected}, got ${actual}`);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ExactHorizonError extends Error {
  constructor(total: number) {
    super(`Denominator ${total} exceeds the exactly representable range; prune or switch to approximate weights`);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function greatestCommonDivisor(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

export function leastCommonMultiple(a: number, b: number): number {
  return (a / greatestCommonDivisor(a, b)) * b;
}

export function defaultKeyer<T>(value: T): string {
  if (typeof value === 'object' && value !== null) {
    throw new TypeError('A Distribution over object values requires an explicit keyer; String() would merge every value into one bucket');
  }
  return String(value);
}

export class Distribution<T> {
  outcomes: Outcome<T>[] = [];
  readonly keyer: Keyer<T>;

  constructor(data?: T | T[], keyer: Keyer<T> = defaultKeyer) {
    this.keyer = keyer;
    if (data === undefined) return;
    this.outcomes = Array.isArray(data) ? Distribution.collapse(data.map(d => ({data: d, count: 1})), keyer) : [{data, count: 1}];
  }

  protected static collapse<T>(outcomes: Outcome<T>[], keyer: Keyer<T>): Outcome<T>[] {
    const merged = new Map<string, Outcome<T>>();
    for (const outcome of outcomes) {
      const key = keyer(outcome.data);
      const existing = merged.get(key);
      if (existing) {
        existing.count += outcome.count;
      } else {
        merged.set(key, {data: outcome.data, count: outcome.count});
      }
    }
    return [...merged.values()];
  }

  protected derive(outcomes: Outcome<T>[]): this {
    const result = new (this.constructor as new (data?: T | T[], keyer?: Keyer<T>) => this)(undefined, this.keyer);
    result.outcomes = outcomes;
    return result;
  }

  get totalOutcomes(): number {
    return this.outcomes.reduce((sum, outcome) => sum + outcome.count, 0);
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

  normalize(): this {
    if (this.outcomes.length === 0) return this;
    let divisor = this.outcomes[0].count;
    for (const outcome of this.outcomes) {
      divisor = greatestCommonDivisor(divisor, outcome.count);
      if (divisor === 1) return this;
    }
    if (divisor > 1) {
      for (const outcome of this.outcomes) outcome.count /= divisor;
    }
    return this;
  }

  assertExact(expectedTotal?: number): this {
    const total = this.totalOutcomes;
    if (expectedTotal !== undefined && total !== expectedTotal) {
      throw new ProbabilityMassError(expectedTotal, total);
    }
    if (!Number.isSafeInteger(total)) throw new ExactHorizonError(total);
    for (const outcome of this.outcomes) {
      if (!Number.isSafeInteger(outcome.count) || outcome.count <= 0) {
        throw new ProbabilityMassError(total, outcome.count);
      }
    }
    return this;
  }

  map(mapFunction: (value: T) => T): this {
    this.outcomes = Distribution.collapse(
      this.outcomes.map(o => ({data: mapFunction(o.data), count: o.count})),
      this.keyer
    );
    return this;
  }

  mapped(mapFunction: (value: T) => T): this {
    return this.derive(Distribution.collapse(this.outcomes.map(o => ({data: mapFunction(o.data), count: o.count})), this.keyer));
  }

  flatMap(f: (value: T) => Distribution<T>): this {
    const expanded = this.outcomes.map(outcome => ({outcome, sub: f(outcome.data)}));

    let common = 1;
    for (const {sub} of expanded) {
      const total = sub.totalOutcomes;
      if (total) common = leastCommonMultiple(common, total);
    }

    const merged = new Map<string, Outcome<T>>();
    let expectedTotal = 0;
    for (const {outcome, sub} of expanded) {
      const total = sub.totalOutcomes;
      if (!total) continue;
      const scale = (common / total) * outcome.count;
      expectedTotal += outcome.count * common;
      for (const inner of sub.outcomes) {
        const key = this.keyer(inner.data);
        const existing = merged.get(key);
        if (existing) {
          existing.count += inner.count * scale;
        } else {
          merged.set(key, {data: inner.data, count: inner.count * scale});
        }
      }
    }

    return this.derive([...merged.values()]).assertExact(expectedTotal).normalize();
  }

  filter(predicate: (value: T) => boolean): this {
    this.outcomes = this.outcomes.filter(outcome => predicate(outcome.data));
    return this;
  }

  filtered(predicate: (value: T) => boolean): this {
    return this.derive(this.outcomes.filter(outcome => predicate(outcome.data)).map(o => ({...o})));
  }

  forEach(callback: (data: T, count: number) => void): void {
    this.outcomes.forEach(outcome => callback(outcome.data, outcome.count));
  }

  reduce<U>(callback: (acc: U, data: T, count: number) => U, initial: U): U {
    return this.outcomes.reduce((acc, outcome) => callback(acc, outcome.data, outcome.count), initial);
  }

  clone(): this {
    return this.derive(this.outcomes.map(o => ({...o})));
  }

  equals(other: Distribution<T>): boolean {
    if (this.outcomes.length !== other.outcomes.length) return false;
    const mine = new Map(this.outcomes.map(o => [this.keyer(o.data), o.count]));
    for (const outcome of other.outcomes) {
      if (mine.get(other.keyer(outcome.data)) !== outcome.count) return false;
    }
    return true;
  }

  probabilityOf(value: T): number {
    const key = this.keyer(value);
    const outcome = this.outcomes.find(o => this.keyer(o.data) === key);
    return outcome ? outcome.count / this.totalOutcomes : 0;
  }

  toJSON(): {outcomes: Outcome<T>[]} {
    return {outcomes: this.outcomes};
  }

  static fromJSON<T>(json: {outcomes: Outcome<T>[]}, keyer: Keyer<T> = defaultKeyer): Distribution<T> {
    const dist = new Distribution<T>(undefined, keyer);
    dist.outcomes = json.outcomes;
    return dist;
  }
}

export class NumberDistribution extends Distribution<number> {
  constructor(damageAmounts?: number | number[]) {
    super(damageAmounts, String);
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
    return this.percentile(50);
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
    return this.outcomes.reduce((sum, outcome) => sum + outcome.count * (outcome.data - mean) ** 2, 0) / this.totalOutcomes;
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
      if (cumulative >= targetCount) return outcome.data;
    }
    return sorted[sorted.length - 1].data;
  }

  probabilityOfAtLeast(value: number): number {
    const count = this.outcomes.filter(o => o.data >= value).reduce((sum, o) => sum + o.count, 0);
    return count / this.totalOutcomes;
  }

  cumulativeProbability(value: number): number {
    if (this.outcomes.length === 0) return 0;
    const count = this.outcomes.filter(o => o.data <= value).reduce((sum, o) => sum + o.count, 0);
    return count / this.totalOutcomes;
  }

  multiply(scalar: number): this {
    return this.map(value => value * scalar);
  }

  multiplied(scalar: number): NumberDistribution {
    return this.mapped(value => value * scalar);
  }

  add(scalar: number): this {
    return this.map(value => value + scalar);
  }

  added(scalar: number): NumberDistribution {
    return this.mapped(value => value + scalar);
  }

  subtract(scalar: number): this {
    return this.add(-scalar);
  }

  combine(other: NumberDistribution, operation: (a: number, b: number) => number): NumberDistribution {
    const result = new NumberDistribution();
    const merged = new Map<number, number>();
    for (const outcome1 of this.outcomes) {
      for (const outcome2 of other.outcomes) {
        const value = operation(outcome1.data, outcome2.data);
        merged.set(value, (merged.get(value) || 0) + outcome1.count * outcome2.count);
      }
    }
    result.outcomes = [...merged].map(([data, count]) => ({data, count}));
    return result.assertExact(this.totalOutcomes * other.totalOutcomes).normalize();
  }

  toString(notation: '%' | '#' | 'e' | '%%' = '%'): string {
    if (notation === '#') return this.outcomes.map(value => `${value.data}: ${value.count}`).join(', ');
    if (notation === 'e') return this.outcomes.map(value => `${value.data}, ${value.count}`).join('\n');
    const digits = notation === '%%' ? 2 : 1;
    return this.outcomes.map(value => `${value.data}: ${((value.count / this.totalOutcomes) * 100).toFixed(digits)}%`).join(', ');
  }

  static chain(...distributions: NumberDistribution[]): NumberDistribution {
    const result = new NumberDistribution();
    if (distributions.length === 0) return result;

    result.outcomes = distributions[0].outcomes.map(o => ({...o}));

    for (let i = 1; i < distributions.length; i++) {
      const expectedTotal = result.totalOutcomes * distributions[i].totalOutcomes;
      const next = new Map<number, number>();
      for (const outcome1 of result.outcomes) {
        for (const outcome2 of distributions[i].outcomes) {
          const sum = outcome1.data + outcome2.data;
          next.set(sum, (next.get(sum) || 0) + outcome1.count * outcome2.count);
        }
      }
      result.outcomes = [...next].map(([data, count]) => ({data, count}));
      result.assertExact(expectedTotal).normalize();
    }

    return result;
  }
}

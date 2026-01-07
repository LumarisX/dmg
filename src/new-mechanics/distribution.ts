export class Distribution<T> {
  outcomes: {data: T; count: number}[] = [];
  private keyExtractor: (value: T) => string;

  constructor(data?: T | T[], keyExtractor?: (value: T) => string) {
    this.keyExtractor = keyExtractor ?? this.defaultKeyExtractor;
    if (data === undefined) return;
    if (Array.isArray(data)) {
      const map = new Map<string, {data: T; count: number}>();
      for (const value of data) {
        const key = this.keyExtractor(value);
        const existing = map.get(key);
        if (existing) {
          existing.count++;
        } else {
          map.set(key, {data: value, count: 1});
        }
      }
      this.outcomes = Array.from(map.values());
    } else {
      this.outcomes = [{data: data, count: 1}];
    }
  }

  private defaultKeyExtractor = (value: T): string => {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

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
    const map = new Map<string, {data: T; count: number}>();
    for (const outcome of this.outcomes) {
      const mappedValue = mapFunction(outcome.data);
      const key = this.keyExtractor(mappedValue);
      const existing = map.get(key);
      if (existing) {
        existing.count += outcome.count;
      } else {
        map.set(key, {data: mappedValue, count: outcome.count});
      }
    }
    this.outcomes = Array.from(map.values());
    return this;
  }

  mapped(mapFunction: (value: T) => T): Distribution<T> {
    const result = new Distribution<T>(undefined, this.keyExtractor);
    const map = new Map<string, {data: T; count: number}>();
    for (const outcome of this.outcomes) {
      const mappedValue = mapFunction(outcome.data);
      const key = this.keyExtractor(mappedValue);
      const existing = map.get(key);
      if (existing) {
        existing.count += outcome.count;
      } else {
        map.set(key, {data: mappedValue, count: outcome.count});
      }
    }
    result.outcomes = Array.from(map.values());
    return result;
  }

  filter(predicate: (value: T) => boolean): this {
    this.outcomes = this.outcomes.filter(outcome => predicate(outcome.data));
    return this;
  }

  filtered(predicate: (value: T) => boolean): Distribution<T> {
    const result = new Distribution<T>(undefined, this.keyExtractor);
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
    const result = new Distribution<T>(undefined, this.keyExtractor);
    result.outcomes = this.outcomes.map(o => ({...o}));
    return result;
  }

  equals(other: Distribution<T>): boolean {
    if (this.outcomes.length !== other.outcomes.length) return false;
    const thisMap = new Map(this.outcomes.map(o => [this.keyExtractor(o.data), o.count]));
    for (const outcome of other.outcomes) {
      const key = other.keyExtractor(outcome.data);
      if (thisMap.get(key) !== outcome.count) return false;
    }
    return true;
  }

  probabilityOf(value: T): number {
    const key = this.keyExtractor(value);
    for (const outcome of this.outcomes) {
      if (this.keyExtractor(outcome.data) === key) {
        return outcome.count / this.totalOutcomes;
      }
    }
    return 0;
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

  private getSortedOutcomes(): typeof this.outcomes {
    return this.outcomes.length > 0 ? [...this.outcomes].sort((a, b) => a.data - b.data) : [];
  }

  get min(): number {
    return this.outcomes.length > 0 ? this.getSortedOutcomes()[0].data : NaN;
  }

  get max(): number {
    const sorted = this.getSortedOutcomes();
    return sorted.length > 0 ? sorted[sorted.length - 1].data : NaN;
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
    const sorted = this.getSortedOutcomes();
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
    const sorted = this.getSortedOutcomes();
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

import {Distribution, ExactHorizonError, NumberDistribution, ProbabilityMassError} from '../distribution';

interface Target {
  hp: number;
  fainted: boolean;
}

const targetKey = (t: Target) => (t.fainted ? 'fainted' : `hp:${t.hp}`);

function sumsToOne<T>(dist: Distribution<T>) {
  const total = dist.totalOutcomes;
  return dist.outcomes.reduce((sum, o) => sum + o.count / total, 0);
}

describe('Distribution', () => {
  test('merges by key rather than reference', () => {
    const a: Target = {hp: 0, fainted: true};
    const b: Target = {hp: 0, fainted: true};
    const dist = new Distribution<Target>([a, b], targetKey);

    expect(dist.size()).toBe(1);
    expect(dist.totalOutcomes).toBe(2);
    expect(dist.probabilityOf(a)).toBe(1);
  });

  test('object values without a keyer are rejected rather than silently merged', () => {
    expect(() => new Distribution<Target>([{hp: 10, fainted: false}, {hp: 20, fainted: false}])).toThrow(TypeError);
  });

  test('primitive values still work without a keyer', () => {
    const dist = new Distribution<string>(['a', 'b', 'a']);
    expect(dist.size()).toBe(2);
    expect(dist.probabilityOf('a')).toBeCloseTo(2 / 3, 12);
  });

  test('derived instances keep the keyer', () => {
    const dist = new Distribution<Target>([{hp: 10, fainted: false}, {hp: 20, fainted: false}], targetKey);

    const knockedOut = dist.mapped(t => ({hp: 0, fainted: true}));
    expect(knockedOut.keyer).toBe(targetKey);
    expect(knockedOut.size()).toBe(1);
    expect(knockedOut.totalOutcomes).toBe(2);

    expect(dist.clone().keyer).toBe(targetKey);
    expect(dist.filtered(t => t.hp > 15).keyer).toBe(targetKey);
  });

  test('overkill collapses to a single certain outcome', () => {
    const rolls = Array.from({length: 16}, (_, i) => 150 + i);
    const survivors = new Distribution<Target>(
      rolls.map(damage => ({hp: 80 - damage, fainted: false})),
      targetKey
    );
    expect(survivors.size()).toBe(16);

    const resolved = survivors.mapped(t => (t.hp <= 0 ? {hp: 0, fainted: true} : t));

    expect(resolved.size()).toBe(1);
    expect(resolved.outcomes[0].data.fainted).toBe(true);
    expect(resolved.probabilityOf({hp: 0, fainted: true})).toBe(1);
    expect(sumsToOne(resolved)).toBeCloseTo(1, 12);
  });

  test('failing to clamp hp defeats the merge', () => {
    const rolls = Array.from({length: 16}, (_, i) => 150 + i);
    const unclamped = new Distribution<Target>(
      rolls.map(damage => ({hp: 80 - damage, fainted: true})),
      t => (t.fainted ? `fainted:${t.hp}` : `hp:${t.hp}`)
    );
    expect(unclamped.size()).toBe(16);
  });

  test('normalize divides out the common factor without moving probabilities', () => {
    const dist = new NumberDistribution();
    dist.outcomes = [
      {data: 1, count: 400},
      {data: 2, count: 1200},
    ];
    const before = dist.probabilityOf(1);

    dist.normalize();

    expect(dist.outcomes.map(o => o.count)).toEqual([1, 3]);
    expect(dist.probabilityOf(1)).toBe(before);
    expect(sumsToOne(dist)).toBeCloseTo(1, 12);
  });

  test('assertExact rejects lost probability mass', () => {
    const dist = new NumberDistribution([1, 2, 3, 4]);
    expect(() => dist.assertExact(4)).not.toThrow();
    expect(() => dist.assertExact(5)).toThrow(ProbabilityMassError);
  });

  test('assertExact rejects a denominator past the exact horizon', () => {
    const dist = new NumberDistribution();
    dist.outcomes = [{data: 1, count: Number.MAX_SAFE_INTEGER}, {data: 2, count: Number.MAX_SAFE_INTEGER}];
    expect(() => dist.assertExact()).toThrow(ExactHorizonError);
  });
});

describe('Distribution.flatMap', () => {
  test('composes a step and preserves total mass', () => {
    const dist = new Distribution<Target>([{hp: 10, fainted: false}], targetKey);

    const stepped = dist.flatMap(t =>
      new Distribution<Target>([{hp: t.hp - 1, fainted: false}, {hp: t.hp - 2, fainted: false}], targetKey)
    );

    expect(stepped.size()).toBe(2);
    expect(sumsToOne(stepped)).toBeCloseTo(1, 12);
  });

  test('branches of different width are put on a common denominator', () => {
    const dist = new Distribution<string>(['a', 'b']);

    const out = dist.flatMap(v => (v === 'a' ? new Distribution<string>(['x', 'y']) : new Distribution<string>(['p', 'q', 'r'])));

    expect(out.probabilityOf('x')).toBeCloseTo(1 / 4, 12);
    expect(out.probabilityOf('p')).toBeCloseTo(1 / 6, 12);
    expect(sumsToOne(out)).toBeCloseTo(1, 12);
  });

  test('outcomes converging on the same state merge', () => {
    const dist = new Distribution<Target>([{hp: 10, fainted: false}, {hp: 20, fainted: false}], targetKey);

    const out = dist.flatMap(() => new Distribution<Target>([{hp: 0, fainted: true}], targetKey));

    expect(out.size()).toBe(1);
    expect(out.probabilityOf({hp: 0, fainted: true})).toBe(1);
  });

  test('repeated application stays inside the exact horizon', () => {
    let dist = new Distribution<string>(['start']);
    const split = (v: string) => new Distribution<string>([`${v}0`, `${v}1`]);

    for (let i = 0; i < 5; i++) dist = dist.flatMap(split);

    expect(dist.size()).toBe(32);
    expect(() => dist.assertExact()).not.toThrow();
    expect(sumsToOne(dist)).toBeCloseTo(1, 12);
  });

  test('does not mutate its input and keeps the keyer', () => {
    const dist = new Distribution<Target>([{hp: 10, fainted: false}], targetKey);
    const before = dist.outcomes.map(o => ({...o}));

    const out = dist.flatMap(t => new Distribution<Target>([t], targetKey));

    expect(dist.outcomes).toEqual(before);
    expect(out.keyer).toBe(targetKey);
  });
});

describe('NumberDistribution', () => {
  test('chain convolves and preserves total mass', () => {
    const a = new NumberDistribution([1, 2]);
    const b = new NumberDistribution([10, 20]);

    const chained = NumberDistribution.chain(a, b);

    expect(chained.outcomes.map(o => o.data).sort((x, y) => x - y)).toEqual([11, 12, 21, 22]);
    expect(chained.totalOutcomes).toBe(4);
    expect(sumsToOne(chained)).toBeCloseTo(1, 12);
  });

  test('chain merges equal sums and keeps their weight', () => {
    const a = new NumberDistribution([1, 2]);
    const b = new NumberDistribution([1, 2]);

    const chained = NumberDistribution.chain(a, b);

    expect(chained.size()).toBe(3);
    expect(chained.probabilityOf(3)).toBeCloseTo(0.5, 12);
    expect(sumsToOne(chained)).toBeCloseTo(1, 12);
  });

  test('chaining sixteen rolls repeatedly stays inside the exact horizon', () => {
    const rolls = new NumberDistribution(Array.from({length: 16}, (_, i) => 100 + i));

    const chained = NumberDistribution.chain(rolls, rolls, rolls, rolls, rolls);

    expect(() => chained.assertExact()).not.toThrow();
    expect(Number.isSafeInteger(chained.totalOutcomes)).toBe(true);
    expect(sumsToOne(chained)).toBeCloseTo(1, 12);
    expect(chained.min).toBe(500);
    expect(chained.max).toBe(575);
  });

  test('chain does not mutate its inputs', () => {
    const a = new NumberDistribution([1, 2]);
    const before = a.outcomes.map(o => ({...o}));

    NumberDistribution.chain(a, new NumberDistribution([10]));

    expect(a.outcomes).toEqual(before);
  });

  test('combine preserves mass and normalizes', () => {
    const a = new NumberDistribution([1, 1, 2, 2]);
    const b = new NumberDistribution([3, 3]);

    const combined = a.combine(b, (x, y) => x + y);

    expect(sumsToOne(combined)).toBeCloseTo(1, 12);
    expect(combined.probabilityOf(4)).toBeCloseTo(0.5, 12);
  });

  test('single-roll statistics are unchanged by the refactor', () => {
    const dist = new NumberDistribution([10, 10, 20, 30]);

    expect(dist.min).toBe(10);
    expect(dist.max).toBe(30);
    expect(dist.expected).toBeCloseTo(17.5, 12);
    expect(dist.mode).toBe(10);
    expect(dist.probabilityOfAtLeast(20)).toBeCloseTo(0.5, 12);
    expect(dist.cumulativeProbability(10)).toBeCloseTo(0.5, 12);
  });
});

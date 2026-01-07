class Event<T> {
  value: T;
  id: string;
  probability: number;

  constructor(value: T, id: string, probability: number) {
    this.value = value;
    this.id = id;
    this.probability = probability;
  }
}

/**
 * Partial type that allows each property to be either a static value or a computed function.
 * Enables mixing static and computed values in a single object.
 */
type ComputedPartial<T> = {
  [K in keyof T]?: T[K] | ((value: T) => T[K]);
};

/**
 * Helper function to resolve a property value that could be static or computed.
 */
function resolveValue<T, K extends keyof T>(value: T[K] | ((v: T) => T[K]), context: T): T[K] {
  return typeof value === 'function' ? (value as (v: T) => T[K])(context) : value;
}

export class EventSpace<T> {
  private eventMap: Map<string, Event<T>> = new Map();
  private serializer: (value: T) => string;
  private probabilityFloor: number;

  constructor(
    source: T,
    serializer: (value: T) => string,
    options?: {
      probabilityFloor?: number;
    }
  ) {
    this.serializer = serializer;
    // Min probability floor to avoid floating point issues
    this.probabilityFloor = Math.max(0.000000001, Math.min(options?.probabilityFloor ?? 0, 1));
    const id = serializer(source);
    this.eventMap.set(id, new Event(source, id, 1));
  }

  addTransition(from: T, to: T, probability: number): void {
    if (probability < 0 || probability > 1) {
      throw new Error(`Probability must be between 0 and 1, got ${probability}`);
    }
    if (probability <= this.probabilityFloor) return;

    const fromId = this.serializer(from);
    const toId = this.serializer(to);

    const sourceOutcome = this.eventMap.get(fromId);
    if (!sourceOutcome) {
      throw new Error(`Source node ${fromId} not found in EventSpace`);
    }

    sourceOutcome.probability -= probability;
    if (sourceOutcome.probability <= this.probabilityFloor) {
      this.eventMap.delete(fromId);
    }

    const existingTarget = this.eventMap.get(toId);
    if (existingTarget) {
      existingTarget.probability += probability;
    } else {
      this.eventMap.set(toId, new Event(to, toId, probability));
    }
  }

  getOutcomes(): Event<T>[] {
    return Array.from(this.eventMap.values());
  }

  getLeafOutcomes(): Event<T>[] {
    return Array.from(this.eventMap.values()).filter(e => e.probability > this.probabilityFloor);
  }

  getProbabilityDistribution(): Map<string, number> {
    const distribution = new Map<string, number>();
    for (const [id, outcome] of this.eventMap) {
      distribution.set(id, outcome.probability);
    }
    return distribution;
  }

  /**
   * Filters outcomes by predicate and returns the total probability.
   *
   * @param predicate - Function to identify which outcomes to include
   * @returns Total probability of all outcomes matching the predicate
   */
  getTotalProbability(predicate: (value: T) => boolean = value => true): number {
    return Array.from(this.eventMap.values())
      .filter(e => predicate(e.value))
      .reduce((sum, e) => sum + e.probability, 0);
  }

  getSpaceSize(): number {
    return this.eventMap.size;
  }

  /**
   * Splits a portion of an event off into a new variant by relative weight.
   * The source event's probability is reduced, and a new event is created
   * with the specified partial properties merged in.
   *
   * Supports both static values and computed transformations:
   * - Static: splitEvent(from, {hp: 50}, 0.2)
   * - Computed: splitEvent(from, (e) => ({hp: e.hp + 10}), 0.2)
   * - Mixed: splitEvent(from, {hp: e => e.hp + 10, item: null}, 0.2)
   *
   * @param from - The event to split from (must exist in the space)
   * @param partial - Partial properties (static, computed, or mixed)
   * @param relativeWeight - Fraction of `from`'s probability to move (0-1)
   */
  splitEvent(from: T, partial: Partial<T>, relativeWeight: number): void;
  splitEvent(from: T, partial: (value: T) => Partial<T>, relativeWeight: number): void;
  splitEvent(from: T, partial: ComputedPartial<T>, relativeWeight: number): void;
  splitEvent(from: T, partial: Partial<T> | ((value: T) => Partial<T>) | ComputedPartial<T>, relativeWeight: number): void {
    if (relativeWeight < 0 || relativeWeight > 1) {
      throw new Error(`Relative weight must be between 0 and 1, got ${relativeWeight}`);
    }
    if (relativeWeight <= this.probabilityFloor) return;

    const fromId = this.serializer(from);
    const sourceEvent = this.eventMap.get(fromId);

    if (!sourceEvent) {
      throw new Error(`Source event ${fromId} not found in EventSpace`);
    }

    const probabilityToTransfer = sourceEvent.probability * relativeWeight;

    // Resolve partial - handle static, computed function, or mixed computed partial
    let partialValue: Partial<T>;
    if (typeof partial === 'function') {
      partialValue = (partial as (value: T) => Partial<T>)(from);
    } else {
      // Resolve each property that might be a function
      partialValue = {};
      for (const key in partial) {
        const val = (partial as Record<string, any>)[key];
        (partialValue as Record<string, any>)[key] = typeof val === 'function' ? val(from) : val;
      }
    }

    const newValue = {...from, ...partialValue};
    const newId = this.serializer(newValue);

    // Reduce source probability
    sourceEvent.probability -= probabilityToTransfer;
    if (sourceEvent.probability <= this.probabilityFloor) {
      this.eventMap.delete(fromId);
    }

    // Add or update target event
    const existingTarget = this.eventMap.get(newId);
    if (existingTarget) {
      existingTarget.probability += probabilityToTransfer;
    } else {
      this.eventMap.set(newId, new Event(newValue, newId, probabilityToTransfer));
    }
  }

  /**
   * Distributes an event across multiple variants with explicit weight distribution.
   * The source event is removed, and its probability is distributed among the variants
   * according to their weights (which are normalized).
   *
   * Overloads support both static values and computed transformations in variants.
   *
   * @param from - The event to distribute from (must exist in the space)
   * @param variants - Array of {value: Partial<T>, weight: number} or {value: (T) => Partial<T>, weight: number} pairs
   */
  /**
   * Distributes an event across multiple variants with explicit weight distribution.
   * The source event is removed, and its probability is distributed among the variants
   * according to their weights (which are normalized).
   *
   * Supports both static values and computed transformations in variants.
   *
   * @param from - The event to distribute from (must exist in the space)
   * @param variants - Array of {value: Partial<T>, weight: number} or {value: (T) => Partial<T>, weight: number} pairs
   */
  distributeEvent(from: T, variants: Array<{value: Partial<T>; weight: number}>): void;
  distributeEvent(from: T, variants: Array<{value: (value: T) => Partial<T>; weight: number}>): void;
  distributeEvent(from: T, variants: Array<{value: ComputedPartial<T>; weight: number}>): void;
  distributeEvent(from: T, variants: Array<{value: Partial<T> | ((value: T) => Partial<T>) | ComputedPartial<T>; weight: number}>): void {
    if (variants.length === 0) {
      throw new Error('Must provide at least one variant');
    }

    const fromId = this.serializer(from);
    const sourceEvent = this.eventMap.get(fromId);

    if (!sourceEvent) {
      throw new Error(`Source event ${fromId} not found in EventSpace`);
    }

    const sourceProbability = sourceEvent.probability;
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);

    if (totalWeight <= 0) {
      throw new Error('Total weight must be greater than 0');
    }

    // Remove source event
    this.eventMap.delete(fromId);

    // Distribute to variants
    for (const variant of variants) {
      if (variant.weight < 0) {
        throw new Error(`Variant weight must be non-negative, got ${variant.weight}`);
      }
      if (variant.weight <= this.probabilityFloor) continue;

      const variantProbability = (variant.weight / totalWeight) * sourceProbability;

      // Resolve variant value - handle static, computed function, or mixed computed partial
      let variantValue: Partial<T>;
      if (typeof variant.value === 'function') {
        variantValue = (variant.value as (value: T) => Partial<T>)(from);
      } else {
        // Resolve each property that might be a function
        variantValue = {};
        for (const key in variant.value) {
          const val = (variant.value as Record<string, any>)[key];
          (variantValue as Record<string, any>)[key] = typeof val === 'function' ? val(from) : val;
        }
      }

      const newValue = {...from, ...variantValue};
      const newId = this.serializer(newValue);

      const existingTarget = this.eventMap.get(newId);
      if (existingTarget) {
        existingTarget.probability += variantProbability;
      } else {
        this.eventMap.set(newId, new Event(newValue, newId, variantProbability));
      }
    }
  }

  /**
   * Splits a portion of all events matching a predicate off into new variants.
   * All matching events have their probability reduced, and new events are created
   * with the specified partial properties merged in.
   *
   * Overloads support both static values and computed transformations.
   *
   * @param predicate - Function to identify which events to split from
   * @param partial - Partial properties (static, computed, or mixed)
   * @param relativeWeight - Fraction of each matching event's probability to move (0-1)
   */
  splitEventByFilter(predicate: (value: T) => boolean, partial: Partial<T>, relativeWeight: number): void;
  splitEventByFilter(predicate: (value: T) => boolean, partial: (value: T) => Partial<T>, relativeWeight: number): void;
  splitEventByFilter(predicate: (value: T) => boolean, partial: ComputedPartial<T>, relativeWeight: number): void;
  splitEventByFilter(
    predicate: (value: T) => boolean,
    partial: Partial<T> | ((value: T) => Partial<T>) | ComputedPartial<T>,
    relativeWeight: number
  ): void {
    if (relativeWeight < 0 || relativeWeight > 1) {
      throw new Error(`Relative weight must be between 0 and 1, got ${relativeWeight}`);
    }
    if (relativeWeight <= this.probabilityFloor) return;

    // Find all matching events
    const matchingEvents = Array.from(this.eventMap.values()).filter(e => predicate(e.value));

    if (matchingEvents.length === 0) {
      return; // No events match, nothing to do
    }

    for (const sourceEvent of matchingEvents) {
      const probabilityToTransfer = sourceEvent.probability * relativeWeight;

      // Resolve partial - handle static, computed function, or mixed computed partial
      let partialValue: Partial<T>;
      if (typeof partial === 'function') {
        partialValue = (partial as (value: T) => Partial<T>)(sourceEvent.value);
      } else {
        // Resolve each property that might be a function
        partialValue = {};
        for (const key in partial) {
          const val = (partial as Record<string, any>)[key];
          (partialValue as Record<string, any>)[key] = typeof val === 'function' ? val(sourceEvent.value) : val;
        }
      }

      const newValue = {...sourceEvent.value, ...partialValue};
      const newId = this.serializer(newValue);

      // Reduce source probability
      sourceEvent.probability -= probabilityToTransfer;
      if (sourceEvent.probability <= this.probabilityFloor) {
        this.eventMap.delete(sourceEvent.id);
      }

      // Add or update target event
      const existingTarget = this.eventMap.get(newId);
      if (existingTarget) {
        existingTarget.probability += probabilityToTransfer;
      } else {
        this.eventMap.set(newId, new Event(newValue, newId, probabilityToTransfer));
      }
    }
  }

  /**
   * Distributes all events matching a predicate across multiple variants.
   * All matching events are removed, and their combined probability is distributed
   * among the variants according to their weights (which are normalized).
   *
   * Overloads support both static values and computed transformations in variants.
   *
   * @param predicate - Function to identify which events to distribute
   * @param variants - Array of {value: Partial<T>, weight: number} or {value: (T) => Partial<T>, weight: number} pairs
   */
  distributeEventByFilter(predicate: (value: T) => boolean, variants: Array<{value: Partial<T>; weight: number}>): void;
  distributeEventByFilter(predicate: (value: T) => boolean, variants: Array<{value: (value: T) => Partial<T>; weight: number}>): void;
  distributeEventByFilter(predicate: (value: T) => boolean, variants: Array<{value: ComputedPartial<T>; weight: number}>): void;
  distributeEventByFilter(
    predicate: (value: T) => boolean,
    variants: Array<{value: Partial<T> | ((value: T) => Partial<T>) | ComputedPartial<T>; weight: number}>
  ): void {
    if (variants.length === 0) {
      throw new Error('Must provide at least one variant');
    }

    // Find all matching events and calculate total probability
    const matchingEvents = Array.from(this.eventMap.values()).filter(e => predicate(e.value));

    if (matchingEvents.length === 0) {
      return; // No events match, nothing to do
    }

    const totalSourceProbability = matchingEvents.reduce((sum, e) => sum + e.probability, 0);
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);

    if (totalWeight <= 0) {
      throw new Error('Total weight must be greater than 0');
    }

    // Remove all matching events
    for (const event of matchingEvents) {
      this.eventMap.delete(event.id);
    }

    // Distribute their combined probability to variants
    // If variants use computed functions, apply each variant to each matching event
    // to create all combinations. Otherwise, distribute combined probability proportionally.
    const hasComputedVariants = variants.some(v => typeof v.value === 'function');

    if (hasComputedVariants) {
      // Computed variants: create cross-product of all matching events with all variants
      for (const matchingEvent of matchingEvents) {
        for (const variant of variants) {
          if (variant.weight < 0) {
            throw new Error(`Variant weight must be non-negative, got ${variant.weight}`);
          }
          if (variant.weight <= this.probabilityFloor) continue;

          // Each combination gets weighted by the variant's relative weight
          const variantProbability = (variant.weight / totalWeight) * matchingEvent.probability;

          // Resolve variant value for this specific event
          let variantValue: Partial<T>;
          if (typeof variant.value === 'function') {
            variantValue = (variant.value as (value: T) => Partial<T>)(matchingEvent.value);
          } else {
            variantValue = {};
            for (const key in variant.value) {
              const val = (variant.value as Record<string, any>)[key];
              (variantValue as Record<string, any>)[key] = typeof val === 'function' ? val(matchingEvent.value) : val;
            }
          }

          const newValue = {...matchingEvent.value, ...variantValue};
          const newId = this.serializer(newValue);

          const existingTarget = this.eventMap.get(newId);
          if (existingTarget) {
            existingTarget.probability += variantProbability;
          } else {
            this.eventMap.set(newId, new Event(newValue, newId, variantProbability));
          }
        }
      }
    } else {
      // Static variants: distribute combined probability proportionally
      for (const variant of variants) {
        if (variant.weight < 0) {
          throw new Error(`Variant weight must be non-negative, got ${variant.weight}`);
        }
        if (variant.weight <= this.probabilityFloor) continue;

        const variantProbability = (variant.weight / totalWeight) * totalSourceProbability;
        const baseEvent = matchingEvents[0];
        const variantValue = variant.value as Partial<T>;
        const newValue = {...baseEvent.value, ...variantValue};
        const newId = this.serializer(newValue);

        const existingTarget = this.eventMap.get(newId);
        if (existingTarget) {
          existingTarget.probability += variantProbability;
        } else {
          this.eventMap.set(newId, new Event(newValue, newId, variantProbability));
        }
      }
    }
  }
}

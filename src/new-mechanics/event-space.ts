interface Event<T> {
  readonly value: T;
  readonly id: string;
  probability: number;
}

function createEvent<T>(value: T, id: string, probability: number): Event<T> {
  return {value, id, probability};
}

export class EventSpace<T> {
  private eventMap: Map<string, Event<T>> = new Map();
  private readonly serializer: (value: T) => string;
  private readonly probabilityFloor: number;

  constructor(source: T, serializer: (value: T) => string, options?: {probabilityFloor?: number}) {
    this.serializer = serializer;
    this.probabilityFloor = Math.max(0.000000001, Math.min(options?.probabilityFloor ?? 0, 1));
    const id = serializer(source);
    this.eventMap.set(id, createEvent(source, id, 1));
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
      this.eventMap.set(toId, createEvent(to, toId, probability));
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
   * @param from - The event to split from (must exist in the space)
   * @param partial - Partial properties (static or computed function)
   * @param relativeWeight - Fraction of `from`'s probability to move (0-1)
   */
  splitEvent(from: T, partial: Partial<T> | ((value: T) => Partial<T>), relativeWeight: number): void {
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

    const partialValue = typeof partial === 'function' ? partial(from) : partial;
    const newValue = {...from, ...partialValue};
    const newId = this.serializer(newValue);

    sourceEvent.probability -= probabilityToTransfer;
    if (sourceEvent.probability <= this.probabilityFloor) {
      this.eventMap.delete(fromId);
    }

    const existingTarget = this.eventMap.get(newId);
    if (existingTarget) {
      existingTarget.probability += probabilityToTransfer;
    } else {
      this.eventMap.set(newId, createEvent(newValue, newId, probabilityToTransfer));
    }
  }

  /**
   * Distributes an event across multiple variants with explicit weight distribution.
   * The source event is removed, and its probability is distributed among the variants
   * according to their weights (which are normalized).
   *
   * @param from - The event to distribute from (must exist in the space)
   * @param variants - Array of {value: Partial<T> | (T) => Partial<T>, weight: number} pairs
   */
  distributeEvent(from: T, variants: Array<{value: Partial<T> | ((value: T) => Partial<T>); weight: number}>): void {
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
      const variantValue = typeof variant.value === 'function' ? variant.value(from) : variant.value;
      const newValue = {...from, ...variantValue};
      const newId = this.serializer(newValue);

      const existingTarget = this.eventMap.get(newId);
      if (existingTarget) {
        existingTarget.probability += variantProbability;
      } else {
        this.eventMap.set(newId, createEvent(newValue, newId, variantProbability));
      }
    }
  }

  /**
   * Splits a portion of all events matching a predicate off into new variants.
   * All matching events have their probability reduced, and new events are created
   * by applying the transformer function to a shallow copy.
   *
   * @param predicate - Function to identify which events to split from
   * @param transformer - Function that mutates/transforms a copy of the event
   * @param relativeWeight - Fraction of each matching event's probability to move (0-1)
   */
  splitEventByFilter(predicate: (value: T) => boolean, transformer: (value: T) => void, relativeWeight: number): void {
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

      // Create a shallow copy and apply transformer
      const newValue = {...sourceEvent.value};
      transformer(newValue);
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
        this.eventMap.set(newId, createEvent(newValue, newId, probabilityToTransfer));
      }
    }
  }

  /**
   * Distributes all events matching a predicate across multiple variants.
   * Variants can be a static array or a function that provides per-event variants.
   *
   * @param predicate - Function to identify which events to distribute
   * @param variants - Array or function providing variant transformations with weights
   */
  distributeEventByFilter(
    predicate: (value: T) => boolean,
    variants:
      | Array<{value: Partial<T> | ((value: T) => Partial<T>); weight: number}>
      | ((value: T) => Array<{value: Partial<T> | ((value: T) => Partial<T>); weight: number}>)
  ): void {
    // Find all matching events and calculate total probability
    const matchingEvents = Array.from(this.eventMap.values()).filter(e => predicate(e.value));

    if (matchingEvents.length === 0) {
      return; // No events match, nothing to do
    }

    // Resolve variants - could be an array or a function that returns an array
    const resolvedVariants = typeof variants === 'function' ? variants(matchingEvents[0].value) : variants;

    if (resolvedVariants.length === 0) {
      throw new Error('Must provide at least one variant');
    }

    const totalSourceProbability = matchingEvents.reduce((sum, e) => sum + e.probability, 0);
    const totalWeight = resolvedVariants.reduce((sum, v) => sum + v.weight, 0);

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
    const hasComputedVariants = resolvedVariants.some(v => typeof v.value === 'function');

    if (hasComputedVariants) {
      // Computed variants: create cross-product of all matching events with all variants
      for (const matchingEvent of matchingEvents) {
        for (const variant of resolvedVariants) {
          if (variant.weight < 0) {
            throw new Error(`Variant weight must be non-negative, got ${variant.weight}`);
          }
          if (variant.weight <= this.probabilityFloor) continue;

          // Each combination gets weighted by the variant's relative weight
          const variantProbability = (variant.weight / totalWeight) * matchingEvent.probability;
          const variantValue = typeof variant.value === 'function' ? variant.value(matchingEvent.value) : variant.value;
          const newValue = {...matchingEvent.value, ...variantValue};
          const newId = this.serializer(newValue);

          const existingTarget = this.eventMap.get(newId);
          if (existingTarget) {
            existingTarget.probability += variantProbability;
          } else {
            this.eventMap.set(newId, createEvent(newValue, newId, variantProbability));
          }
        }
      }
    } else {
      for (const variant of resolvedVariants) {
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
          this.eventMap.set(newId, createEvent(newValue, newId, variantProbability));
        }
      }
    }
  }

  /**
   * Distributes all events matching a predicate to context-specific variants.
   * Calls variantsProvider once per matching event to generate variants
   * that can adapt based on each event's state.
   *
   * @param predicate - Function to identify which events to distribute
   * @param variantsProvider - Function called for each matching event returning variant array
   */
  distributeEventByFilterPerEvent(
    predicate: (value: T) => boolean,
    variantsProvider: (value: T) => Array<{value: Partial<T> | ((value: T) => Partial<T>); weight: number}>
  ): void {
    // Find all matching events
    const matchingEvents = Array.from(this.eventMap.values()).filter(e => predicate(e.value));

    if (matchingEvents.length === 0) {
      return; // No events match, nothing to do
    }

    // Remove all matching events
    for (const event of matchingEvents) {
      this.eventMap.delete(event.id);
    }

    // For each matching event, get its variants and distribute independently
    for (const matchingEvent of matchingEvents) {
      const resolvedVariants = variantsProvider(matchingEvent.value);

      if (resolvedVariants.length === 0) {
        throw new Error('Variants provider must return at least one variant');
      }

      const totalWeight = resolvedVariants.reduce((sum, v) => sum + v.weight, 0);

      if (totalWeight <= 0) {
        throw new Error('Total weight must be greater than 0');
      }

      // Distribute this event's probability to its variants
      for (const variant of resolvedVariants) {
        if (variant.weight < 0) {
          throw new Error(`Variant weight must be non-negative, got ${variant.weight}`);
        }
        if (variant.weight <= this.probabilityFloor) continue;

        const variantProbability = (variant.weight / totalWeight) * matchingEvent.probability;

        // Resolve variant value
        const variantValue = typeof variant.value === 'function' ? variant.value(matchingEvent.value) : variant.value;
        const newValue = {...matchingEvent.value, ...variantValue};
        const newId = this.serializer(newValue);

        const existingTarget = this.eventMap.get(newId);
        if (existingTarget) {
          existingTarget.probability += variantProbability;
        } else {
          this.eventMap.set(newId, createEvent(newValue, newId, variantProbability));
        }
      }
    }
  }
}

interface Event<T> {
  readonly value: T;
  readonly id: string;
  probability: number;
}

interface Variant<T> {
  value: Partial<T> | ((value: T) => Partial<T>);
  weight: number;
}

interface Transformation<T> {
  transform: (value: T) => void;
  weight: number;
}

function createEvent<T>(value: T, id: string, probability: number): Event<T> {
  return {value, id, probability};
}

export class EventSpace<T> {
  private eventMap: Map<string, Event<T>> = new Map();
  private readonly serializer: (value: T) => string;
  private readonly probabilityFloor: number;

  // ============================================================================
  // Constructor & Initialization
  // ============================================================================

  constructor(source: T | Array<{value: T; weight: number}>, serializer: (value: T) => string, options?: {probabilityFloor?: number}) {
    this.serializer = serializer;
    this.probabilityFloor = Math.max(0.000000001, Math.min(options?.probabilityFloor ?? 0, 1));

    if (Array.isArray(source)) {
      this.initializeFromWeightedArray(source);
    } else {
      const id = serializer(source);
      this.eventMap.set(id, createEvent(source, id, 1));
    }
  }

  private initializeFromWeightedArray(source: Array<{value: T; weight: number}>): void {
    const totalWeight = source.reduce((sum, entry) => sum + Math.max(entry.weight, 0), 0);

    if (totalWeight <= 0) throw new Error('Total weight must be greater than 0');

    for (const entry of source) {
      const weight = Math.max(entry.weight, 0);
      if (weight > 0) {
        const id = this.serializer(entry.value);
        const probability = weight / totalWeight;
        if (this.isAboveFloor(probability)) {
          this.eventMap.set(id, createEvent(entry.value, id, probability));
        }
      }
    }

    if (this.eventMap.size === 0) throw new Error('Must provide at least one event with weight above the floor');
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Validates that a probability value is in the range [0, 1].
   */
  private validateProbability(value: number, name: string = 'Probability'): void {
    if (value < 0 || value > 1) {
      throw new Error(`${name} must be between 0 and 1, got ${value}`);
    }
  }

  /**
   * Checks if a probability is above the floor threshold.
   */
  private isAboveFloor(probability: number): boolean {
    return probability > this.probabilityFloor;
  }

  /**
   * Checks if a probability is below or at the floor threshold.
   */
  private isBelowOrAtFloor(probability: number): boolean {
    return probability <= this.probabilityFloor;
  }

  /**
   * Retrieves an event by its serialized ID, throwing if not found.
   */
  private getEventByValue(value: T, errorContext: string = ''): Event<T> {
    const id = this.serializer(value);
    const event = this.eventMap.get(id);
    if (!event) {
      throw new Error(`${errorContext} Event ${id} not found in EventSpace`);
    }
    return event;
  }

  /**
   * Transfers probability from a source event to a target value,
   * removing the source if its probability drops below the floor.
   */
  private transferProbability(source: Event<T>, targetValue: T, amount: number): void {
    source.probability -= amount;
    if (this.isBelowOrAtFloor(source.probability)) {
      this.eventMap.delete(source.id);
    }
    this.addEventProbability(targetValue, amount);
  }

  /**
   * Adds probability to an existing event or creates a new one if it doesn't exist.
   */
  private addEventProbability(value: T, probability: number): void {
    const id = this.serializer(value);
    const existing = this.eventMap.get(id);
    if (existing) {
      existing.probability += probability;
    } else {
      this.eventMap.set(id, createEvent(value, id, probability));
    }
  }

  /**
   * Resolves a value or function to a partial object.
   */
  private resolvePartial(partialOrFn: Partial<T> | ((value: T) => Partial<T>), value: T): Partial<T> {
    return typeof partialOrFn === 'function' ? partialOrFn(value) : partialOrFn;
  }

  /**
   * Merges a partial into a value and returns the new value.
   */
  private mergeValue(value: T, partial: Partial<T>): T {
    return {...value, ...partial};
  }

  /**
   * Clones a value and applies a transformation function to it.
   */
  private cloneAndTransform(value: T, transform: (value: T) => void): T {
    const newValue = {...value};
    transform(newValue);
    return newValue;
  }

  /**
   * Validates and calculates the total weight from an array.
   */
  private calculateTotalWeight(weights: number[]): number {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight <= 0) {
      throw new Error('Total weight must be greater than 0');
    }
    return totalWeight;
  }

  /**
   * Normalizes an array of weights to sum to 1.0.
   */
  private normalizeWeights(weights: number[], totalWeight: number): number[] {
    return weights.map(w => w / totalWeight);
  }

  /**
   * Gets all events matching a predicate.
   */
  private getMatchingEvents(predicate: (value: T) => boolean): Event<T>[] {
    return Array.from(this.eventMap.values()).filter(e => predicate(e.value));
  }

  /**
   * Removes all events matching a predicate from the map.
   */
  private removeMatchingEvents(predicate: (value: T) => boolean): Event<T>[] {
    const matching = this.getMatchingEvents(predicate);
    for (const event of matching) {
      this.eventMap.delete(event.id);
    }
    return matching;
  }

  /**
   * Validates that a weighted variant array contains at least one item with weight > 0.
   */
  private validateVariants<U extends {weight: number}>(items: U[], name: string = 'Variants'): void {
    if (items.length === 0) {
      throw new Error(`${name} array must not be empty`);
    }
    if (items.some(item => item.weight < 0)) {
      throw new Error(`${name} weights must be non-negative`);
    }
  }

  // ============================================================================
  // Event Queries
  // ============================================================================

  getOutcomes(): Event<T>[] {
    return Array.from(this.eventMap.values());
  }

  getLeafOutcomes(): Event<T>[] {
    return this.getOutcomes().filter(e => this.isAboveFloor(e.probability));
  }

  getProbabilityDistribution(): Map<string, number> {
    const distribution = new Map<string, number>();
    for (const [id, event] of this.eventMap) {
      distribution.set(id, event.probability);
    }
    return distribution;
  }

  /**
   * Filters outcomes by predicate and returns the total probability.
   */
  getTotalProbability(predicate: (value: T) => boolean = () => true): number {
    return this.getOutcomes()
      .filter(e => predicate(e.value))
      .reduce((sum, e) => sum + e.probability, 0);
  }

  getSpaceSize(): number {
    return this.eventMap.size;
  }

  getEvents(predicate: (value: T) => boolean): Event<T>[] {
    return this.getMatchingEvents(predicate);
  }

  // ============================================================================
  // Single Event Transformations
  // ============================================================================

  addTransition(from: T, to: T, probability: number): void {
    this.validateProbability(probability, 'Transition probability');
    if (this.isBelowOrAtFloor(probability)) return;

    const source = this.getEventByValue(from, 'Source');
    this.transferProbability(source, to, probability);
  }

  /**
   * Splits a portion of an event off into a new variant by relative weight.
   */
  splitEvent(from: T, partial: Partial<T> | ((value: T) => Partial<T>), relativeWeight: number): void {
    this.validateProbability(relativeWeight, 'Relative weight');
    if (this.isBelowOrAtFloor(relativeWeight)) return;

    const source = this.getEventByValue(from, 'Source');
    const probabilityToTransfer = source.probability * relativeWeight;
    const resolvedPartial = this.resolvePartial(partial, from);
    const newValue = this.mergeValue(from, resolvedPartial);

    this.transferProbability(source, newValue, probabilityToTransfer);
  }

  /**
   * Distributes an event across multiple variants with explicit weight distribution.
   */
  distributeEvent(from: T, variants: Variant<T>[]): void {
    const source = this.getEventByValue(from, 'Source');
    this.eventMap.delete(source.id);
    this.applyVariants(source, variants, from);
  }

  // ============================================================================
  // Filtered Event Transformations
  // ============================================================================

  /**
   * Splits a portion of all matching events into variants.
   */
  splitEventByFilter(predicate: (value: T) => boolean, transformer: (value: T) => void, relativeWeight: number): void {
    this.validateProbability(relativeWeight, 'Relative weight');
    if (this.isBelowOrAtFloor(relativeWeight)) return;

    const matchingEvents = this.getMatchingEvents(predicate);
    if (matchingEvents.length === 0) return;

    for (const source of matchingEvents) {
      const probabilityToTransfer = source.probability * relativeWeight;
      const newValue = this.cloneAndTransform(source.value, transformer);
      this.transferProbability(source, newValue, probabilityToTransfer);
    }
  }

  /**
   * Applies static transformations to all matching events.
   * Delegates to transformEventByFilterPerEvent with a constant transformer.
   */
  transformEventByFilter(predicate: (value: T) => boolean, transformations: Transformation<T>[]): void {
    this.transformEventByFilterPerEvent(predicate, () => transformations);
  }

  /**
   * Applies context-dependent transformations to all matching events.
   * Each matching event is replaced by weighted outcome variants.
   */
  transformEventByFilterPerEvent(predicate: (value: T) => boolean, transformer: (value: T) => Transformation<T>[]): void {
    const matchingEvents = this.removeMatchingEvents(predicate);
    if (matchingEvents.length === 0) return;

    for (const source of matchingEvents) {
      this.applyTransformations(source, transformer(source.value));
    }
  }

  /**
   * Generic helper to apply weighted items (transformations or variants) to a single event.
   */
  private applyWeightedItems<U extends {weight: number}>(
    sourceEvent: Event<T>,
    items: U[],
    itemName: string,
    createValue: (item: U, index: number, fromValue: T) => T
  ): void {
    if (items.length === 0) {
      throw new Error(`${itemName} must contain at least one item`);
    }

    this.validateVariants(items, itemName);
    const weights = items.map(item => item.weight);
    const totalWeight = this.calculateTotalWeight(weights);
    const normalized = this.normalizeWeights(weights, totalWeight);

    for (let i = 0; i < items.length; i++) {
      if (this.isBelowOrAtFloor(normalized[i])) continue;

      const probability = normalized[i] * sourceEvent.probability;
      const newValue = createValue(items[i], i, sourceEvent.value);

      this.addEventProbability(newValue, probability);
    }
  }

  /**
   * Helper: Applies weighted transformations to a single event.
   */
  private applyTransformations(sourceEvent: Event<T>, transformations: Transformation<T>[]): void {
    this.applyWeightedItems(sourceEvent, transformations, 'Transformations', (transformation, _, fromValue) =>
      this.cloneAndTransform(fromValue, transformation.transform)
    );
  }

  /**
   * Distributes all matching events to context-specific variants.
   * Delegates to distributeEventByFilterPerEvent with a constant variants provider.
   */
  distributeEventByFilter(predicate: (value: T) => boolean, variants: Variant<T>[]): void {
    this.distributeEventByFilterPerEvent(predicate, () => variants);
  }

  /**
   * Distributes all matching events to context-specific variants.
   * Each matching event is replaced by weighted outcome variants.
   */
  distributeEventByFilterPerEvent(predicate: (value: T) => boolean, variantsProvider: (value: T) => Variant<T>[]): void {
    const matchingEvents = this.removeMatchingEvents(predicate);
    if (matchingEvents.length === 0) return;

    for (const source of matchingEvents) {
      const variants = variantsProvider(source.value);
      this.applyVariants(source, variants, source.value);
    }
  }

  /**
   * Helper: Applies weighted variants to a single event.
   */
  private applyVariants(sourceEvent: Event<T>, variants: Variant<T>[], fromValue: T): void {
    this.applyWeightedItems(sourceEvent, variants, 'Variants', (variant, _, sourceValue) => {
      const resolvedPartial = this.resolvePartial(variant.value, sourceValue);
      return this.mergeValue(sourceValue, resolvedPartial);
    });
  }

  // ============================================================================
  // Projections & Utilities
  // ============================================================================

  /**
   * Clones this EventSpace into a new independent instance with the same state.
   */
  clone(): EventSpace<T> {
    const outcomes = this.getOutcomes();
    const weighted = outcomes.map(e => ({
      value: {...e.value},
      weight: e.probability,
    }));
    return new EventSpace(weighted, this.serializer, {probabilityFloor: this.probabilityFloor});
  }

  /**
   * Projects this EventSpace into a sub-space using a different serializer.
   * Probabilities of events that map to the same ID are aggregated.
   */
  projectToSubspace(newSerializer: (value: T) => string): EventSpace<T> {
    const outcomes = this.getOutcomes();
    if (outcomes.length === 0) throw new Error('Cannot project empty EventSpace to subspace');

    const aggregatedMap = new Map<string, T>();
    const aggregatedProbabilities = new Map<string, number>();

    for (const event of outcomes) {
      const newId = newSerializer(event.value);
      if (!aggregatedMap.has(newId)) {
        aggregatedMap.set(newId, event.value);
      }

      const currentProb = aggregatedProbabilities.get(newId) ?? 0;
      aggregatedProbabilities.set(newId, currentProb + event.probability);
    }

    const initialValues = Array.from(aggregatedMap.entries()).map(([id, value]) => ({
      value,
      weight: aggregatedProbabilities.get(id) ?? 0,
    }));

    return new EventSpace(initialValues, newSerializer, {probabilityFloor: this.probabilityFloor});
  }
}

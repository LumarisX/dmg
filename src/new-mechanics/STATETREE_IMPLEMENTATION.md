# StateTree Implementation Summary

## Overview

Created `StateTree<T>` - a bidirectional tree structure for tracking state transformations with probability tracking.

### Key Differences from DAG

| Aspect                 | DAG                        | StateTree                                        |
| ---------------------- | -------------------------- | ------------------------------------------------ |
| **Nodes**              | Generic `T`                | Generic `T` (typically `DMG.PokemonState`)       |
| **Edges**              | Transitions between states | Transformations with functions                   |
| **Purpose**            | Event space tracking       | Pokemon state evolution tracking                 |
| **Edge Data**          | Simple probability         | Transformation function + probability + metadata |
| **Serialization**      | Serializes nodes           | Serializes states for node ID                    |
| **Cache Invalidation** | On modification            | On modification                                  |

## StateTree API

### Constructor

```typescript
new StateTree<T>(source: T, serializer: (state: T) => string, options?)
```

### Core Methods

- **`addTransformations(fromState: T, transformations: Transformation<T>[]): void`**

  - Add multiple transformations from one state to variants
  - Normalizes probabilities automatically
  - Each transformation includes: `transform` function, `probability`, optional `metadata`

- **`addTransformation(fromState: T, toState: T, probability: number): void`**

  - Simple single transformation

- **`getOutcomes(): StateOutcome<T>[]`**

  - Get all leaf node outcomes with probabilities and paths
  - Includes: `state`, `id`, `probability`, `path[]`

- **`getProbabilityDistribution(): Map<string, number>`**

  - Map of state ID to probability

- **`getPaths(): Array<{states: T[]; probability: number}>`**

  - All root-to-leaf paths with their probabilities

- **`getStats(): StateTreeStats`**

  - Tree statistics (nodes, edges, max depth, leaf count, etc.)

- **`clone(): StateTree<T>`**
  - Deep copy of structure and states

### Visualization

- **`visualize(maxDepth?, label?): void`** - Console tree visualization
- **`toGraphviz(maxDepth?, label?): string`** - Graphviz DOT format export

## Usage in poc.ts

### Before (with DAG wrapping EventSpace)

```typescript
const turnDAG = new DAG(target.states.clone(), eventSpaceSerializer);
let previousStateSpace = target.states.clone();
computeHit(attacker, target, move);
let currentStateSpace = target.states.clone();
turnDAG.addTransition(previousStateSpace, currentStateSpace, 1.0);
```

### After (direct StateTree)

```typescript
const stateTree = new StateTree(initialState, stateSerializer);

for (const targetOutcome of targetOutcomes) {
  for (const attackerOutcome of attackerOutcomes) {
    const hitOutcomes = getHitOutcomes(...);
    const transformations = hitOutcomes.map(hitOutcome => ({
      transform: (state) => {
        const newState = structuredClone(state);
        newState.hp = Math.max(newState.hp - hitOutcome.value.damage, 0);
        // Apply item effects, etc.
        return newState;
      },
      probability: hitOutcome.probability * combinedProbability,
      metadata: { hitDescription: `damage:${hitOutcome.value.damage}` }
    }));

    stateTree.addTransformations(targetState, transformations);
  }
}
```

## Benefits

1. **Direct state tracking**: Nodes are actual Pokemon states, not event spaces
2. **Clear transformations**: Edges explicitly contain transform functions
3. **Probability preserved**: Each transformation's probability is tracked and normalized
4. **Bidirectional**: Both parent and child references maintained
5. **Metadata support**: Each transformation can carry context about the hit
6. **Flexible serialization**: Custom serializer determines state identity
7. **Caching**: Outcome collection is cached and invalidated on modification

## Type Exports

- `StateTree<T>` - Main tree class
- `StateOutcome<T>` - Outcome with state, ID, probability, path
- `StateTreeStats` - Statistics type
- `Transformation<T>` - Edge transformation type (internal)

## Multi-Hit Move Support

The `computeTurn` function now properly handles multi-hit moves by:

1. Computing initial hit transformations
2. For each subsequent hit, iterating over current tree outcomes
3. Adding new transformations from each outcome state
4. Building up the probability tree across all hits

This naturally captures the branching of possible hit sequences and damage rolls.

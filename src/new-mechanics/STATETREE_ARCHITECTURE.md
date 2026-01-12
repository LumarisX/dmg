# StateTree Architecture Guide

## Data Structure Diagram

```
StateNode (DMG.PokemonState)
├── id: string (serialized state)
├── state: T (the actual Pokemon state)
├── depth: number
├── parentEdges: [{parent, probability}]
└── childEdges: Map<string, {node, probability}>

StateTree<T>
├── nodeMap: Map<string, StateNode<T>>
├── root: StateNode<T>
├── serializer: (state: T) => string
├── probabilityFloor: number
├── edgeCount: number
└── outcomesCache: StateOutcome<T>[] | null
```

## Probability Flow Example

### Initial State

```
Pokemon HP: 100, Item: Sitrus Berry
                    |
                 probability: 1.0
```

### After First Hit (Multiple Damage Rolls)

```
                  HP: 100
                    |
        ┌───────────┼───────────┐
      (1/16)     (1/16)     (1/16)
        |           |           |
      HP:85       HP:80       HP:75
        |           |           |
     prob:        prob:        prob:
    1/16          1/16         1/16
    (0.0625)      (0.0625)     (0.0625)
```

### With Critical Hit Split

```
              HP: 100
                |
        ┌───────┴──────┐
      85% (normal)  15% (critical)
        |              |
    ┌───┼───┐       ┌───┼───┐
   1/16 1/16 ...  1/16 1/16 ...
    |    |         |    |
   HP80 HP75 ...  HP70 HP60 ...
   prob: prob:    prob: prob:
  0.0531 0.0469  0.0938 0.0938
```

## Transformation Types

### 1. Damage Distribution Split

```typescript
const transformations = damageRolls.map(damage => ({
  transform: state => {
    const newState = structuredClone(state);
    newState.hp = Math.max(newState.hp - damage, 0);
    return newState;
  },
  probability: 1 / 16, // Normalized across all rolls
  metadata: {damage, roll: 1 / 16},
}));

tree.addTransformations(currentState, transformations);
```

### 2. Conditional Effects

```typescript
const transformations = [
  {
    // Miss branch
    transform: state => state, // No change
    probability: 0.1, // 10% miss chance
    metadata: {event: 'miss'},
  },
  {
    // Hit branch
    transform: state => ({...state, hp: state.hp - 30}),
    probability: 0.9, // 90% hit chance
    metadata: {event: 'hit'},
  },
];

tree.addTransformations(currentState, transformations);
```

### 3. Multi-Hit Sequences

```
Hit 1: Split state into N outcomes
       |
       v
Hit 2: For each outcome, split into M variants
       |
       v
Hit 3: For each outcome, split into K variants
       |
       v
Final: Compound probabilities through the tree
```

Example: Triple Kick (3 hits, 2^3 = 8 possible sequences)

```
                    Start (HP: 100)
                         |
         ┌───────────────┬┴┬───────────────┐
       Hit1a          Hit1b          Hit1c
      (1/3)          (1/3)          (1/3)
      HP:90         HP:85          HP:80
        |              |              |
    ┌───┼───┐      ┌────┼────┐   ┌────┼────┐
  Hit2a Hit2b   Hit2a Hit2b  Hit2a Hit2b
  (1/3) (1/3)   (1/3) (1/3)   (1/3) (1/3)
   |      |      |      |      |      |
  Hit3a Hit3a  Hit3a Hit3a   Hit3a Hit3a
  (1/3) (1/3)  (1/3) (1/3)   (1/3) (1/3)
   |      |      |      |      |      |
  Final states with compound probabilities
  Each leaf = (1/3 * 1/3 * 1/3) = 1/27
```

## Probability Tracking

### Outcome Calculation

```typescript
outcomes = tree.getOutcomes();
// [
//   {state: {hp: 90}, probability: 0.15, path: [root.id, node1.id]},
//   {state: {hp: 85}, probability: 0.30, path: [root.id, node2.id]},
//   {state: {hp: 80}, probability: 0.55, path: [root.id, node3.id]},
// ]
// Sum of probabilities ≈ 1.0 (or 1 - prunedMass due to probability floor)
```

### Normalization

When adding transformations:

```typescript
totalWeight = sum(transformation.probability);
normalizedProb = transformation.probability / totalWeight;

// All transformations sum to 1.0 after normalization
```

## Caching Strategy

```
Modification Operations          Cache Invalidation
├── addTransformation(...)   →   outcomesCache = null
├── addTransformations(...)  →   distributionCache = null
└── (future ops...)

Query Operations (use cache)
├── getOutcomes()            →   Cache on first call
├── getProbabilityDistribution() → Cache on first call
└── getStats()               →   Uses cached outcomes
```

## Bidirectional Edges

```typescript
// Forward edge (parent → child)
fromNode.childEdges.set(toNode.id, {node: toNode, probability: 0.5});

// Backward edge (child → parent)
toNode.parentEdges.push({parent: fromNode, probability: 0.5});

// This enables:
// 1. Forward traversal: parent.childEdges
// 2. Backward traversal: child.parentEdges
// 3. Cycle detection: check if parent/child relationships form loops
```

## Serialization Strategy

The serializer determines state identity:

```typescript
// Coarse serialization (fewer unique states)
state => `hp:${state.hp}|item:${state.item}`;
// Results in: "hp:90|item:Sitrus Berry"

// Fine-grained serialization (more unique states)
state => `hp:${state.hp}|item:${state.item}|ability:${state.ability}|boost:${state.boosts.atk}`;
// Results in: "hp:90|item:Sitrus Berry|ability:Thick Fat|boost:1"

// Both states map to same ID → merged outcomes with summed probability
// Different states map to different IDs → separate nodes
```

## Performance Characteristics

| Operation              | Time    | Space                                           |
| ---------------------- | ------- | ----------------------------------------------- |
| `addTransformations()` | O(k)    | O(1) where k = # transformations                |
| `getOutcomes()`        | O(n)    | O(n) where n = # unique outcomes (cached after) |
| `getStats()`           | O(1)    | O(1) (uses cached outcomes)                     |
| `clone()`              | O(n\*m) | O(n\*m) where n = nodes, m = edges per node     |
| `visualize()`          | O(n)    | O(1) (streaming output)                         |

Cache invalidation is minimal—only on tree modifications.

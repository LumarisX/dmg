# StateTree - Key Advantages Over DAG Wrapper

## Problem Statement (Previous Approach)

```typescript
export type TurnDAG = DAG<EventSpace<DMG.PokemonState>>;
```

The old approach wrapped `EventSpace<DMG.PokemonState>` in a `DAG`, creating an abstraction layer that obscured the actual state transitions:

- **Nodes** were `EventSpace` objects containing multiple states
- **Edges** were simple probability values
- To get actual Pokemon states, you had to: `dag.getOutcomes()[i].value.getOutcomes()[j].value`
- State transformations were implicit (happening inside EventSpace operations)
- Hard to visualize the actual damage/state flow

## Solution: Direct StateTree

```typescript
export type TurnStateTree = StateTree<DMG.PokemonState>;
```

The new approach tracks Pokemon states directly as nodes:

### 1. **Clarity**: States Are First-Class Citizens

```typescript
// OLD: Nested outcomes from DAG then EventSpace
const nestedOutcomes = dag.getOutcomes(); // Returns Outcome<EventSpace>[]
const actualStates = nestedOutcomes[0].value.getOutcomes(); // Need to dig deeper

// NEW: Direct state access
const states = stateTree.getOutcomes(); // Returns StateOutcome<DMG.PokemonState>[]
const state = states[0].state; // Direct access
```

### 2. **Transformations Are Explicit**

```typescript
// OLD: State changes hidden in EventSpace operations
target.states.transformEventByFilter(
  predicate,
  transformations // Black box operations
);

// NEW: Transformations are visible and trackable
stateTree.addTransformations(currentState, [
  {
    transform: state => ({...state, hp: state.hp - 30}),
    probability: 0.5,
    metadata: {damage: 30, isCrit: false}, // Documented
  },
  // ... more variants
]);
```

### 3. **Probability Flow Is Transparent**

```typescript
// OLD: Probabilities tracked at EventSpace level only
// Unclear how damage roll probabilities compose through turns

// NEW: Every edge has explicit probability
stateTree.getOutcomes().forEach(outcome => {
  console.log(`State: HP=${outcome.state.hp}, Probability: ${outcome.probability}`);
  // Path shows how we got here:
  console.log(`Path: ${outcome.path.join(' → ')}`);
});
```

### 4. **Metadata Enrichment**

```typescript
// OLD: No way to attach context to transitions
dag.addTransition(space1, space2, probability);

// NEW: Rich metadata on each edge
stateTree.addTransformations(state, [
  {
    transform: /* ... */,
    probability: 0.5,
    metadata: {
      hitNumber: 1,
      damageRoll: 28,
      isCritical: false,
      itemTriggered: 'Sitrus Berry',
      reason: 'HP below 50%'
    }
  }
]);
```

### 5. **Type Safety**

```typescript
// StateTree is generic
const tree: StateTree<DMG.PokemonState>;

// All transformations must return same type
const transform: (state: DMG.PokemonState) => DMG.PokemonState;

// Outcomes are properly typed
const outcomes: StateOutcome<DMG.PokemonState>[] = tree.getOutcomes();
```

## Practical Example: Multi-Hit Move

### Old DAG Approach

```typescript
// Create DAG of EventSpaces
const turnDAG = new DAG(target.states.clone(), serializer);
let previousStateSpace = target.states.clone();

// First hit
computeHit(attacker, target, move);
let currentStateSpace = target.states.clone();
turnDAG.addTransition(previousStateSpace, currentStateSpace, 1.0);

// Second hit
computeHit(attacker, target, move);
currentStateSpace = target.states.clone();
turnDAG.addTransition(previousStateSpace, currentStateSpace, 1.0);

// Problem: currentStateSpace contains all previous hit effects mixed in
// Can't easily trace which damage outcomes came from which hits
```

### New StateTree Approach

```typescript
// Create tree of states
const stateTree = new StateTree(initialState, serializer);

// First hit: explicit transformations
const hit1Transformations = hitOutcomes.map(hit => ({
  transform: state => ({...state, hp: state.hp - hit.damage}),
  probability: hit.probability,
  metadata: {hitNumber: 1, damage: hit.damage},
}));
stateTree.addTransformations(initialState, hit1Transformations);

// Second hit: build on first hit outcomes
const hit1Outcomes = stateTree.getOutcomes();
for (const outcome of hit1Outcomes) {
  const hit2Transformations = hitOutcomes.map(hit => ({
    transform: state => ({...state, hp: state.hp - hit.damage}),
    probability: hit.probability,
    metadata: {hitNumber: 2, damage: hit.damage, previousHP: outcome.state.hp},
  }));
  stateTree.addTransformations(outcome.state, hit2Transformations);
}

// Benefit: Clear separation of hits, easy to trace damage flow
// Each outcome path shows exactly which damages happened
```

## Performance Characteristics

| Operation              | Time Complexity | Notes                                       |
| ---------------------- | --------------- | ------------------------------------------- |
| `addTransformations()` | O(k)            | k = number of transformations, near-instant |
| `getOutcomes()`        | O(n)            | n = unique states, cached after first call  |
| `getPaths()`           | O(p)            | p = number of paths, not cached (on-demand) |
| `clone()`              | O(n\*m)         | n = nodes, m = avg edges per node           |

Cache strategy:

- Outcomes cached after first traversal
- Cache invalidated only on `addTransformations()` call
- Subsequent queries are O(1)

## Memory Usage

```
DAG<EventSpace<T>>:
  - DAG nodes: EventSpace objects
  - EventSpace contains: Map<id, Event<T>>
  - Each Event contains: value (T), probability
  - Total: O(n * m) where n = EventSpaces, m = states per EventSpace

StateTree<T>:
  - StateTree nodes: StateNode<T>
  - Each node: {state: T, id, parentEdges[], childEdges Map}
  - Total: O(n) where n = total unique states across all outcomes

Result: More efficient for densely connected state spaces
```

## Debugging & Visualization

### Old Approach

```typescript
dag.visualize(); // Shows tree of EventSpaces, not helpful for understanding state flow

// Sample output:
//   └─ [100%] [object Object]
//     └─ [50%] [object Object]
//     └─ [50%] [object Object]
```

### New Approach

```typescript
stateTree.visualize(3, state => `HP:${state.hp} Item:${state.item}`);

// Sample output:
//   └─ [100%] HP:100 Item:Sitrus Berry
//     └─ [50%] HP:85 Item:Sitrus Berry
//     └─ [50%] HP:75 Item:null (consumed)

// Export to Graphviz for visualization
const dot = stateTree.toGraphviz(4, state => `HP:${state.hp}`);
// Can render: dot -Tpng tree.dot -o tree.png
```

## Code Readability

### Old

```typescript
// computeTurn returns TurnDAG
// which is DAG<EventSpace<DMG.PokemonState>>
// which has nodes that are EventSpace<DMG.PokemonState>
// which have outcomes Outcome<DMG.PokemonState>

const result: TurnDAG = computeTurn(...);
```

### New

```typescript
// computeTurn returns TurnStateTree
// which is StateTree<DMG.PokemonState>
// which has nodes that are DMG.PokemonState
// which have outcomes StateOutcome<DMG.PokemonState>

const result: TurnStateTree = computeTurn(...);
```

The new approach is self-documenting—the type tells you exactly what you're working with.

## Extension Possibilities

The StateTree structure enables future enhancements:

1. **State Filtering**: Only track states matching criteria

   ```typescript
   tree.filterOutcomes(s => s.hp > 0);
   ```

2. **State Aggregation**: Merge similar states

   ```typescript
   tree.aggregateStates(threshold, compareFn);
   ```

3. **Probability Recalculation**: Update probabilities retroactively

   ```typescript
   tree.recalculateProbabilities(newDistribution);
   ```

4. **Constraint Propagation**: Update tree when constraints change

   ```typescript
   tree.constrainStates(predicate);
   ```

5. **Sampling**: Draw random sequences from distribution
   ```typescript
   tree.samplePath(); // Random root-to-leaf
   ```

---

## Summary

| Aspect                   | DAG<EventSpace>              | StateTree                |
| ------------------------ | ---------------------------- | ------------------------ |
| **What nodes are**       | EventSpace objects           | Pokemon states           |
| **What edges mean**      | EventSpace transitions       | State transformations    |
| **Probability tracking** | At EventSpace level          | At edge level            |
| **Readability**          | Requires mental mapping      | Direct and clear         |
| **Extensibility**        | Limited by EventSpace design | Open to state operations |
| **Visualization**        | Generic tree structure       | State-aware with labels  |
| **Type safety**          | Good but nested              | Excellent and direct     |
| **Metadata support**     | None                         | Full (via edge metadata) |

**Result**: StateTree is a more natural fit for Pokemon battle simulation, providing better clarity, explicit transformations, and direct state tracking.

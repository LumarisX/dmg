# StateTree Implementation - Summary of Changes

## Files Created

### 1. `state-tree.ts` (New)

A complete implementation of `StateTree<T>` - a bidirectional tree structure for tracking state transformations with probability tracking.

**Key Features:**

- Generic type `T` for any state object (typically `DMG.PokemonState`)
- Nodes store actual state objects, not event spaces
- Edges are transformations (functions) with associated probabilities
- Bidirectional parent-child relationships for forward/backward traversal
- Automatic probability normalization
- Probability floor filtering (prunes negligible branches)
- Outcome caching for performance
- Comprehensive visualization (console + Graphviz DOT export)
- Full path tracking through the tree

**Type Exports:**

- `StateTree<T>` - Main class
- `StateOutcome<T>` - Outcome type with state, ID, probability, path
- `StateTreeStats` - Statistics type

**Method Summary:**

- `addTransformations()` - Add batch transformations with probabilities
- `addTransformation()` - Add single transformation
- `getOutcomes()` - Get leaf node outcomes (cached)
- `getProbabilityDistribution()` - Map of state ID to probability
- `getPaths()` - All root-to-leaf paths with probabilities
- `getStats()` - Tree statistics
- `clone()` - Deep copy of tree structure
- `visualize()` - Console tree visualization
- `toGraphviz()` - Export to Graphviz format

---

## Files Modified

### 1. `poc.ts`

**Changes:**

- Replaced `import { DAG } from './dag'` with `import { StateTree } from './state-tree'`
- Changed `TurnDAG` type to `TurnStateTree` (now `StateTree<DMG.PokemonState>`)
- Completely rewrote `computeTurn()` function to:
  - Initialize StateTree directly with a Pokemon state (not EventSpace)
  - Process each target/attacker state combination
  - Calculate hit outcomes for each combination
  - Create transformations that apply damage and item effects
  - Use `addTransformations()` to add all damage variants at once
  - Handle multi-hit moves by iterating over tree outcomes
  - Return the StateTree instead of DAG wrapping EventSpace

**Key Improvements:**

- Simpler, more direct API (no EventSpace wrapper)
- Clearer probability tracking through transformations
- Better support for item effects and conditional logic
- Metadata support for documenting hit details
- More natural integration with Pokemon damage calculation

---

## Architecture Changes

### Before

```
DAG<EventSpace<DMG.PokemonState>>
  └─ Nodes: EventSpace objects
     └─ Each contains multiple Pokemon states with probabilities
  └─ Edges: Simple probability values
     └─ Transition between event spaces
```

**Problem:** Abstracting away from the actual states being tracked, working with event spaces instead of states.

### After

```
StateTree<DMG.PokemonState>
  └─ Nodes: DMG.PokemonState objects (direct state)
  └─ Edges: Transformation functions with probabilities
     └─ Each transformation evolves a state into variants
```

**Benefits:**

- Direct state tracking (no intermediate abstractions)
- Transformations are explicit functions
- Easier to understand the damage calculation flow
- Natural fit for Pokemon battle simulation

---

## Data Flow: Multi-Hit Move Example

### Triple Kick (3 hits)

```
Initial: {hp: 100}
         probability: 1.0

After Hit 1:
  {hp: 90}  - prob: 1/3
  {hp: 85}  - prob: 1/3
  {hp: 80}  - prob: 1/3

After Hit 2:
  {hp: 80}  - prob: 2/9
  {hp: 75}  - prob: 2/9
  {hp: 70}  - prob: 1/9
  {hp: 65}  - prob: 2/9
  {hp: 60}  - prob: 1/9
  {hp: 55}  - prob: 1/9

After Hit 3:
  {hp: 65}  - prob: 4/27
  {hp: 60}  - prob: 2/27
  {hp: 55}  - prob: 4/27
  {hp: 50}  - prob: 2/27
  ... etc (8 total outcomes)
```

Each transformation is:

```typescript
{
  transform: (state) => ({...state, hp: state.hp - damageRoll}),
  probability: (1/3) * (1/16),  // 1/3 for hit number, 1/16 for damage roll
  metadata: { hitNumber: i, damage: damageRoll }
}
```

---

## API Comparison

### Adding Transformations

**DAG:**

```typescript
const space1 = initialEventSpace;
const space2 = modifiedEventSpace;
dag.addTransition(space1, space2, 1.0);
```

**StateTree:**

```typescript
stateTree.addTransformations(state1, [
  {transform: s => ({...s, hp: s.hp - 30}), probability: 0.5},
  {transform: s => ({...s, hp: s.hp - 40}), probability: 0.5},
]);
```

### Getting Outcomes

**DAG:**

```typescript
dag.getOutcomes(); // Returns: Outcome<EventSpace>[]
// Must then call .getOutcomes() on each EventSpace
```

**StateTree:**

```typescript
stateTree.getOutcomes(); // Returns: StateOutcome<DMG.PokemonState>[]
// Direct access to states and probabilities
```

### Statistics

**DAG:**

```typescript
const stats = dag.getStats();
// nodes, edges, maxDepth, probabilityMass
```

**StateTree:**

```typescript
const stats = stateTree.getStats();
// nodes, edges, maxDepth, probabilityMass, leafNodeCount
```

---

## Documentation Files Created

1. **`STATETREE_IMPLEMENTATION.md`** - Overview and implementation details
2. **`STATETREE_ARCHITECTURE.md`** - Detailed architecture guide with diagrams
3. **`STATETREE_USAGE_EXAMPLES.md`** - Comprehensive usage examples
4. **This file** - Summary of changes

---

## Testing Recommendations

1. **Probability Conservation:** Verify sum of outcome probabilities ≈ 1.0
2. **Multi-Hit Moves:** Test Triple Kick, Triple Axel variants
3. **Critical Hit Distribution:** Verify crit split (15%) vs normal (85%)
4. **Item Activation:** Test Sitrus Berry and other item effects
5. **State Identity:** Verify serializer correctly groups/separates states
6. **Caching:** Verify outcomes cache is invalidated on modifications
7. **Path Reconstruction:** Verify getPaths() returns correct sequences

---

## Backward Compatibility

- **DAG class:** Still exists and unchanged (not removed)
- **EventSpace class:** Still exists and unchanged (not removed)
- **computeHit function:** Still exists, not modified
- **No breaking changes to existing code**

The new StateTree is a separate implementation that can coexist with DAG/EventSpace. The `poc.ts` file is the only file that changes its dependencies.

---

## Next Steps

1. Validate multi-hit move calculations
2. Test item effect activation logic
3. Benchmark tree performance with large state spaces
4. Consider serializer optimization strategies
5. Integrate with full damage calculator

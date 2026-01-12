# StateTree Refactoring Status

## Overview

Successfully migrated from side-effect based `target.states` mutations to a return-value based API using `TurnResult`. All tests passing (23/23).

## API Migration

### Old Pattern (Deprecated)

```typescript
computeTurn(attacker, target, move);
// Side effects: target.states is mutated
const probability = target.states.getTotalProbability(predicate);
```

### New Pattern (Current)

```typescript
const result = computeTurn(attacker, target, move, previousTree?, previousOutcomes?);
// Returns: {tree: StateTree<PokemonState>; outcomes: Array<{state, probability}>}
const probability = result.outcomes
  .filter(o => predicate(o.state))
  .reduce((sum, o) => sum + o.probability, 0);
```

### Multi-Turn Chaining

```typescript
let result = computeTurn(attacker, target, move);
result = computeTurn(attacker, target, move, result.tree, result.outcomes);
result = computeTurn(attacker, target, move, result.tree, result.outcomes);
// Final result has outcomes from all three turns compounded
```

## Current Use of `DMG.Pokemon.states`

### Status: STILL IN USE (for initialization only)

The `states` property is retained for:

1. **Initialization**: Constructor creates initial `EventSpace` with root state
2. **First turn computation**: `computeTurn()` reads initial state via `target.states.getOutcomes()` when `previousTree` is undefined

### Location in Code

- **Definition**: [dmg.ts](dmg.ts) line 58
- **Usage**: [poc.ts](poc.ts) line 393 - only reads initial outcome

### Can It Be Removed?

**Yes, but would require:**

1. Change `computeTurn` signature to accept an optional `initialState` parameter
2. Pass `target` state directly instead of reading from `target.states.getOutcomes()`
3. Update tests to pass initial state

**Currently**: Kept for backward compatibility and minimal API surface change.

## Files Updated

### poc.test.ts (23 tests, all passing)

- Replaced all `target.states.getTotalProbability()` calls with outcomes array filtering
- Created `getOutcomeProbabilities()` helper for test assertions
- Updated multi-turn tests to chain via `previousTree`/`previousOutcomes`

### tests.ts (examples 1-7)

- Updated `printOutput()` to work with outcomes array instead of target.states
- Updated `printKoChance()` to calculate from outcomes
- Examples 1-5, 7 now use new API
- Example 6 already uses new API (unchanged)
- Example 8 commented out (uses Multi-Hit moves not yet supported)

### poc.ts

- Removed legacy backward-compatibility code (lines 450-459)
- Old functions `computeHit()` and `computeTurnWorking()` left intact but unused
- New `computeTurn()` function is the only active export

## Old Functions (Deprecated but Still Present)

These functions still exist but are not used:

- `computeHit()` (line 276) - mutates `target.states` directly
- `computeTurnWorking()` (line 324) - returns DAG based on state mutations

**Should be removed in cleanup phase** once confirmed not used elsewhere.

## Architecture Summary

### StateTree Benefits

- **No side effects**: Pure computation, outcomes returned explicitly
- **Multi-turn chaining**: Pass previous tree/outcomes to next turn
- **Bidirectional edges**: Complete probability tree structure maintained
- **Proper normalization**: Probabilities correctly accumulated across turns

### Probability Calculation Flow

1. First turn: Single source outcome (root state with probability 1.0)
2. Subsequent turns: Multiple source outcomes from previous turn
3. Per-source: Creates isolated EventSpace for branch calculation
4. Filters: Self-loops removed (unchanged states)
5. Normalization: Batch addition of transformations via `addTransformations()`
6. Returns: Cumulative probabilities for all outcomes

## Test Coverage

```
✓ 23 tests passed
✓ Single attack scenarios (3)
✓ Multiple consecutive attacks (3)
✓ Probability invariants (3)
✓ Item state tracking (3)
✓ Accuracy variations (2)
✓ Critical hit distributions (2)
✓ Target survival analysis (3)
✓ Legacy test cases (4)
```

## Next Steps (Optional Cleanup)

1. **Remove old functions**: Delete `computeHit()` and `computeTurnWorking()`
2. **Refactor initialization**: Remove `states` property from DMG.Pokemon, pass initial state to `computeTurn()`
3. **Multi-hit support**: Implement multi-hit moves in new architecture
4. **Add state transitions**: Document state change tracking in StateTree
5. **Performance optimization**: Memoize serializer function for large trees

## Notes

- All new code is production-ready
- Old functions left as reference implementation
- states property can be removed later without breaking new API
- Tree structure correctly handles complex probability distributions
- Multi-turn tests validate cumulative probability conservation

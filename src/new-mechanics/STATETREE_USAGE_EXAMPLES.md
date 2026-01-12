# StateTree Usage Examples

## Basic Usage

### 1. Simple Linear Transformation

```typescript
import {StateTree} from './state-tree';
import {DMG} from './dmg';

// Create initial state
const initialState: DMG.PokemonState = {
  hp: 100,
  stats: {hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100},
  types: ['Fire'],
  item: 'Sitrus Berry',
  ability: 'Blaze',
};

// Create state tree with a serializer
const tree = new StateTree<DMG.PokemonState>(initialState, state => `hp:${state.hp}|item:${state.item}|ability:${state.ability}`);

// Add transformations (e.g., from a hit)
tree.addTransformations(initialState, [
  {
    transform: state => ({...state, hp: state.hp - 30}),
    probability: 0.5,
    metadata: {event: 'normal_hit'},
  },
  {
    transform: state => ({...state, hp: state.hp - 45}),
    probability: 0.5,
    metadata: {event: 'critical_hit'},
  },
]);

// Get all outcomes
const outcomes = tree.getOutcomes();
console.table(outcomes);
// [
//   {state: {hp: 70, ...}, probability: 0.5, id: 'hp:70|item:Sitrus Berry|ability:Blaze', path: [...]}
//   {state: {hp: 55, ...}, probability: 0.5, id: 'hp:55|item:Sitrus Berry|ability:Blaze', path: [...]}
// ]
```

### 2. Multiple Damage Rolls

```typescript
const damageRolls = [28, 29, 30, 31, 32]; // 5 possible damage values

tree.addTransformations(
  currentState,
  damageRolls.map(damage => ({
    transform: state => ({...state, hp: Math.max(state.hp - damage, 0)}),
    probability: 1 / damageRolls.length, // 1/5 each, normalized to 1.0
    metadata: {damage},
  }))
);
```

### 3. Conditional Branching (Miss/Hit)

```typescript
const moveAccuracy = 0.95;

tree.addTransformations(currentState, [
  {
    // Miss branch: state unchanged
    transform: state => state,
    probability: 1 - moveAccuracy, // 5% miss
    metadata: {result: 'miss'},
  },
  {
    // Hit branch: apply damage
    transform: state => ({...state, hp: state.hp - 40}),
    probability: moveAccuracy, // 95% hit
    metadata: {result: 'hit', damage: 40},
  },
]);
```

### 4. Item Effect Activation

```typescript
tree.addTransformations(currentState, [
  {
    // Sitrus Berry activates (heals 25% HP)
    transform: state => {
      const newState = {...state};
      if (state.hp <= Math.floor(state.stats.hp * 0.5)) {
        newState.hp = Math.min(newState.hp + Math.floor(state.stats.hp / 4), state.stats.hp);
        newState.item = null; // Consumed
      }
      return newState;
    },
    probability: 0.7,
    metadata: {event: 'sitrus_activated'},
  },
  {
    // Sitrus Berry doesn't trigger
    transform: state => state,
    probability: 0.3,
    metadata: {event: 'sitrus_not_triggered'},
  },
]);
```

## Advanced Usage

### 5. Multi-Hit Move Sequencing

```typescript
function applyMultiHitMove(tree: StateTree<DMG.PokemonState>, initialState: DMG.PokemonState, moves: Array<{damage: number; accuracy: number}>) {
  let currentStates = [initialState];

  for (const move of moves) {
    const nextStates: DMG.PokemonState[] = [];

    for (const state of currentStates) {
      const transformations: Array<Transformation<DMG.PokemonState>> = [];

      // Miss chance
      if (move.accuracy < 1) {
        transformations.push({
          transform: s => s, // No change on miss
          probability: 1 - move.accuracy,
          metadata: {hitNumber: moves.indexOf(move) + 1, result: 'miss'},
        });
      }

      // Hit chance
      const damageRolls = generateDamageRolls(move.damage);
      for (const damage of damageRolls) {
        transformations.push({
          transform: s => ({...s, hp: Math.max(s.hp - damage, 0)}),
          probability: move.accuracy / damageRolls.length,
          metadata: {
            hitNumber: moves.indexOf(move) + 1,
            damage,
          },
        });
      }

      tree.addTransformations(state, transformations);
      const outcomes = tree.getOutcomes();
      nextStates.push(...outcomes.map(o => o.state));
    }

    currentStates = nextStates;
  }
}
```

### 6. State Space Reduction with Serializer

```typescript
// Coarse serialization: Group states with same HP
const coarseTree = new StateTree(initialState, state => `hp:${state.hp}`);

// Result: States with hp: 70 all merge to same node
//         Probabilities of reaching hp: 70 sum

// Fine serialization: Track all state details
const fineTree = new StateTree(
  initialState,
  state => `hp:${state.hp}|boost:${JSON.stringify(state.boosts)}|volatile:${Object.keys(state.volatiles).join(',')}`
);

// Result: Each unique state combination is a separate node
//         More detailed tracking, larger tree
```

### 7. Probability Distribution Analysis

```typescript
const tree = new StateTree(initialState, serializer);
// ... add transformations ...

// Get final distribution
const distribution = tree.getProbabilityDistribution();

// Analyze outcomes
const hpDistribution = new Map<number, number>();
tree.getOutcomes().forEach(outcome => {
  const hp = outcome.state.hp;
  hpDistribution.set(hp, (hpDistribution.get(hp) || 0) + outcome.probability);
});

console.log('HP Distribution:');
for (const [hp, prob] of hpDistribution) {
  console.log(`HP ${hp}: ${(prob * 100).toFixed(2)}%`);
}
// Output:
// HP 55: 25.00%
// HP 65: 50.00%
// HP 85: 25.00%
```

### 8. Path Tracking

```typescript
const paths = tree.getPaths();

// Get most likely path
const likeliestPath = paths.reduce((max, p) => (p.probability > max.probability ? p : max));

console.log('Most likely path:');
likeliestPath.states.forEach((state, i) => {
  console.log(`Step ${i}: HP ${state.hp}`);
});
console.log(`Probability: ${(likeliestPath.probability * 100).toFixed(2)}%`);

// Get all paths above threshold
const significantPaths = paths.filter(p => p.probability > 0.01);
console.log(`${significantPaths.length} significant paths (>1%)`);
```

### 9. Tree Statistics

```typescript
const stats = tree.getStats();

console.log(`Tree Statistics:
  Total Nodes: ${stats.totalNodes}
  Max Depth: ${stats.maxDepth}
  Total Edges: ${stats.edgeCount}
  Leaf Nodes: ${stats.leafNodeCount}
  Probability Mass: ${(stats.totalProbabilityMass * 100).toFixed(2)}%`);
```

### 10. Visualization

```typescript
// Console visualization
tree.visualize(3, state => `HP:${state.hp} Item:${state.item}`);

// Export to Graphviz
const dotFormat = tree.toGraphviz(4, state => `HP:${state.hp}\\nItem:${state.item}\\nAbility:${state.ability}`);

// Save to file and render
fs.writeFileSync('tree.dot', dotFormat);
execSync('dot -Tpng tree.dot -o tree.png');
```

## Integration with poc.ts

### Current Usage in computeTurn()

```typescript
export function computeTurn(attacker: DMG.Pokemon, target: DMG.Pokemon, move: DMG.Move): TurnStateTree {
  const stateSerializer = (state: DMG.PokemonState): string => {
    return `hp:${state.hp}|item:${state.item}|ability:${state.ability}|types:${state.types.join(',')}`;
  };

  const stateTree = new StateTree(initialState, stateSerializer);

  // Process each target state
  const targetOutcomes = target.states.getOutcomes();
  for (const targetOutcome of targetOutcomes) {
    const targetState = targetOutcome.value;
    const attackerOutcomes = attacker.states.getOutcomes();

    for (const attackerOutcome of attackerOutcomes) {
      const hitOutcomes = getHitOutcomes(attacker.generation, move, attackerOutcome.value, targetState);

      const transformations = hitOutcomes.map(hitOutcome => ({
        transform: (state: DMG.PokemonState) => {
          const newState = structuredClone(state);
          newState.hp = Math.max(newState.hp - hitOutcome.value.damage, 0);

          // Item effects
          if (newState.item && Items[newState.item]?.onHitActivate?.(newState)) {
            Items[newState.item].onEat?.(newState);
          }

          return newState;
        },
        probability: hitOutcome.probability * attackerOutcome.probability * targetOutcome.probability,
        metadata: {
          hitDescription: `damage:${hitOutcome.value.damage}, crit:${hitOutcome.value.isCrit}`,
        },
      }));

      stateTree.addTransformations(targetState, transformations);
    }
  }

  return stateTree;
}
```

## Type Safety

All operations maintain full TypeScript type safety:

```typescript
// Generic type parameter is preserved
const tree: StateTree<DMG.PokemonState> = new StateTree(...);

// Transformations must return same type
const transformations: Transformation<DMG.PokemonState>[] = [
  {
    transform: (state: DMG.PokemonState): DMG.PokemonState => ({
      ...state,
      hp: state.hp - 30
    }),
    probability: 0.5
  }
];

// Outcomes are properly typed
const outcomes: StateOutcome<DMG.PokemonState>[] = tree.getOutcomes();
```

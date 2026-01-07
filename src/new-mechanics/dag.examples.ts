/**
 * Usage examples for the generic DAG (Directed Acyclic Graph) with probability tracking
 */

import {DAG} from './dag';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// EXAMPLE 1: Simple Probability Outcomes
// ============================================================================

interface Outcome {
  value: string;
  damage: number;
}

export function example1_SimpleBranching() {
  console.log('=== Example 1: Simple Probability Branching ===\n');

  const dag = new DAG<number>(100, n => n.toString());

  // From initial HP of 100:
  // - 60% chance: takes 20 damage -> 80 HP
  // - 40% chance: takes 40 damage -> 60 HP
  dag.addTransition(100, 80, 0.6);
  dag.addTransition(100, 60, 0.4);

  const outcomes = dag.getProbabilityDistribution();
  console.log('Outcomes:');
  outcomes.forEach((prob, id) => {
    console.log(`  HP ${id}: ${(prob * 100).toFixed(1)}%`);
  });

  console.log('\nStats:', dag.getStats());
  console.log();
}

// ============================================================================
// EXAMPLE 2: Pokemon State with Item Consumption
// ============================================================================

interface PokemonState {
  hp: number;
  hasItem: boolean;
  status?: string;
}

export function example2_ItemConsumption() {
  console.log('=== Example 2: Pokemon Item Consumption ===\n');

  // Custom serializer for Pokemon state
  const serializer = (state: PokemonState) => {
    return JSON.stringify({
      hp: state.hp,
      hasItem: state.hasItem,
      status: state.status,
    });
  };

  const initial: PokemonState = {hp: 100, hasItem: true};

  const dag = new DAG<PokemonState>(initial, serializer);

  // Scenario 1: Takes 30 damage (70% chance)
  const damaged: PokemonState = {hp: 70, hasItem: true};
  dag.addTransition(initial, damaged, 0.7);

  // Scenario 2: Takes 50 damage (30% chance)
  const heavyDamaged: PokemonState = {hp: 50, hasItem: true};
  dag.addTransition(initial, heavyDamaged, 0.3);

  // From damaged state: 1/3 chance item is consumed
  const damagedWithoutItem: PokemonState = {hp: 70, hasItem: false};
  dag.addTransition(damaged, damagedWithoutItem, 1 / 3);
  dag.addTransition(damaged, damaged, 2 / 3);

  // From heavily damaged state: 1/3 chance item is consumed
  const heavyDamagedWithoutItem: PokemonState = {hp: 50, hasItem: false};
  dag.addTransition(heavyDamaged, heavyDamagedWithoutItem, 1 / 3);
  dag.addTransition(heavyDamaged, heavyDamaged, 2 / 3);

  console.log('Outcomes:');
  const outcomes = dag.getOutcomes();
  outcomes.forEach(outcome => {
    const state = outcome.value;
    console.log(`  HP: ${state.hp}, Item: ${state.hasItem ? 'Yes' : 'No'} -> ${(outcome.probability * 100).toFixed(2)}%`);
  });

  console.log('\nTotal unique outcomes:', outcomes.length);
  console.log('Stats:', dag.getStats());
  console.log();

  // Save Graphviz output to file
  const graphvizCode = dag.toGraphviz(Infinity, (state: PokemonState) => `${state.hp}|item:${state.hasItem}`);
  const filePath = 'ex2.dot';
  fs.writeFileSync(filePath, graphvizCode);
  console.log(`Graphviz output saved to: ${filePath}`);
  console.log(`To generate a PNG: dot -Tpng ${filePath} -o ex2.png`);
}

// ============================================================================
// EXAMPLE 3: Multi-Stage Branching Tree
// ============================================================================

interface DamageOutcome {
  stage: number;
  value: number;
  description: string;
}

export function example3_MultiStage() {
  console.log('=== Example 3: Multi-Stage Branching ===\n');

  const serializer = (outcome: DamageOutcome) => `${outcome.stage}-${outcome.value}`;

  const stage1: DamageOutcome = {stage: 1, value: 50, description: 'Initial'};

  const dag = new DAG<DamageOutcome>(stage1, serializer);

  // Stage 1: Initial attack

  // Stage 2 options with different probabilities
  const stage2a: DamageOutcome = {
    stage: 2,
    value: 50,
    description: 'Weak follow-up',
  };
  const stage2b: DamageOutcome = {
    stage: 2,
    value: 75,
    description: 'Normal follow-up',
  };
  const stage2c: DamageOutcome = {
    stage: 2,
    value: 100,
    description: 'Strong follow-up',
  };

  dag.addTransition(stage1, stage2a, 0.2);
  dag.addTransition(stage1, stage2b, 0.5);
  dag.addTransition(stage1, stage2c, 0.3);

  // Stage 3 options from each stage 2
  const stage3: DamageOutcome = {
    stage: 3,
    value: 75,
    description: 'Final outcome',
  };

  dag.addTransition(stage2a, stage3, 1);
  dag.addTransition(stage2b, stage3, 1);
  dag.addTransition(stage2c, stage3, 1);

  console.log('All Paths:');
  const paths = dag.getPaths();
  paths.forEach((path, index) => {
    console.log(`  Path ${index + 1} (${(path.probability * 100).toFixed(2)}%):`);
    path.path.forEach(node => {
      console.log(`    -> ${node.value.description} (${node.value.value} dmg)`);
    });
  });

  console.log('\nFinal Outcomes:');
  const outcomes = dag.getOutcomes();
  outcomes.forEach(outcome => {
    console.log(`  ${outcome.value.description}: ${(outcome.probability * 100).toFixed(2)}%`);
  });

  console.log('\nStats:', dag.getStats());
  console.log();
}

// ============================================================================
// EXAMPLE 4: Deduplication with Identical Outcomes
// ============================================================================

interface NumberState {
  value: number;
}

export function example4_Deduplication() {
  console.log('=== Example 4: Automatic Deduplication ===\n');

  const dag = new DAG<NumberState>({value: 0}, state => state.value.toString());

  // Create multiple paths leading to the same outcome
  // Path 1: 0 -> 50 -> 100 (probability: 0.3)
  dag.addTransition({value: 0}, {value: 50}, 0.3);
  dag.addTransition({value: 50}, {value: 100}, 1);

  // Path 2: 0 -> 75 -> 100 (probability: 0.7)
  dag.addTransition({value: 0}, {value: 75}, 0.7);
  dag.addTransition({value: 75}, {value: 100}, 1);

  console.log('Node Count:', dag.getStats().totalNodes);
  console.log('Expected: 3 nodes (0, 50, 75 and 100 is reached by both)');

  console.log('\nFinal Outcomes:');
  const outcomes = dag.getOutcomes();
  outcomes.forEach(outcome => {
    console.log(`  Value ${outcome.id}: ${(outcome.probability * 100).toFixed(2)}%`);
  });

  console.log('\nNote: 100 is reached with 100% probability (0.3 * 1 + 0.7 * 1 = 1.0)');
  console.log('Stats:', dag.getStats());
  console.log();
}

// ============================================================================
// EXAMPLE 5: Complex Pokemon Damage Scenario
// ============================================================================

interface PokemonResult {
  hp: number;
  status: string;
  itemConsumed: boolean;
  turnsRemaining: number;
}

export function example5_PokemonDamageScenario() {
  console.log('=== Example 5: Complex Pokemon Damage Scenario ===\n');

  const serializer = (result: PokemonResult) => {
    return JSON.stringify({
      hp: result.hp,
      status: result.status,
      itemConsumed: result.itemConsumed,
      turnsRemaining: result.turnsRemaining,
    });
  };

  const initial: PokemonResult = {
    hp: 100,
    status: 'none',
    itemConsumed: false,
    turnsRemaining: 3,
  };

  const dag = new DAG<PokemonResult>(initial, serializer);

  // Initial state

  // First attack: 60 damage dealt (70% hit, 30% miss)
  const hit1: PokemonResult = {
    hp: 40,
    status: 'none',
    itemConsumed: false,
    turnsRemaining: 3,
  };
  const miss1: PokemonResult = {
    hp: 100,
    status: 'none',
    itemConsumed: false,
    turnsRemaining: 3,
  };

  dag.addTransition(initial, hit1, 0.7);
  dag.addTransition(initial, miss1, 0.3);

  // After hit: 50% chance to consume item for recovery
  const hit1WithItem: PokemonResult = {
    hp: 40,
    status: 'none',
    itemConsumed: true,
    turnsRemaining: 3,
  };
  dag.addTransition(hit1, hit1WithItem, 0.5);
  dag.addTransition(hit1, hit1, 0.5);

  // Continue with second attack
  const hit2: PokemonResult = {
    hp: 0,
    status: 'fainted',
    itemConsumed: true,
    turnsRemaining: 0,
  };
  dag.addTransition(hit1WithItem, hit2, 0.8);

  const survived: PokemonResult = {
    hp: 25,
    status: 'none',
    itemConsumed: true,
    turnsRemaining: 1,
  };
  dag.addTransition(hit1WithItem, survived, 0.2);

  console.log('Possible Outcomes:');
  const outcomes = dag.getOutcomes().sort((a, b) => b.probability - a.probability);

  outcomes.forEach((outcome, index) => {
    const result = outcome.value;
    console.log(`\n  ${index + 1}. Probability: ${(outcome.probability * 100).toFixed(2)}%`);
    console.log(`     HP: ${result.hp} | Status: ${result.status}`);
    console.log(`     Item Consumed: ${result.itemConsumed} | Turns Left: ${result.turnsRemaining}`);
  });

  console.log('\n\nStats:', dag.getStats());
  console.log();
}

// ============================================================================
// EXAMPLE 6: Using Probability Distribution
// ============================================================================

export function example6_ProbabilityDistribution() {
  console.log('=== Example 6: Probability Distribution Analysis ===\n');

  interface SimpleOutcome {
    name: string;
    value: number;
  }

  const dag = new DAG<SimpleOutcome>({name: 'start', value: 0}, outcome => `${outcome.name}-${outcome.value}`);

  // Create a distribution
  dag.addTransition({name: 'start', value: 0}, {name: 'outcome', value: 10}, 0.25);
  dag.addTransition({name: 'start', value: 0}, {name: 'outcome', value: 20}, 0.5);
  dag.addTransition({name: 'start', value: 0}, {name: 'outcome', value: 30}, 0.25);

  const distribution = dag.getProbabilityDistribution();

  console.log('Probability Distribution:');
  let cumulativeProbability = 0;
  const sorted = Array.from(distribution.entries()).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));

  sorted.forEach(([id, prob]) => {
    cumulativeProbability += prob;
    const percentage = (prob * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(prob * 50));
    console.log(`  ${id}: ${percentage}% ${bar}`);
  });

  console.log(`\nTotal Probability Mass: ${cumulativeProbability.toFixed(4)}`);
  console.log('Stats:', dag.getStats());
  console.log();
}

// ============================================================================
// EXAMPLE 7: Multi-Hit Move with Critical Hits
// ============================================================================

export function example7_MultiHitCritical() {
  console.log('=== Example 7: Multi-Hit Move with Critical Hits ===\n');

  // State: {totalDamage, hitsRemaining, hitCount}
  interface HitState {
    totalDamage: number;
    hitsRemaining: number;
    hitCount: number;
  }

  const serializer = (state: HitState) => `${state.totalDamage}|${state.hitsRemaining}`;

  // Root: starting state - unknown hit count
  const root: HitState = {totalDamage: 0, hitsRemaining: 0, hitCount: 0};

  const dag = new DAG<HitState>(root, serializer);

  // Layer 1: Determine hit count (2, 3, 4, or 5)
  const hitCountOptions = [
    {count: 2, probability: 0.3},
    {count: 3, probability: 0.3},
    {count: 4, probability: 0.2},
    {count: 5, probability: 0.2},
  ];

  for (const {count, probability: countProb} of hitCountOptions) {
    const afterHitCount: HitState = {totalDamage: 0, hitsRemaining: count, hitCount: count};
    dag.addTransition(root, afterHitCount, countProb);
  }

  // Layer 2+: Process each hit with crit check and damage
  // Use memoization to avoid creating duplicate branches
  const visited = new Set<string>();

  function buildHitBranches(state: HitState): void {
    const stateKey = serializer(state);
    if (visited.has(stateKey) || state.hitsRemaining === 0) {
      return;
    }
    visited.add(stateKey);

    // Layer: Crit check
    const critOptions = [
      {isCrit: false, probability: 23 / 24},
      {isCrit: true, probability: 1 / 24},
    ];

    for (const {isCrit, probability: critProb} of critOptions) {
      // Layer: Damage outcome (depends on crit status)
      const damageOptions = isCrit
        ? [
            {damage: 34, probability: 1 / 16},
            {damage: 36, probability: 4 / 16},
            {damage: 37, probability: 3 / 16},
            {damage: 39, probability: 4 / 16},
            {damage: 40, probability: 3 / 16},
            {damage: 42, probability: 1 / 16},
          ]
        : [
            {damage: 24, probability: 5 / 16},
            {damage: 25, probability: 5 / 16},
            {damage: 27, probability: 5 / 16},
            {damage: 28, probability: 1 / 16},
          ];

      for (const {damage, probability: damageProb} of damageOptions) {
        const afterDamage: HitState = {
          totalDamage: state.totalDamage + damage,
          hitsRemaining: state.hitsRemaining - 1,
          hitCount: state.hitCount,
        };

        // Direct path: crit → damage
        const transitionProb = critProb * damageProb;
        dag.addTransition(state, afterDamage, transitionProb);

        // Recursively build remaining hits
        buildHitBranches(afterDamage);
      }
    }
  }

  // Build the entire hit tree
  for (const {count} of hitCountOptions) {
    const startState: HitState = {totalDamage: 0, hitsRemaining: count, hitCount: count};
    buildHitBranches(startState);
  }

  console.log('Possible Damage Outcomes (sorted by damage):\n');
  const outcomes = dag.getProbabilityDistribution();

  // Aggregate probabilities by damage value (combine all paths that lead to the same damage)
  const damageMap = new Map<number, number>();
  Array.from(outcomes.entries()).forEach(([id, prob]) => {
    const damageMatch = id.match(/dmg:(\d+)/);
    const damage = damageMatch ? parseInt(damageMatch[1]) : 0;
    damageMap.set(damage, (damageMap.get(damage) ?? 0) + prob);
  });

  const sortedOutcomes = Array.from(damageMap.entries())
    .map(([damage, probability]) => ({damage, probability}))
    .sort((a, b) => a.damage - b.damage);

  let minDamage = Infinity;
  let maxDamage = -Infinity;
  let expectedDamage = 0;

  sortedOutcomes.forEach(({damage, probability}) => {
    minDamage = Math.min(minDamage, damage);
    maxDamage = Math.max(maxDamage, damage);
    expectedDamage += damage * probability;

    const percentage = (probability * 100).toFixed(6);
    const bar = '█'.repeat(Math.round(probability * 500));
    console.log(`${damage.toString().padStart(3)} dmg: ${percentage.padStart(8)}% ${bar}`);
  });

  // console.log('\n--- Statistics ---');
  // const critProbability = 1 / 24;
  // const notCritProbability = 23 / 24;
  // const minProb = hitCountOptions[0].probability * Math.pow(notCritProbability * 0.5, 2);
  // const maxProb = hitCountOptions[3].probability * Math.pow(critProbability * 0.8, 5);
  // console.log(`Minimum Damage: ${minDamage} (${(minProb * 100).toFixed(4)}% for 2x24)`);
  // console.log(`Maximum Damage: ${maxDamage} (${(maxProb * 100).toFixed(4)}% for 5x35)`);
  // console.log(`Expected Damage: ${expectedDamage.toFixed(2)}`);
  // console.log(`Total Outcomes: ${sortedOutcomes.length}`);
  // console.log('Stats:', dag.getStats());
  // console.log();

  // Save Graphviz output to file
  const graphvizCode = dag.toGraphviz(Infinity, (state: HitState) => `${state.totalDamage}`);
  const filePath = '2-5-crit.dot';
  fs.writeFileSync(filePath, graphvizCode);
  console.log(`Graphviz output saved to: ${filePath}`);
  console.log(`To generate a PNG: dot -Tpng ${filePath} -o 2-5-crit.png`);

  // dag.visualize(6);
}

// ============================================================================
// Run all examples
// ============================================================================

export function runAllExamples() {
  example1_SimpleBranching();
  example2_ItemConsumption();
  example3_MultiStage();
  example4_Deduplication();
  example5_PokemonDamageScenario();
  example6_ProbabilityDistribution();
  example7_MultiHitCritical();
}

// Uncomment to run examples:
// runAllExamples();

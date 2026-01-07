/**
 * Usage examples for the EventSpace data structure
 * Tracks only leaf node probabilities for efficient space usage
 */

import {EventSpace} from './event-space';

// ============================================================================
// EXAMPLE 1: Simple Probability Outcomes
// ============================================================================

export function example1_SimpleBranching() {
  console.log('=== Example 1: Simple Probability Branching (EventSpace) ===\n');

  const eventSpace = new EventSpace<number>(100, n => n.toString());

  // From initial HP of 100:
  // - 60% chance: takes 20 damage -> 80 HP
  // - 40% chance: takes 40 damage -> 60 HP
  eventSpace.addTransition(100, 80, 0.6);
  eventSpace.addTransition(100, 60, 0.4);

  const outcomes = eventSpace.getProbabilityDistribution();
  console.log('Outcomes:');
  outcomes.forEach((prob, id) => {
    console.log(`  HP ${id}: ${(prob * 100).toFixed(1)}%`);
  });

  console.log(`\nTotal Nodes in EventSpace: ${eventSpace.getSpaceSize()}`);
  console.log(`Total Probability: ${(eventSpace.getTotalProbability() * 100).toFixed(1)}%`);
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
  console.log('=== Example 2: Single-Level Branching (EventSpace) ===\n');

  interface State {
    name: string;
    value: number;
  }

  const eventSpace = new EventSpace<State>({name: 'start', value: 0}, s => `${s.name}-${s.value}`);

  // Simple branching: take different paths after an event
  eventSpace.addTransition({name: 'start', value: 0}, {name: 'itemUsed', value: 10}, 0.6);
  eventSpace.addTransition({name: 'start', value: 0}, {name: 'itemNotUsed', value: 5}, 0.4);

  console.log('Final Outcomes:');
  const outcomes = eventSpace.getOutcomes();
  outcomes.forEach(outcome => {
    console.log(`  ${outcome.value.name}: ${outcome.value.value} -> ${(outcome.probability * 100).toFixed(2)}%`);
  });

  console.log(`\nTotal unique leaf states: ${eventSpace.getSpaceSize()}`);
  console.log(`Total Probability: ${(eventSpace.getTotalProbability() * 100).toFixed(1)}%`);
  console.log();
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
  console.log('=== Example 3: Converging Paths (EventSpace) ===\n');

  interface Damage {
    stage: string;
    value: number;
  }

  const eventSpace = new EventSpace<Damage>({stage: 'start', value: 0}, d => `${d.stage}-${d.value}`);

  // Branch into 3 different intermediate states
  eventSpace.addTransition({stage: 'start', value: 0}, {stage: 'weak', value: 20}, 0.2);
  eventSpace.addTransition({stage: 'start', value: 0}, {stage: 'normal', value: 50}, 0.5);
  eventSpace.addTransition({stage: 'start', value: 0}, {stage: 'strong', value: 80}, 0.3);

  console.log('Final Leaf Outcomes:');
  const outcomes = eventSpace.getOutcomes().sort((a, b) => b.probability - a.probability);
  outcomes.forEach(outcome => {
    console.log(`  Stage: ${outcome.value.stage}, Damage: ${outcome.value.value} -> ${(outcome.probability * 100).toFixed(2)}%`);
  });

  console.log(`\nTotal Probability: ${(eventSpace.getTotalProbability() * 100).toFixed(1)}%`);
  console.log(`Nodes in EventSpace: ${eventSpace.getSpaceSize()}`);
  console.log('Note: EventSpace is best for single-level branching, not multi-stage scenarios');
  console.log();
}

// ============================================================================
// EXAMPLE 4: Deduplication with Identical Outcomes
// ============================================================================

interface NumberState {
  value: number;
}

export function example4_Deduplication() {
  console.log('=== Example 4: Automatic Deduplication (EventSpace) ===\n');

  const eventSpace = new EventSpace<NumberState>({value: 0}, state => state.value.toString());

  // Create multiple paths leading to the same outcome
  // Path 1: 0 -> 50 -> 100 (probability: 0.3)
  eventSpace.addTransition({value: 0}, {value: 50}, 0.3);
  eventSpace.addTransition({value: 50}, {value: 100}, 1);

  // Path 2: 0 -> 75 -> 100 (probability: 0.7)
  eventSpace.addTransition({value: 0}, {value: 75}, 0.7);
  eventSpace.addTransition({value: 75}, {value: 100}, 1);

  console.log('After all transitions, eventSpace contains:');
  const outcomes = eventSpace.getOutcomes();
  outcomes.forEach(outcome => {
    console.log(`  Value ${outcome.id}: ${(outcome.probability * 100).toFixed(2)}%`);
  });

  console.log(`\nNodes in EventSpace: ${eventSpace.getSpaceSize()}`);
  console.log(`Total Probability: ${(eventSpace.getTotalProbability() * 100).toFixed(1)}%`);
  console.log('Note: Value 100 automatically accumulated probability from both paths');
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
  console.log('=== Example 5: Simple Outcome Distribution (EventSpace) ===\n');

  interface BattleState {
    hp: number;
    status: string;
  }

  const serializer = (state: BattleState) => {
    return JSON.stringify({hp: state.hp, status: state.status});
  };

  const initial: BattleState = {hp: 100, status: 'healthy'};

  const eventSpace = new EventSpace<BattleState>(initial, serializer);

  // Single attack with multiple damage outcomes
  eventSpace.addTransition(initial, {hp: 75, status: 'damaged'}, 0.25);
  eventSpace.addTransition(initial, {hp: 50, status: 'damaged'}, 0.5);
  eventSpace.addTransition(initial, {hp: 25, status: 'critical'}, 0.2);
  eventSpace.addTransition(initial, {hp: 0, status: 'fainted'}, 0.05);

  console.log('Possible Outcomes After Attack:\n');
  const outcomes = eventSpace.getOutcomes().sort((a, b) => b.value.hp - a.value.hp);

  outcomes.forEach((outcome, index) => {
    const state = outcome.value;
    console.log(`  ${index + 1}. HP: ${state.hp}, Status: ${state.status} -> ${(outcome.probability * 100).toFixed(2)}%`);
  });

  console.log(`\nTotal Leaf States: ${eventSpace.getSpaceSize()}`);
  console.log(`Total Probability: ${(eventSpace.getTotalProbability() * 100).toFixed(1)}%`);
  console.log();
}

// ============================================================================
// EXAMPLE 6: Using Probability Distribution
// ============================================================================

export function example6_ProbabilityDistribution() {
  console.log('=== Example 6: Probability Distribution Analysis (EventSpace) ===\n');

  interface SimpleOutcome {
    name: string;
    value: number;
  }

  const eventSpace = new EventSpace<SimpleOutcome>({name: 'start', value: 0}, outcome => `${outcome.name}-${outcome.value}`);

  // Create a distribution
  eventSpace.addTransition({name: 'start', value: 0}, {name: 'outcome', value: 10}, 0.25);
  eventSpace.addTransition({name: 'start', value: 0}, {name: 'outcome', value: 20}, 0.5);
  eventSpace.addTransition({name: 'start', value: 0}, {name: 'outcome', value: 30}, 0.25);

  const distribution = eventSpace.getProbabilityDistribution();

  console.log('Probability Distribution:\n');
  let cumulativeProbability = 0;
  const sorted = Array.from(distribution.entries())
    .map(([id, prob]) => ({id: parseInt(id.split('-')[1]), prob}))
    .sort((a, b) => a.id - b.id);

  sorted.forEach(({id, prob}) => {
    cumulativeProbability += prob;
    const percentage = (prob * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(prob * 50));
    console.log(`  Value ${id}: ${percentage.padStart(5)}% ${bar}`);
  });

  console.log(`\nTotal Probability Mass: ${cumulativeProbability.toFixed(4)}`);
  console.log(`Nodes in EventSpace: ${eventSpace.getSpaceSize()}`);
  console.log();
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
}

// Uncomment to run examples:
// runAllExamples();

/**
 * Nested Probability Structure Example
 *
 * Demonstrates a hierarchical probability tree:
 * - DAG of Turns (branching battle states)
 *   - Each Turn contains a DAG of Hits (action sequences)
 *     - Each Hit has an EventSpace of Outcomes (damage rolls, status, items, etc.)
 *
 * Use case: Pokemon battle simulation with full probability distribution
 */

import {DAG} from './new-mechanics/dag';
import {EventSpace} from './new-mechanics/event-space';

// ============================================================================
// Type Definitions
// ============================================================================

type TurnState = {
  turnNumber: number;
  activePokemon: string;
  opponentHP: number;
  weather: 'none' | 'rain' | 'sun' | 'sand' | 'hail';
};

type HitAction = {
  hitNumber: number;
  move: string;
  target: string;
  isCritical: boolean;
};

type HitOutcome = {
  damage: number;
  statusApplied: 'none' | 'burn' | 'paralysis' | 'poison' | 'freeze';
  itemTriggered: 'none' | 'life-orb-recoil' | 'rocky-helmet-damage' | 'aqua-acrobatics';
  weatherEffect: 'none' | 'hail-damage' | 'sand-damage' | 'rain-boost' | 'sun-boost';
  accuracy: boolean;
};

// ============================================================================
// Serializers (convert complex objects to unique strings for DAG/EventSpace)
// ============================================================================

const turnSerializer = (state: TurnState): string => {
  return `turn-${state.turnNumber}-${state.activePokemon}-hp${state.opponentHP}-${state.weather}`;
};

const hitSerializer = (action: HitAction): string => {
  return `hit-${action.hitNumber}-${action.move}-crit${action.isCritical ? 'yes' : 'no'}`;
};

const outcomeSerializer = (outcome: HitOutcome): string => {
  return `dmg${outcome.damage}-${outcome.statusApplied}-${outcome.itemTriggered}-${outcome.weatherEffect}`;
};

// ============================================================================
// Nested Structure Builder
// ============================================================================

class BattleSimulation {
  private turnDAG: DAG<TurnState>;
  private turnToHits: Map<string, HitAction[]> = new Map(); // Map turns to their hit actions
  private outcomeSpaces: Map<string, EventSpace<HitOutcome>> = new Map();

  constructor(initialState: TurnState) {
    this.turnDAG = new DAG(initialState, turnSerializer);
  }

  /**
   * Add a turn transition with branching probability
   * (e.g., weather change, Pokemon switch, HP reduction)
   */
  addTurnTransition(fromTurn: TurnState, toTurn: TurnState, probability: number): void {
    this.turnDAG.addTransition(fromTurn, toTurn, probability);
  }

  /**
   * Set the hits (action sequence) for a specific turn
   * This is a simple list - no branching within a turn's hits
   */
  setHitsForTurn(turn: TurnState, hits: HitAction[]): void {
    const turnKey = turnSerializer(turn);
    this.turnToHits.set(turnKey, hits);
  }

  /**
   * Initialize an EventSpace for outcomes of a specific hit
   */
  private ensureOutcomeSpace(turn: TurnState, hit: HitAction, rootOutcome?: HitOutcome): EventSpace<HitOutcome> {
    const key = `${turnSerializer(turn)}-${hitSerializer(hit)}`;
    if (!this.outcomeSpaces.has(key)) {
      if (!rootOutcome) {
        throw new Error('Root outcome must be provided on first EventSpace creation');
      }
      this.outcomeSpaces.set(key, new EventSpace(rootOutcome, outcomeSerializer));
    }
    return this.outcomeSpaces.get(key)!;
  }

  /**
   * Add outcome transitions within an EventSpace
   * (e.g., miss, weak hit, normal hit, critical hit, with status/item effects)
   */
  addOutcomeTransition(inTurn: TurnState, forHit: HitAction, fromOutcome: HitOutcome, toOutcome: HitOutcome, probability: number): void {
    const key = `${turnSerializer(inTurn)}-${hitSerializer(forHit)}`;
    // Initialize EventSpace with the fromOutcome if it doesn't exist yet
    const outcomeSpace = this.outcomeSpaces.has(key) ? this.outcomeSpaces.get(key)! : this.ensureOutcomeSpace(inTurn, forHit, fromOutcome);
    outcomeSpace.addTransition(fromOutcome, toOutcome, probability);
  }

  /**
   * Get all possible turn sequences and their probabilities
   */
  getTurnPaths(): Array<{path: TurnState[]; probability: number}> {
    return this.turnDAG.getPaths().map(({path, probability}) => ({
      path: path.map(node => node.value),
      probability,
    }));
  }

  /**
   * Get hits for a specific turn (simple list - no branching)
   */
  getHitsForTurn(turn: TurnState): HitAction[] {
    return this.turnToHits.get(turnSerializer(turn)) || [];
  }

  /**
   * Get probability distribution of outcomes for a specific hit
   */
  getOutcomeDistribution(turn: TurnState, hit: HitAction): Map<string, number> {
    const outcomeSpace = this.outcomeSpaces.get(`${turnSerializer(turn)}-${hitSerializer(hit)}`);
    return outcomeSpace ? outcomeSpace.getProbabilityDistribution() : new Map();
  }

  /**
   * Get all final outcomes with their probabilities
   * (fully flattened path: turn sequence -> hit sequence -> outcome)
   */
  getAllFinalOutcomes(): Array<{
    turnPath: TurnState[];
    hitPath: HitAction[];
    outcomes: Map<string, number>;
    probability: number;
  }> {
    const results: Array<{
      turnPath: TurnState[];
      hitPath: HitAction[];
      outcomes: Map<string, number>;
      probability: number;
    }> = [];

    const turnPaths = this.getTurnPaths();

    for (const {path: turnPath, probability: turnProb} of turnPaths) {
      const lastTurn = turnPath[turnPath.length - 1];
      const hitPath = this.getHitsForTurn(lastTurn);

      for (const hit of hitPath) {
        const outcomes = this.getOutcomeDistribution(lastTurn, hit);

        results.push({
          turnPath,
          hitPath,
          outcomes,
          probability: turnProb,
        });
      }
    }

    return results;
  }

  // Visualization and debugging
  visualize(): void {
    console.log('\n=== TURN DAG ===');
    this.turnDAG.visualize(2);

    console.log('\n=== HITS (per turn) ===');
    for (const [turnKey, hits] of this.turnToHits.entries()) {
      console.log(`\n${turnKey}:`);
      for (const hit of hits) {
        console.log(`  - ${hit.move}${hit.isCritical ? ' (CRIT)' : ''}`);
      }
    }

    console.log('\n=== OUTCOME SPACES (per hit) ===');
    for (const [key, outcomeSpace] of this.outcomeSpaces.entries()) {
      console.log(`\n${key}:`);
      const dist = outcomeSpace.getProbabilityDistribution();
      console.log(`  Total outcomes: ${dist.size}`);
      for (const [id, prob] of dist) {
        console.log(`    ${id}: ${(prob * 100).toFixed(2)}%`);
      }
    }
  }
}

// ============================================================================
// Example: Simple Pokemon Battle Turn
// ============================================================================

export function runNestedProbabilityExample(): void {
  console.log('============================================================');
  console.log('Nested Probability Structure Example');
  console.log('============================================================\n');

  const simulation = new BattleSimulation({
    turnNumber: 1,
    activePokemon: 'Pikachu',
    opponentHP: 100,
    weather: 'none',
  });

  // ========================================================================
  // TURN 1: Setup - two possible weather states
  // ========================================================================

  const turn1: TurnState = {
    turnNumber: 1,
    activePokemon: 'Pikachu',
    opponentHP: 100,
    weather: 'none',
  };

  const turn2_sun: TurnState = {
    turnNumber: 2,
    activePokemon: 'Pikachu',
    opponentHP: 100,
    weather: 'sun',
  };

  const turn2_rain: TurnState = {
    turnNumber: 2,
    activePokemon: 'Pikachu',
    opponentHP: 100,
    weather: 'rain',
  };

  // Turn transitions: 60% sun, 40% rain
  simulation.addTurnTransition(turn1, turn2_sun, 0.6);
  simulation.addTurnTransition(turn1, turn2_rain, 0.4);

  // ========================================================================
  // HIT SEQUENCES (within each turn)
  // ========================================================================

  // Sun turn: Pikachu uses Thunderbolt
  const sunHit1: HitAction = {
    hitNumber: 1,
    move: 'Thunderbolt',
    target: 'opponent',
    isCritical: false,
  };

  // Rain turn: Pikachu uses Thunder
  const rainHit1: HitAction = {
    hitNumber: 1,
    move: 'Thunder',
    target: 'opponent',
    isCritical: false,
  };

  // Set the hits for each turn (simple list, no branching)
  simulation.setHitsForTurn(turn2_sun, [sunHit1]);
  simulation.setHitsForTurn(turn2_rain, [rainHit1]);

  // ========================================================================
  // DAMAGE OUTCOMES (EventSpace per hit)
  // ========================================================================

  // Sun + Thunderbolt: Damage 50-60, no crit or crit effects
  const sunThunderboltStart: HitOutcome = {
    damage: 0,
    statusApplied: 'none',
    itemTriggered: 'none',
    weatherEffect: 'sun-boost',
    accuracy: false,
  };

  // Normal hit (87.5%)
  const sunThunderbolt_50dmg: HitOutcome = {
    damage: 50,
    statusApplied: 'none',
    itemTriggered: 'none',
    weatherEffect: 'sun-boost',
    accuracy: true,
  };

  const sunThunderbolt_55dmg: HitOutcome = {
    damage: 55,
    statusApplied: 'none',
    itemTriggered: 'none',
    weatherEffect: 'sun-boost',
    accuracy: true,
  };

  const sunThunderbolt_60dmg: HitOutcome = {
    damage: 60,
    statusApplied: 'none',
    itemTriggered: 'none',
    weatherEffect: 'sun-boost',
    accuracy: true,
  };

  // Critical hit (12.5% base, then damage distribution)
  const sunThunderboltCrit_75dmg: HitOutcome = {
    damage: 75,
    statusApplied: 'none',
    itemTriggered: 'none',
    weatherEffect: 'sun-boost',
    accuracy: true,
  };

  const sunThunderboltCrit_83dmg: HitOutcome = {
    damage: 83,
    statusApplied: 'none',
    itemTriggered: 'none',
    weatherEffect: 'sun-boost',
    accuracy: true,
  };

  const sunThunderboltCrit_90dmg: HitOutcome = {
    damage: 90,
    statusApplied: 'none',
    itemTriggered: 'none',
    weatherEffect: 'sun-boost',
    accuracy: true,
  };

  // Normal distribution: 30% 50dmg, 40% 55dmg, 30% 60dmg (87.5% of total)
  simulation.addOutcomeTransition(
    turn2_sun,
    sunHit1,
    sunThunderboltStart,
    sunThunderbolt_50dmg,
    0.2625 // 0.875 * 0.3
  );
  simulation.addOutcomeTransition(
    turn2_sun,
    sunHit1,
    sunThunderboltStart,
    sunThunderbolt_55dmg,
    0.35 // 0.875 * 0.4
  );
  simulation.addOutcomeTransition(
    turn2_sun,
    sunHit1,
    sunThunderboltStart,
    sunThunderbolt_60dmg,
    0.2625 // 0.875 * 0.3
  );

  // Critical distribution: 30% 75dmg, 40% 83dmg, 30% 90dmg (12.5% of total)
  simulation.addOutcomeTransition(
    turn2_sun,
    sunHit1,
    sunThunderboltStart,
    sunThunderboltCrit_75dmg,
    0.0375 // 0.125 * 0.3
  );
  simulation.addOutcomeTransition(
    turn2_sun,
    sunHit1,
    sunThunderboltStart,
    sunThunderboltCrit_83dmg,
    0.05 // 0.125 * 0.4
  );
  simulation.addOutcomeTransition(
    turn2_sun,
    sunHit1,
    sunThunderboltStart,
    sunThunderboltCrit_90dmg,
    0.0375 // 0.125 * 0.3
  );

  // Rain + Thunder: Lower damage, miss chance 10%
  const rainThunderStart: HitOutcome = {
    damage: 0,
    statusApplied: 'none',
    itemTriggered: 'none',
    weatherEffect: 'rain-boost',
    accuracy: false,
  };

  const rainThunderMiss: HitOutcome = {
    damage: 0,
    statusApplied: 'none',
    itemTriggered: 'none',
    weatherEffect: 'rain-boost',
    accuracy: false,
  };

  const rainThunder_45dmg: HitOutcome = {
    damage: 45,
    statusApplied: 'none',
    itemTriggered: 'none',
    weatherEffect: 'rain-boost',
    accuracy: true,
  };

  const rainThunder_50dmg: HitOutcome = {
    damage: 50,
    statusApplied: 'none',
    itemTriggered: 'none',
    weatherEffect: 'rain-boost',
    accuracy: true,
  };

  const rainThunderCrit_68dmg: HitOutcome = {
    damage: 68,
    statusApplied: 'none',
    itemTriggered: 'none',
    weatherEffect: 'rain-boost',
    accuracy: true,
  };

  const rainThunderCrit_75dmg: HitOutcome = {
    damage: 75,
    statusApplied: 'none',
    itemTriggered: 'none',
    weatherEffect: 'rain-boost',
    accuracy: true,
  };

  // Miss: 10%
  simulation.addOutcomeTransition(turn2_rain, rainHit1, rainThunderStart, rainThunderMiss, 0.1);

  // Normal hit distribution: 45% 45dmg, 45% 50dmg (45% of total)
  simulation.addOutcomeTransition(turn2_rain, rainHit1, rainThunderStart, rainThunder_45dmg, 0.405); // 0.9 * 0.45 * 1.0
  simulation.addOutcomeTransition(turn2_rain, rainHit1, rainThunderStart, rainThunder_50dmg, 0.405); // 0.9 * 0.45 * 1.0

  // Critical hit distribution (10% crit): 45% 68dmg, 45% 75dmg (10% of total * 90% hit)
  simulation.addOutcomeTransition(turn2_rain, rainHit1, rainThunderStart, rainThunderCrit_68dmg, 0.045); // 0.9 * 0.5 * 0.1 * 0.5
  simulation.addOutcomeTransition(turn2_rain, rainHit1, rainThunderStart, rainThunderCrit_75dmg, 0.045); // 0.9 * 0.5 * 0.1 * 0.5

  // ========================================================================
  // ANALYSIS
  // ========================================================================

  simulation.visualize();

  console.log('\n\n=== FINAL PROBABILITY ANALYSIS ===\n');

  const allOutcomes = simulation.getAllFinalOutcomes();

  console.log(`Total possible paths: ${allOutcomes.length}\n`);

  for (const result of allOutcomes) {
    const turnDesc = result.turnPath.map(t => `Turn${t.turnNumber}(${t.weather})`).join(' -> ');
    const hitDesc = result.hitPath.map(h => `${h.move}${h.isCritical ? '✓CRIT' : ''}`).join(' -> ');

    console.log(`Path: ${turnDesc} | ${hitDesc}`);
    console.log(`  Base probability: ${(result.probability * 100).toFixed(3)}%`);
    console.log(`  Outcomes:`);

    for (const [outcomeId, prob] of result.outcomes) {
      const outcomeProb = (result.probability * prob * 100).toFixed(3);
      console.log(`    ${outcomeId}: ${outcomeProb}%`);
    }
  }

  console.log('\n============================================================');
}

// ============================================================================
// Structure Assessment
// ============================================================================

console.log(`
╔════════════════════════════════════════════════════════════════════╗
║          NESTED STRUCTURE ASSESSMENT (DAG + EventSpace)            ║
╚════════════════════════════════════════════════════════════════════╝

✅ STRENGTHS:
  • DAG handles turn branching (weather, Pokemon switches, status changes) 
  • DAG handles hit sequences (multi-hit moves, follow-up actions)
  • EventSpace perfectly models outcome distributions (damage rolls, status)
  • Clear separation of concerns: states → actions → outcomes
  • Caching in DAG/EventSpace prevents recalculation
  • Probability floor filters negligible branches

⚠️  LIMITATIONS / CONSIDERATIONS:
  1. EventSpace is stateful (probability always sums to 1)
     → Good for independent outcomes on a single hit
     → Requires manual management for complex inter-outcome relationships
     
  2. Need to manually manage keys for nested lookups
     → Serializers must be unique and unambiguous
     → Consider a more structured key system for large simulations
     
  3. No built-in "query" system for extracting probabilities
     → Must iterate through all paths manually
     → Could benefit from: P(damage > 50), E[damage], etc.

🔧 SUGGESTED ENHANCEMENTS:
  1. Add filtered outcome queries: getOutcomesByFilter(predicate)
  2. Add expected value calculation for numeric outcomes
  3. Create StructuredPath type to avoid manual key management
  4. Add "collapse" operation to reduce path complexity
`);

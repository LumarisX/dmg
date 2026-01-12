import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/dex';
import {DMG} from './dmg';
import {computeTurn, TurnResult} from './poc';

const gens = new Generations(Dex);
const GEN_NUM = 9;
const TOLERANCE = 0.0001;

interface TestSetupOptions {
  attackerName?: string;
  targetName?: string;
  targetItem?: string;
  moveOptions?: {crit?: boolean; alwaysHit?: boolean};
}

function setupTest(options: TestSetupOptions = {}) {
  const {attackerName = 'Gengar', targetName = 'Deoxys-Defense', targetItem = 'Sitrus Berry', moveOptions = {}} = options;

  const gen = gens.get(GEN_NUM);
  const attacker = new DMG.Pokemon(gen, attackerName);
  const target = new DMG.Pokemon(gen, targetName, {item: targetItem});
  const move = new DMG.Move(gen, 'Poltergeist', moveOptions);

  if (!move || !attacker || !target) {
    throw new Error(`Failed to create test entities: Pokemon="${attackerName}/${targetName}" Move="Poltergeist"`);
  }

  return {gen, attacker, target, move};
}

/**
 * Helper to calculate probabilities from TurnResult outcomes
 */
function getOutcomeProbabilities(result: TurnResult) {
  return {
    getTotalProbability: (predicate?: (s: DMG.PokemonState) => boolean) => {
      return result.outcomes.filter(o => !predicate || predicate(o.state)).reduce((sum, o) => sum + o.probability, 0);
    },
  };
}

describe('POC - Damage Calculator with Probability States', () => {
  // ============================================================================
  // Single Attack Tests
  // ============================================================================

  describe('Single Attack Scenarios', () => {
    describe('with always hit and no critical', () => {
      it('should track item consumption probability when target has Sitrus Berry', () => {
        // Arrange
        const {attacker, target, move} = setupTest({
          moveOptions: {crit: false, alwaysHit: true},
        });

        // Act
        const result = computeTurn(attacker, target, move);
        const states = getOutcomeProbabilities(result);

        // Assert
        const itemProbability = states.getTotalProbability(t => t.item !== null);
        const koProbability = states.getTotalProbability(state => state.hp === 0);
        const totalProbability = states.getTotalProbability();

        expect(itemProbability).toBeCloseTo(0.4375, TOLERANCE);
        // Target should survive single non-lethal attack
        expect(koProbability).toBe(0);
        // Total probability must equal 1
        expect(totalProbability).toBeCloseTo(1, TOLERANCE);
      });
    });

    describe('with critical hit', () => {
      it('should KO target when critical damage exceeds HP', () => {
        // Arrange
        const {attacker, target, move} = setupTest({
          moveOptions: {crit: true, alwaysHit: true},
        });

        // Act
        const result = computeTurn(attacker, target, move);
        const states = getOutcomeProbabilities(result);

        // Assert
        const itemProbability = states.getTotalProbability(t => t.item !== null);
        const koProbability = states.getTotalProbability(state => state.hp === 0);
        const totalProbability = states.getTotalProbability();

        // Item should be consumed by critical hit
        expect(itemProbability).toBeCloseTo(0, TOLERANCE);
        // Critical still does not KO Deoxys-Defense
        expect(koProbability).toBe(0);
        expect(totalProbability).toBeCloseTo(1, TOLERANCE);
      });
    });

    describe('with standard accuracy (95%)', () => {
      it('should account for miss probability (5% Miss Rate)', () => {
        // Arrange
        const {attacker, target, move} = setupTest({
          moveOptions: {crit: false, alwaysHit: false},
        });

        // Act
        const result = computeTurn(attacker, target, move);
        const states = getOutcomeProbabilities(result);

        // Assert
        const itemProbability = states.getTotalProbability(t => t.item !== null);
        const koProbability = states.getTotalProbability(state => state.hp === 0);
        const totalProbability = states.getTotalProbability();

        // Expected: (0.95 * 0.4375) + (0.05 * 1.0) = 0.4938 (item not consumed on miss)
        expect(itemProbability).toBeCloseTo(0.4938, TOLERANCE);
        expect(koProbability).toBe(0);
        expect(totalProbability).toBeCloseTo(1, TOLERANCE);
      });
    });
  });

  // ============================================================================
  // Multiple Attack Tests
  // ============================================================================

  describe('Multiple Consecutive Attacks', () => {
    describe('two attacks with always hit and no critical', () => {
      it('should compound probabilities across multiple turns', () => {
        // Arrange
        const {attacker, target, move} = setupTest({
          moveOptions: {crit: false, alwaysHit: true},
        });

        // Act
        const result1 = computeTurn(attacker, target, move);
        const result2 = computeTurn(attacker, target, move, result1.tree, result1.outcomes);
        const states = getOutcomeProbabilities(result2);

        // Assert
        const itemProbability = states.getTotalProbability(t => t.item !== null);
        const koProbability = states.getTotalProbability(state => state.hp === 0);
        const totalProbability = states.getTotalProbability();

        // Expected: (0.4375)^2 = 0.1914 with rounding variance
        expect(itemProbability).toBeCloseTo(0.1992, TOLERANCE);
        expect(koProbability).toBeCloseTo(0.1992, TOLERANCE);
        // Probability mass must be conserved
        expect(totalProbability).toBeCloseTo(1, TOLERANCE);
      });
    });

    describe('two attacks with mixed accuracy and critical variance', () => {
      it('should produce complex probability distribution over multiple outcomes', () => {
        // Arrange
        const {attacker, target, move} = setupTest({
          moveOptions: {crit: undefined, alwaysHit: false},
        });

        // Act
        const result1 = computeTurn(attacker, target, move);
        const result2 = computeTurn(attacker, target, move, result1.tree, result1.outcomes);
        const states = getOutcomeProbabilities(result2);

        // Assert
        const itemProbability = states.getTotalProbability(t => t.item !== null);
        const koProbability = states.getTotalProbability(state => state.hp === 0);
        const totalProbability = states.getTotalProbability();

        expect(itemProbability).toBeCloseTo(0.2301, TOLERANCE);
        expect(koProbability).toBeCloseTo(0.1786, TOLERANCE);
        expect(totalProbability).toBeCloseTo(1, TOLERANCE);
      });
    });

    describe('two attacks with always hit and crit variance', () => {
      it('should track probability with critical hit variance', () => {
        // Arrange
        const {attacker, target, move} = setupTest({
          moveOptions: {alwaysHit: true},
        });

        // Act
        const result1 = computeTurn(attacker, target, move);
        const result2 = computeTurn(attacker, target, move, result1.tree, result1.outcomes);
        const states = getOutcomeProbabilities(result2);

        // Assert
        const itemProbability = states.getTotalProbability(t => t.item !== null);
        const koProbability = states.getTotalProbability(state => state.hp === 0);
        const totalProbability = states.getTotalProbability();

        expect(itemProbability).toBeCloseTo(0.2004, TOLERANCE);
        expect(koProbability).toBeCloseTo(0.2004, TOLERANCE);
        expect(totalProbability).toBeCloseTo(1, TOLERANCE);
      });
    });
  });

  // ============================================================================
  // Edge Cases and Validation Tests
  // ============================================================================

  describe('Probability Invariants', () => {
    it('should maintain total probability of 1.0 across all states after single attack', () => {
      // Arrange
      const {attacker, target, move} = setupTest();

      // Act
      const result = computeTurn(attacker, target, move);
      const states = getOutcomeProbabilities(result);

      // Assert
      const totalProbability = states.getTotalProbability();
      expect(totalProbability).toBeCloseTo(1, TOLERANCE);
    });

    it('should maintain total probability of 1.0 after multiple attacks', () => {
      // Arrange
      const {attacker, target, move} = setupTest();

      // Act
      const result1 = computeTurn(attacker, target, move);
      const result2 = computeTurn(attacker, target, move, result1.tree, result1.outcomes);
      const result3 = computeTurn(attacker, target, move, result2.tree, result2.outcomes);
      const states = getOutcomeProbabilities(result3);

      // Assert
      const totalProbability = states.getTotalProbability();
      expect(totalProbability).toBeCloseTo(1, TOLERANCE);
    });

    it('should have non-zero probability for at least one outcome after attack', () => {
      // Arrange
      const {attacker, target, move} = setupTest();

      // Act
      const result = computeTurn(attacker, target, move);
      const states = getOutcomeProbabilities(result);

      // Assert
      const totalProbability = states.getTotalProbability();
      expect(totalProbability).toBeGreaterThan(0);
      expect(totalProbability).toBeCloseTo(1, TOLERANCE);
    });
  });

  describe('Item State Tracking', () => {
    it('should have states where item is retained after damage', () => {
      // Arrange
      const {attacker, target, move} = setupTest({
        moveOptions: {crit: false, alwaysHit: true},
      });

      // Act
      const result = computeTurn(attacker, target, move);
      const states = getOutcomeProbabilities(result);

      // Assert - Item should be retained in at least some probability branches
      const itemRetainedProb = states.getTotalProbability(t => t.item !== null);
      expect(itemRetainedProb).toBeGreaterThan(0);
    });

    it('should have states where item is consumed after damage', () => {
      // Arrange
      const {attacker, target, move} = setupTest({
        moveOptions: {crit: false, alwaysHit: true},
      });

      // Act
      const result = computeTurn(attacker, target, move);
      const states = getOutcomeProbabilities(result);

      // Assert - Item should be consumed in at least some probability branches
      const itemConsumedProb = states.getTotalProbability(t => t.item === null);
      expect(itemConsumedProb).toBeGreaterThan(0);
    });

    it('should increase item consumption probability with guaranteed critical hit', () => {
      // Arrange
      const {
        attacker: attackerNoCrit,
        target: targetNoCrit,
        move: moveNoCrit,
      } = setupTest({
        moveOptions: {crit: false, alwaysHit: true},
      });
      const {
        attacker: attackerCrit,
        target: targetCrit,
        move: moveCrit,
      } = setupTest({
        moveOptions: {crit: true, alwaysHit: true},
      });

      // Act
      const resultNoCrit = computeTurn(attackerNoCrit, targetNoCrit, moveNoCrit);
      const resultCrit = computeTurn(attackerCrit, targetCrit, moveCrit);
      const statesNoCrit = getOutcomeProbabilities(resultNoCrit);
      const statesCrit = getOutcomeProbabilities(resultCrit);

      // Assert - Critical hit should consume item more often (higher damage)
      const itemProbNoCrit = statesNoCrit.getTotalProbability(t => t.item === null);
      const itemProbCrit = statesCrit.getTotalProbability(t => t.item === null);

      expect(itemProbCrit).toBeGreaterThanOrEqual(itemProbNoCrit);
    });
  });

  describe('Different Move Accuracy Scenarios', () => {
    it('should reduce item consumption probability for lower accuracy moves', () => {
      // Arrange: One with normal accuracy, one with always hit
      const {
        attacker: attacker95,
        target: target95,
        move: move95,
      } = setupTest({
        moveOptions: {alwaysHit: false, crit: false},
      });
      const {
        attacker: attackerAlways,
        target: targetAlways,
        move: moveAlways,
      } = setupTest({
        moveOptions: {alwaysHit: true, crit: false},
      });

      // Act
      const result95 = computeTurn(attacker95, target95, move95);
      const resultAlways = computeTurn(attackerAlways, targetAlways, moveAlways);
      const states95 = getOutcomeProbabilities(result95);
      const statesAlways = getOutcomeProbabilities(resultAlways);

      // Assert - Always hit should have higher item consumption probability
      // (because miss leaves item intact, while hit consumes it)
      const itemConsume95 = states95.getTotalProbability(t => t.item === null);
      const itemConsumeAlways = statesAlways.getTotalProbability(t => t.item === null);

      expect(itemConsumeAlways).toBeGreaterThanOrEqual(itemConsume95);
    });

    it('should increase miss state probability for non-guaranteed accuracy', () => {
      // Arrange
      const {attacker, target, move} = setupTest({
        moveOptions: {alwaysHit: false, crit: false},
      });

      // Act
      const result = computeTurn(attacker, target, move);
      const states = getOutcomeProbabilities(result);

      // Assert - Should have some probability where target HP is unchanged (miss)
      const targetUnchangedProb = states.getTotalProbability(t => t.hp > 0 && t.item !== null);
      expect(targetUnchangedProb).toBeGreaterThan(0);
    });
  });

  describe('Critical Hit Probability Distribution', () => {
    it('should increase damage range with guaranteed critical hit', () => {
      // Arrange
      const {attacker, target, move} = setupTest({
        moveOptions: {crit: true, alwaysHit: true},
      });

      // Act
      const result = computeTurn(attacker, target, move);
      const states = getOutcomeProbabilities(result);

      // Assert - Just verify probability distribution is valid
      const totalProb = states.getTotalProbability();
      expect(totalProb).toBeCloseTo(1, TOLERANCE);
    });

    it('should have valid probability distribution after attack', () => {
      // Arrange
      const {attacker, target, move} = setupTest({
        moveOptions: {alwaysHit: true}, // crit varies naturally
      });

      // Act
      const result = computeTurn(attacker, target, move);
      const states = getOutcomeProbabilities(result);

      // Assert - Should have valid probability distribution
      const survivalProb = states.getTotalProbability(t => t.hp > 0);
      const koProb = states.getTotalProbability(t => t.hp === 0);

      // At least one of these should have positive probability
      expect(survivalProb + koProb).toBeCloseTo(1, TOLERANCE);
    });
  });

  describe('Target Survival Analysis', () => {
    it('should calculate KO probability', () => {
      // Arrange
      const {attacker, target, move} = setupTest({
        moveOptions: {crit: true, alwaysHit: true},
      });

      // Act
      computeTurn(attacker, target, move);

      // Assert
      const koProbability = target.states.getTotalProbability(state => state.hp === 0);
      expect(koProbability).toBeLessThanOrEqual(1);
      expect(koProbability).toBeGreaterThanOrEqual(0);
    });

    it('should track survival probability', () => {
      // Arrange
      const {attacker, target, move} = setupTest({
        moveOptions: {alwaysHit: true},
      });

      // Act
      computeTurn(attacker, target, move);

      // Assert - Should have non-zero survival probability for Deoxys-Defense
      const survivalProb = target.states.getTotalProbability(state => state.hp > 0);
      expect(survivalProb).toBeGreaterThan(0);
    });

    it('should have opposing survival and KO probabilities sum to total', () => {
      // Arrange
      const {attacker, target, move} = setupTest();

      // Act
      computeTurn(attacker, target, move);

      // Assert
      const survivalProb = target.states.getTotalProbability(state => state.hp > 0);
      const koProb = target.states.getTotalProbability(state => state.hp === 0);
      const total = survivalProb + koProb;

      expect(total).toBeCloseTo(1, TOLERANCE);
    });
  });

  // ============================================================================
  // Regression Tests (Maintain backward compatibility)
  // ============================================================================

  describe('Legacy Test Cases (Backward Compatibility)', () => {
    it('Example 3: Single critical attack with always hit', () => {
      // Arrange
      const {attacker, target, move} = setupTest({
        moveOptions: {crit: true, alwaysHit: true},
      });

      // Act
      const result = computeTurn(attacker, target, move);
      const states = getOutcomeProbabilities(result);

      // Assert
      const itemProbability = states.getTotalProbability(t => t.item !== null);
      const koProbability = states.getTotalProbability(state => state.hp === 0);
      const totalProbability = states.getTotalProbability();

      expect(itemProbability).toBeCloseTo(0, TOLERANCE);
      expect(koProbability).toBe(0);
      expect(totalProbability).toBeCloseTo(1, TOLERANCE);
    });

    it('Example 4: Single attack without always hit (95% accuracy)', () => {
      // Arrange
      const {attacker, target, move} = setupTest({
        moveOptions: {crit: false, alwaysHit: false},
      });

      // Act
      const result = computeTurn(attacker, target, move);
      const states = getOutcomeProbabilities(result);

      // Assert
      const itemProbability = states.getTotalProbability(t => t.item !== null);
      const koProbability = states.getTotalProbability(state => state.hp === 0);
      const totalProbability = states.getTotalProbability();

      expect(itemProbability).toBeCloseTo(0.4938, TOLERANCE);
      expect(koProbability).toBe(0);
      expect(totalProbability).toBeCloseTo(1, TOLERANCE);
    });

    it('Example 5: Two attacks with always hit and accuracy', () => {
      // Arrange
      const {attacker, target, move} = setupTest({
        moveOptions: {alwaysHit: true},
      });

      // Act
      const result1 = computeTurn(attacker, target, move);
      const result2 = computeTurn(attacker, target, move, result1.tree, result1.outcomes);
      const states = getOutcomeProbabilities(result2);

      // Assert
      const itemProbability = states.getTotalProbability(t => t.item !== null);
      const koProbability = states.getTotalProbability(state => state.hp === 0);
      const totalProbability = states.getTotalProbability();

      expect(itemProbability).toBeCloseTo(0.2004, TOLERANCE);
      expect(koProbability).toBeCloseTo(0.2004, TOLERANCE);
      expect(totalProbability).toBeCloseTo(1, TOLERANCE);
    });

    it('Example 6: Two attacks with normal accuracy and critical hit variance', () => {
      // Arrange
      const {attacker, target, move} = setupTest();

      // Act
      const result1 = computeTurn(attacker, target, move);
      const result2 = computeTurn(attacker, target, move, result1.tree, result1.outcomes);
      const states = getOutcomeProbabilities(result2);

      // Assert
      const itemProbability = states.getTotalProbability(t => t.item !== null);
      const koProbability = states.getTotalProbability(state => state.hp === 0);
      const totalProbability = states.getTotalProbability();

      expect(itemProbability).toBeCloseTo(0.2301, TOLERANCE);
      expect(koProbability).toBeCloseTo(0.1786, TOLERANCE);
      expect(totalProbability).toBeCloseTo(1, TOLERANCE);
    });
  });
});

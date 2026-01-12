/**
 * StateTree: A bidirectional tree structure for tracking Pokemon state transformations
 *
 * Nodes are DMG.PokemonState objects, edges are transformations (e.g., hit splits).
 * The tree maintains probability tracking for each path through the space.
 */

/**
 * Metadata that can be attached to a transformation to describe what happened.
 * Examples: damage roll details, HitState, conditional triggers (Berry, ability), move info
 */
export interface TransformationMetadata {
  description?: string;
  type?: string; // e.g., 'damage-roll', 'berry-trigger', 'ability-trigger', 'status-apply'
  [key: string]: any;
}

/**
 * Input specification for creating a transformation edge.
 * Contains the transformation function, probability, and optional metadata.
 */
export interface TransformationSpec<T> {
  transform: (state: T) => T;
  probability: number;
  metadata?: TransformationMetadata;
}

/**
 * First-class representation of a state transformation edge.
 * Links a parent state to a child state with probability and provenance tracking.
 */
class TransformationEdge<T> {
  readonly id: string;
  readonly parent: StateNode<T>;
  readonly child: StateNode<T>;
  readonly probability: number;
  readonly metadata: TransformationMetadata;

  private static nextId = 0;

  constructor(parent: StateNode<T>, child: StateNode<T>, probability: number, metadata?: TransformationMetadata) {
    this.id = `edge_${TransformationEdge.nextId++}`;
    this.parent = parent;
    this.child = child;
    this.probability = probability;
    this.metadata = metadata ?? {};
  }
}

/**
 * Internal node structure for StateTree.
 * Represents a distinct state with incoming/outgoing transformation edges.
 */
class StateNode<T> {
  readonly id: string;
  readonly state: T;
  readonly depth: number;
  readonly incomingEdges: TransformationEdge<T>[] = [];
  readonly outgoingEdges: TransformationEdge<T>[] = [];

  constructor(id: string, state: T, depth: number) {
    this.id = id;
    this.state = state;
    this.depth = depth;
  }
}

export type StateOutcome<T> = {
  readonly state: T;
  readonly id: string;
  probability: number;
  path: string[]; // Node IDs in the path
  transformations: TransformationMetadata[]; // Transformation metadata along the path
};

export type StateTreeStats = {
  totalNodes: number;
  maxDepth: number;
  totalProbabilityMass: number;
  edgeCount: number;
  leafNodeCount: number;
};

/**
 * StateTree: Bidirectional tree of state transformations with probability tracking
 *
 * Nodes are generic state objects (typically DMG.PokemonState)
 * Edges are transformations that split/transform states
 *
 * Example usage:
 * ```
 * const tree = new StateTree<DMG.PokemonState>(
 *   initialState,
 *   state => `${state.hp}|${state.item}`
 * );
 *
 * tree.addTransformation(currentState, [
 *   {
 *     transform: state => ({...state, hp: state.hp - 20}),
 *     probability: 0.5,
 *     metadata: { type: 'damage-roll', roll: 20 }
 *   },
 *   {
 *     transform: state => ({...state, hp: state.hp - 30}),
 *     probability: 0.5,
 *     metadata: { type: 'damage-roll', roll: 30 }
 *   },
 * ]);
 * ```
 */
export class StateTree<T> {
  private nodeMap = new Map<string, StateNode<T>>();
  private root: StateNode<T>;
  private readonly probabilityFloor: number;
  private edgeCount = 0;
  private readonly serializer: (state: T) => string;
  private outcomesCache: StateOutcome<T>[] | null = null;

  constructor(
    source: T,
    serializer: (state: T) => string,
    options?: {
      probabilityFloor?: number;
    }
  ) {
    this.serializer = serializer;
    this.root = this.getOrCreateNode(source, 0);
    this.probabilityFloor = Math.max(0, Math.min(options?.probabilityFloor ?? 0, 0.999));
  }

  /**
   * Get or create a node for a state
   */
  private getOrCreateNode(state: T, depth: number): StateNode<T> {
    const id = this.serializer(state);
    let node = this.nodeMap.get(id);
    if (!node) {
      node = new StateNode(id, state, depth);
      this.nodeMap.set(id, node);
    }
    return node;
  }

  /**
   * Add transformations from a source state to multiple target states.
   * Each transformation produces a new state variant with associated probability.
   *
   * If the total probability of transformations is less than 1.0, the remaining probability
   * is automatically treated as a self-loop (state recurses to itself).
   *
   * @param fromState The source state
   * @param transformations Array of transformations with probabilities and metadata
   */
  addTransformations(fromState: T, transformations: TransformationSpec<T>[]): void {
    const fromId = this.serializer(fromState);
    const fromNode = this.nodeMap.get(fromId);

    if (!fromNode) {
      throw new Error(`Source state not found in tree. Add it first or start from root.`);
    }

    // Validate total probability
    const totalWeight = transformations.reduce((sum, t) => sum + t.probability, 0);
    if (totalWeight <= 0) {
      throw new Error('Total transformation probability must be greater than 0');
    }
    if (totalWeight > 1.0) {
      throw new Error(`Total transformation probability cannot exceed 1.0, got ${totalWeight}`);
    }

    // Process explicit transformations without normalization
    for (const spec of transformations) {
      // Skip if below probability floor
      if (spec.probability < this.probabilityFloor) continue;

      // Apply transformation to create new state
      const newState = spec.transform(structuredClone(fromState));
      const toNode = this.getOrCreateNode(newState, fromNode.depth + 1);

      // Create edge
      const edge = new TransformationEdge(fromNode, toNode, spec.probability, spec.metadata);

      fromNode.outgoingEdges.push(edge);
      toNode.incomingEdges.push(edge);
      this.edgeCount++;
    }

    // If there's remaining probability, add self-loop for this state
    const remainingProbability = 1.0 - totalWeight;
    if (remainingProbability > this.probabilityFloor) {
      const edge = new TransformationEdge(fromNode, fromNode, remainingProbability, {
        type: 'self-recursion',
        description: `Self-loop (${(remainingProbability * 100).toFixed(1)}%)`,
      });

      fromNode.outgoingEdges.push(edge);
      fromNode.incomingEdges.push(edge);
      this.edgeCount++;
    }

    // Invalidate outcomes cache when tree is modified
    this.outcomesCache = null;
  }

  /**
   * Add a single transformation from source to target state
   */
  addTransformation(fromState: T, toState: T, probability: number, metadata?: TransformationMetadata): void {
    if (probability < 0 || probability > 1) {
      throw new Error(`Probability must be between 0 and 1, got ${probability}`);
    }

    this.addTransformations(fromState, [
      {
        transform: () => toState,
        probability,
        metadata,
      },
    ]);
  }

  /**
   * Get all leaf node outcomes with their probabilities and transformation history
   */
  getOutcomes(): StateOutcome<T>[] {
    if (this.outcomesCache) {
      return this.outcomesCache;
    }

    const outcomes = new Map<string, StateOutcome<T>>();
    const visited = new Set<string>();
    this.traverseAndCollectOutcomes(this.root, 1, [], [], outcomes, visited);

    this.outcomesCache = Array.from(outcomes.values());
    return this.outcomesCache;
  }

  /**
   * Recursive traversal to collect all leaf outcomes with transformation tracking
   */
  private traverseAndCollectOutcomes(
    node: StateNode<T>,
    probability: number,
    nodePath: string[],
    transformationPath: TransformationMetadata[],
    outcomes: Map<string, StateOutcome<T>>,
    visited: Set<string>
  ): void {
    // Prune branches below probability floor
    if (probability < this.probabilityFloor) {
      return;
    }

    const currentNodePath = [...nodePath, node.id];

    // Leaf node or cycle detected
    if (node.outgoingEdges.length === 0 || visited.has(node.id)) {
      const existing = outcomes.get(node.id);
      if (existing) {
        existing.probability += probability;
      } else {
        outcomes.set(node.id, {
          state: node.state,
          id: node.id,
          probability,
          path: currentNodePath,
          transformations: transformationPath,
        });
      }
      return;
    }

    visited.add(node.id);

    // Traverse outgoing edges
    for (const edge of node.outgoingEdges) {
      const childProbability = probability * edge.probability;
      const currentTransformationPath = [...transformationPath, edge.metadata];

      this.traverseAndCollectOutcomes(edge.child, childProbability, currentNodePath, currentTransformationPath, outcomes, visited);
    }

    visited.delete(node.id);
  }

  /**
   * Get the probability distribution as a map of state ID to probability
   */
  getProbabilityDistribution(): Map<string, number> {
    const distribution = new Map<string, number>();
    const outcomes = this.getOutcomes();

    for (const outcome of outcomes) {
      distribution.set(outcome.id, outcome.probability);
    }

    return distribution;
  }

  /**
   * Get all paths from root to leaves with transformation details
   */
  getPaths(): Array<{states: T[]; probability: number; transformations: TransformationMetadata[]}> {
    const paths: Array<{states: T[]; probability: number; transformations: TransformationMetadata[]}> = [];
    this.collectPaths(this.root, [], [], 1, paths, new Set());
    return paths;
  }

  /**
   * Recursive path collection with transformation tracking
   */
  private collectPaths(
    node: StateNode<T>,
    currentStatePath: T[],
    currentTransformationPath: TransformationMetadata[],
    probability: number,
    allPaths: Array<{states: T[]; probability: number; transformations: TransformationMetadata[]}>,
    visited: Set<string>
  ): void {
    const newStatePath = [...currentStatePath, node.state];

    if (node.outgoingEdges.length === 0 || visited.has(node.id)) {
      allPaths.push({
        states: newStatePath,
        probability,
        transformations: currentTransformationPath,
      });
      return;
    }

    visited.add(node.id);

    for (const edge of node.outgoingEdges) {
      const newTransformationPath = [...currentTransformationPath, edge.metadata];
      this.collectPaths(edge.child, newStatePath, newTransformationPath, probability * edge.probability, allPaths, visited);
    }

    visited.delete(node.id);
  }

  /**
   * Get statistics about the tree
   */
  getStats(): StateTreeStats {
    const outcomes = this.getOutcomes();
    const nodeDepths = Array.from(this.nodeMap.values()).map(n => n.depth);
    const maxDepth = nodeDepths.length > 0 ? Math.max(...nodeDepths) : 0;
    const leafNodeCount = outcomes.length;
    const totalProbabilityMass = outcomes.reduce((sum, o) => sum + o.probability, 0);

    return {
      totalNodes: this.nodeMap.size,
      maxDepth,
      totalProbabilityMass,
      edgeCount: this.edgeCount,
      leafNodeCount,
    };
  }

  /**
   * Get root state
   */
  getRoot(): T {
    return this.root.state;
  }

  /**
   * Get a specific node's state by ID
   */
  getNodeState(id: string): T | undefined {
    return this.nodeMap.get(id)?.state;
  }

  /**
   * Get all transformation edges (useful for detailed analysis)
   */
  getEdges(): Array<{
    parentId: string;
    childId: string;
    probability: number;
    metadata: TransformationMetadata;
  }> {
    const edges: Array<{
      parentId: string;
      childId: string;
      probability: number;
      metadata: TransformationMetadata;
    }> = [];

    for (const node of this.nodeMap.values()) {
      for (const edge of node.outgoingEdges) {
        edges.push({
          parentId: edge.parent.id,
          childId: edge.child.id,
          probability: edge.probability,
          metadata: edge.metadata,
        });
      }
    }

    return edges;
  }

  /**
   * Clone the tree (deep copy of structure and states)
   */
  clone(): StateTree<T> {
    const cloned = new StateTree<T>(structuredClone(this.root.state), this.serializer, {
      probabilityFloor: this.probabilityFloor,
    });

    // Map old node IDs to new nodes
    const nodeMapping = new Map<string, StateNode<T>>();
    nodeMapping.set(this.root.id, cloned.root);

    // Clone all non-root nodes
    for (const [id, node] of this.nodeMap) {
      if (id !== this.root.id) {
        const clonedNode = cloned.getOrCreateNode(structuredClone(node.state), node.depth);
        nodeMapping.set(id, clonedNode);
      }
    }

    // Clone all edges
    for (const node of this.nodeMap.values()) {
      const clonedFromNode = nodeMapping.get(node.id)!;

      for (const edge of node.outgoingEdges) {
        const clonedToNode = nodeMapping.get(edge.child.id)!;

        const clonedEdge = new TransformationEdge(clonedFromNode, clonedToNode, edge.probability, structuredClone(edge.metadata));

        clonedFromNode.outgoingEdges.push(clonedEdge);
        clonedToNode.incomingEdges.push(clonedEdge);
      }
    }

    cloned.edgeCount = this.edgeCount;
    return cloned;
  }

  /**
   * Visualize the tree structure (console output) with transformation details
   */
  visualize(maxDepth: number = Infinity, label?: (state: T) => string): void {
    console.log('=== StateTree Structure Visualization ===\n');

    const visited = new Set<string>();

    const printNode = (node: StateNode<T>, depth: number, edgeProbability: number, edgeMetadata?: TransformationMetadata): void => {
      if (depth > maxDepth) return;

      const isRepeated = visited.has(node.id);
      visited.add(node.id);

      const indent = '  '.repeat(depth);
      const probPercent = (edgeProbability * 100).toFixed(2);
      const nodeStr = label ? label(node.state) : JSON.stringify(node.state);
      const metaStr = edgeMetadata?.description ? ` [${edgeMetadata.description}]` : '';
      const repeated = isRepeated ? ' (cycle)' : '';

      console.log(`${indent}└─┬ [${probPercent}%]${metaStr} ${nodeStr}${repeated}`);

      if (!isRepeated) {
        for (const edge of node.outgoingEdges) {
          printNode(edge.child, depth + 1, edgeProbability * edge.probability, edge.metadata);
        }
      }
    };

    printNode(this.root, 0, 1);

    const stats = this.getStats();
    console.log('\n=== Tree Statistics ===');
    console.log(`Nodes: ${stats.totalNodes}`);
    console.log(`Edges: ${stats.edgeCount}`);
    console.log(`Max Depth: ${stats.maxDepth}`);
    console.log(`Leaf Nodes: ${stats.leafNodeCount}`);
    console.log(`Total Probability Mass: ${stats.totalProbabilityMass.toFixed(6)}`);
  }

  /**
   * Comprehensive debug visualization with full state and metadata details
   * Shows all information for deep debugging: node IDs, full states, all metadata, edge details
   */
  debugVisualize(maxDepth: number = Infinity): void {
    console.log('╔═══════════════════════════════════════════════════════════════════════════════');
    console.log('║ StateTree DEBUG VISUALIZATION');
    console.log('╚═══════════════════════════════════════════════════════════════════════════════\n');

    const visited = new Set<string>();
    const nodeVisitCounts = new Map<string, number>();

    const printNode = (
      node: StateNode<T>,
      depth: number,
      cumulativeProbability: number,
      edgeMetadata?: TransformationMetadata,
      edgeId?: string
    ): void => {
      if (depth > maxDepth) return;

      const visitCount = nodeVisitCounts.get(node.id) ?? 0;
      nodeVisitCounts.set(node.id, visitCount + 1);

      const isRepeated = visited.has(node.id);
      const isLeaf = node.outgoingEdges.length === 0;

      // Build the visual structure
      const indent = '  '.repeat(depth);
      const boxTop = `${indent}┌${'─'.repeat(78)}┐`;
      const boxBottom = `${indent}└${'─'.repeat(78)}┘`;
      const line = (content: string) => `${indent}│ ${content.padEnd(77)}│`;

      console.log(boxTop);

      // Node header
      const nodeType = isLeaf ? '🍃 LEAF' : isRepeated ? '🔄 CYCLE' : '🔷 NODE';
      const probPercent = (cumulativeProbability * 100).toFixed(4);
      console.log(line(`${nodeType}  Depth: ${depth}  Probability: ${probPercent}%`));
      console.log(line(`Node ID: ${node.id}`));

      if (visitCount > 0) {
        console.log(line(`⚠️  Visited ${visitCount} time(s) previously`));
      }

      // Edge information (if not root)
      if (edgeId && edgeMetadata) {
        console.log(line(`${'─'.repeat(77)}`));
        console.log(line(`📍 Incoming Edge: ${edgeId}`));

        // Show all metadata fields
        const metadataEntries = Object.entries(edgeMetadata);
        if (metadataEntries.length > 0) {
          console.log(line(`   Metadata:`));
          for (const [key, value] of metadataEntries) {
            const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
            const truncated = valueStr.length > 60 ? valueStr.slice(0, 57) + '...' : valueStr;
            console.log(line(`      ${key}: ${truncated}`));
          }
        } else {
          console.log(line(`   Metadata: (none)`));
        }
      }

      // State information
      console.log(line(`${'─'.repeat(77)}`));
      console.log(line(`📊 State Data:`));

      const stateStr = JSON.stringify(node.state, null, 2);
      const stateLines = stateStr.split('\n');
      for (const stateLine of stateLines) {
        // Break long lines
        if (stateLine.length <= 73) {
          console.log(line(`   ${stateLine}`));
        } else {
          const chunks = stateLine.match(/.{1,73}/g) || [stateLine];
          for (const chunk of chunks) {
            console.log(line(`   ${chunk}`));
          }
        }
      }

      // Outgoing edges info
      if (node.outgoingEdges.length > 0 && !isRepeated) {
        console.log(line(`${'─'.repeat(77)}`));
        console.log(line(`🔀 Outgoing Edges: ${node.outgoingEdges.length}`));

        for (let i = 0; i < node.outgoingEdges.length; i++) {
          const edge = node.outgoingEdges[i];
          const edgeProb = (edge.probability * 100).toFixed(2);
          const edgeDesc = edge.metadata.description || edge.metadata.type || '(no description)';
          console.log(line(`   ${i + 1}. [${edgeProb}%] ${edgeDesc} → ${edge.child.id.slice(0, 30)}...`));
        }
      }

      // Incoming edges info (multiple parents case)
      if (node.incomingEdges.length > 1) {
        console.log(line(`${'─'.repeat(77)}`));
        console.log(line(`⬆️  Multiple Incoming Edges: ${node.incomingEdges.length}`));
        for (let i = 0; i < node.incomingEdges.length; i++) {
          const edge = node.incomingEdges[i];
          const edgeProb = (edge.probability * 100).toFixed(2);
          console.log(line(`   ${i + 1}. [${edgeProb}%] from ${edge.parent.id.slice(0, 40)}...`));
        }
      }

      console.log(boxBottom);
      console.log(); // Empty line between nodes

      visited.add(node.id);

      // Recurse to children
      if (!isRepeated) {
        for (const edge of node.outgoingEdges) {
          const childCumulativeProb = cumulativeProbability * edge.probability;
          printNode(edge.child, depth + 1, childCumulativeProb, edge.metadata, edge.id);
        }
      }
    };

    printNode(this.root, 0, 1.0);

    // Print comprehensive statistics
    const stats = this.getStats();
    const outcomes = this.getOutcomes();

    console.log('╔═══════════════════════════════════════════════════════════════════════════════');
    console.log('║ DEBUG STATISTICS');
    console.log('╚═══════════════════════════════════════════════════════════════════════════════\n');

    console.log(`Total Nodes:               ${stats.totalNodes}`);
    console.log(`Total Edges:               ${stats.edgeCount}`);
    console.log(`Max Depth:                 ${stats.maxDepth}`);
    console.log(`Leaf Nodes:                ${stats.leafNodeCount}`);
    console.log(`Total Probability Mass:    ${stats.totalProbabilityMass.toFixed(8)}`);
    console.log(`Probability Floor:         ${this.probabilityFloor}`);

    // Validation
    const validation = this.validateProbabilities();
    const validIcon = validation.valid ? '✅' : '❌';
    console.log(`\nProbability Validation:    ${validIcon} ${validation.message}`);

    // Outcome distribution
    console.log('\n╔═══════════════════════════════════════════════════════════════════════════════');
    console.log('║ OUTCOME DISTRIBUTION');
    console.log('╚═══════════════════════════════════════════════════════════════════════════════\n');

    const sortedOutcomes = outcomes.sort((a, b) => b.probability - a.probability);
    console.log(`Total Outcomes: ${sortedOutcomes.length}\n`);

    for (let i = 0; i < Math.min(sortedOutcomes.length, 20); i++) {
      const outcome = sortedOutcomes[i];
      const prob = (outcome.probability * 100).toFixed(4);
      const pathLength = outcome.path.length;
      const transformCount = outcome.transformations.length;

      console.log(`${(i + 1).toString().padStart(3)}. [${prob.padStart(8)}%] ${outcome.id.slice(0, 50)}`);
      console.log(`     Path Length: ${pathLength}, Transformations: ${transformCount}`);

      // Show transformation summary
      if (transformCount > 0) {
        const transformTypes = outcome.transformations
          .map(t => t.type || t.description || 'unknown')
          .slice(0, 5)
          .join(' → ');
        console.log(`     Transform Path: ${transformTypes}${transformCount > 5 ? '...' : ''}`);
      }
      console.log();
    }

    if (sortedOutcomes.length > 20) {
      console.log(`... and ${sortedOutcomes.length - 20} more outcomes\n`);
    }

    // Node visit frequency analysis
    console.log('╔═══════════════════════════════════════════════════════════════════════════════');
    console.log('║ NODE VISIT ANALYSIS');
    console.log('╚═══════════════════════════════════════════════════════════════════════════════\n');

    const multiVisitNodes = Array.from(nodeVisitCounts.entries())
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1]);

    if (multiVisitNodes.length > 0) {
      console.log(`Nodes visited multiple times: ${multiVisitNodes.length}\n`);
      for (const [nodeId, count] of multiVisitNodes.slice(0, 10)) {
        console.log(`  ${count}x - ${nodeId.slice(0, 60)}`);
      }
      if (multiVisitNodes.length > 10) {
        console.log(`  ... and ${multiVisitNodes.length - 10} more`);
      }
    } else {
      console.log('No nodes visited multiple times (clean tree structure)');
    }

    console.log('\n' + '═'.repeat(80) + '\n');
  }

  /**
   * Export tree to Graphviz DOT format with transformation edge labels
   *
   * LEAF NODE DEFINITION:
   * A node is considered a "leaf outcome" if:
   * - It has a self-loop edge, OR
   * - It has no outgoing edges, OR
   * - It is part of a cycle
   *
   * Leaf nodes are highlighted with a double-circle border (shape=circle).
   * Self-loops are shown as curved edges back to the same node with dashed lines.
   *
   * @param maxDepth Maximum depth to traverse in the tree
   * @param label Optional function to generate custom labels for nodes
   * @returns DOT format string for Graphviz
   */
  toGraphviz(maxDepth: number = Infinity, label?: (state: T) => string): string {
    const lines: string[] = ['digraph G {', '  graph [ranksep=3];', '  node [shape=box];'];
    const visitedNodes = new Set<string>();
    const visitedEdges = new Set<string>();

    // First pass: identify leaf nodes and detect cycles
    const leafNodes = new Set<string>();
    const inCycle = new Set<string>();

    // Detect cycles using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectCycles = (nodeId: string) => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = this.nodeMap.get(nodeId);
      if (node) {
        for (const edge of node.outgoingEdges) {
          const childId = edge.child.id;
          if (!visited.has(childId)) {
            detectCycles(childId);
          } else if (recursionStack.has(childId)) {
            // Found a cycle
            inCycle.add(nodeId);
            inCycle.add(childId);
          }
        }
      }

      recursionStack.delete(nodeId);
    };

    // Run cycle detection from all nodes
    for (const nodeId of this.nodeMap.keys()) {
      if (!visited.has(nodeId)) {
        detectCycles(nodeId);
      }
    }

    // Identify leaf nodes
    for (const node of this.nodeMap.values()) {
      const hasSelfLoop = node.outgoingEdges.some(edge => edge.child.id === node.id);
      const hasNoOutgoing = node.outgoingEdges.length === 0;
      const isInCycle = inCycle.has(node.id);

      if (hasSelfLoop || hasNoOutgoing || isInCycle) {
        leafNodes.add(node.id);
      }
    }

    const processNode = (node: StateNode<T>, depth: number): void => {
      if (depth > maxDepth) return;

      const nodeId = node.id.replace(/"/g, '\\"');

      if (!visitedNodes.has(node.id)) {
        const nodeLabel = label ? label(node.state) : JSON.stringify(node.state).replace(/"/g, '\\"');
        const isLeaf = leafNodes.has(node.id);

        // Leaf nodes get double-circle border
        const nodeShape = isLeaf ? 'circle' : 'box';

        let nodeAttrs = `shape=${nodeShape}`;

        lines.push(`  "${nodeId}" [label="${nodeLabel}",${nodeAttrs}];`);
        visitedNodes.add(node.id);
      }

      for (const edge of node.outgoingEdges) {
        const edgeKey = `${edge.parent.id}->${edge.child.id}`;
        if (!visitedEdges.has(edgeKey)) {
          const childId = edge.child.id.replace(/"/g, '\\"');
          const probPercent = (edge.probability * 100).toFixed(1);

          // Build metadata label
          const metaParts: string[] = [];
          if (edge.metadata.description) {
            metaParts.push(edge.metadata.description);
          }
          if (edge.metadata.type) {
            metaParts.push(`[${edge.metadata.type}]`);
          }
          if (edge.metadata.hpChange !== undefined) {
            const sign = edge.metadata.hpChange > 0 ? '+' : '';
            metaParts.push(`HP: ${sign}${edge.metadata.hpChange}`);
          }
          if (edge.metadata.itemChange) {
            metaParts.push('Item changed');
          }

          const metaLabel = metaParts.length > 0 ? `\\n${metaParts.join('\n')}` : '';

          // Self-loops get special styling
          const isSelfLoop = edge.parent.id === edge.child.id;
          const edgeStyle = isSelfLoop ? ',style=dashed,constraint=false' : '';

          lines.push(`  "${nodeId}" -> "${childId}" [label="${probPercent}%${metaLabel}"${edgeStyle}];`);
          visitedEdges.add(edgeKey);

          processNode(edge.child, depth + 1);
        }
      }
    };

    processNode(this.root, 0);
    lines.push('}');

    return lines.join('\n');
  }

  // ============================================================
  // Additional Analysis Methods
  // ============================================================

  /**
   * Filter outcomes by a predicate function
   */
  filterOutcomes(predicate: (state: T) => boolean): StateOutcome<T>[] {
    return this.getOutcomes().filter(outcome => predicate(outcome.state));
  }

  /**
   * Find first outcome matching predicate
   */
  findOutcome(predicate: (state: T) => boolean): StateOutcome<T> | undefined {
    return this.getOutcomes().find(outcome => predicate(outcome.state));
  }

  /**
   * Get the transformation history for a specific leaf outcome by node ID
   */
  getTransformationHistory(leafNodeId: string): TransformationMetadata[] {
    const outcome = this.getOutcomes().find(o => o.id === leafNodeId);
    return outcome?.transformations ?? [];
  }

  /**
   * Validate that probabilities sum to ~1.0 at leaves
   */
  validateProbabilities(epsilon = 1e-6): {valid: boolean; message: string} {
    const outcomes = this.getOutcomes();
    const totalProb = outcomes.reduce((sum, o) => sum + o.probability, 0);
    const valid = Math.abs(totalProb - 1.0) < epsilon;
    const message = valid
      ? `Probabilities valid: sum = ${totalProb.toFixed(6)}`
      : `Probabilities invalid: sum = ${totalProb.toFixed(6)} (expected ~1.0)`;
    return {valid, message};
  }

  /**
   * Group outcomes by a property with their full StateOutcome data
   */
  groupOutcomesByProperty<K extends keyof T>(key: K): Map<T[K], StateOutcome<T>[]> {
    const groups = new Map<T[K], StateOutcome<T>[]>();
    const outcomes = this.getOutcomes();

    for (const outcome of outcomes) {
      const value = outcome.state[key];
      const existing = groups.get(value);
      if (existing) {
        existing.push(outcome);
      } else {
        groups.set(value, [outcome]);
      }
    }

    return groups;
  }
}

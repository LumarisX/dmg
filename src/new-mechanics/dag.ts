class Node<T> {
  readonly id: string;
  readonly value: T;
  readonly children: Map<string, Edge<T>> = new Map();
  readonly depth: number;
  constructor(id: string, value: T, depth: number) {
    this.id = id;
    this.value = value;
    this.depth = depth;
  }

  getChild(toNode: Node<T>): Edge<T> | undefined {
    return this.children.get(toNode.id);
  }

  addChild(toNode: Node<T>, probability: number): Edge<T> {
    const edge = new Edge(toNode, probability);
    this.children.set(toNode.id, edge);
    return edge;
  }

  updateChildProbability(edge: Edge<T>, probability: number): void {
    edge.probability += probability;
  }
}

class Edge<T> {
  readonly target: Node<T>;
  probability: number;
  constructor(target: Node<T>, probability: number) {
    this.target = target;
    this.probability = probability;
  }
}

type Outcome<T> = {
  readonly value: T;
  readonly id: string;
  probability: number;
};

type Stats = {
  totalNodes: number;
  maxDepth: number;
  totalProbabilityMass: number;
  edgeCount: number;
};

export class DAG<T> {
  private nodeMap: Map<string, Node<T>> = new Map();
  private root: Node<T>;
  private probabilityFloor: number;
  private edgeCount: number = 0;
  private serializer: (value: T) => string;
  private enforceAcyclicity: boolean;
  private outcomesCache: Outcome<T>[] | null = null;
  private distributionCache: Map<string, number> | null = null;
  constructor(
    source: T,
    serializer: (value: T) => string,
    options?: {
      probabilityFloor?: number;
      enforceAcyclicity?: boolean;
    }
  ) {
    this.serializer = serializer;
    this.root = this.getOrCreateNode(source, 0);
    this.probabilityFloor = Math.max(0, Math.min(options?.probabilityFloor ?? 0, 0.999));
    this.enforceAcyclicity = options?.enforceAcyclicity ?? false;
  }

  private getOrCreateNode(value: T, depth?: number): Node<T> {
    const id = this.serializer(value);
    if (this.nodeMap.has(id)) {
      return this.nodeMap.get(id)!;
    }
    const node = new Node(id, value, depth ?? 0);
    this.nodeMap.set(id, node);
    return node;
  }

  private getNode(id: string): Node<T> | undefined {
    return this.nodeMap.get(id);
  }

  addTransition(from: T, to: T, probability: number): void {
    if (probability < 0 || probability > 1) throw new Error(`Probability must be between 0 and 1, got ${probability}`);
    if (probability < this.probabilityFloor || probability === 0) return;

    const fromId = this.serializer(from);
    const toId = this.serializer(to);

    const fromNode = this.getNode(fromId);
    if (!fromNode) throw new Error(`Source node ${fromId} does not exist`);

    // Depth-based cycle detection: if toNode already exists and would be at a shallower depth, it's a cycle
    const existingToNode = this.getNode(toId);
    if (this.enforceAcyclicity && existingToNode && existingToNode.depth <= fromNode.depth) {
      throw new Error(`Adding transition from ${fromId} to ${toId} would create a cycle`);
    }

    const toNode = this.getOrCreateNode(to, fromNode.depth + 1);

    const existingEdge = fromNode.getChild(toNode);
    if (existingEdge) {
      fromNode.updateChildProbability(existingEdge, probability);
    } else {
      fromNode.addChild(toNode, probability);
      this.edgeCount++;
    }

    // Invalidate caches when graph is modified
    this.outcomesCache = null;
    this.distributionCache = null;
  }

  private traverseAndCollectOutcomes(node: Node<T>, probability: number, outcomes: Map<string, Outcome<T>>, visited: Set<string> = new Set()): void {
    // Prune branches below probability floor during traversal
    if (probability < this.probabilityFloor) {
      return;
    }

    if (visited.has(node.id)) {
      const outcome = outcomes.get(node.id) || {
        value: node.value,
        id: node.id,
        probability: 0,
      };
      outcome.probability += probability;
      outcomes.set(node.id, outcome);
      return;
    }

    if (node.children.size === 0) {
      const outcome = outcomes.get(node.id) || {
        value: node.value,
        id: node.id,
        probability: 0,
      };
      outcome.probability += probability;
      outcomes.set(node.id, outcome);
      return;
    }

    visited.add(node.id);
    for (const edge of node.children.values()) {
      this.traverseAndCollectOutcomes(edge.target, probability * edge.probability, outcomes, visited);
    }
    visited.delete(node.id);
  }

  getOutcomes(): Outcome<T>[] {
    if (this.outcomesCache) {
      return this.outcomesCache;
    }
    const outcomes = new Map<string, Outcome<T>>();
    this.traverseAndCollectOutcomes(this.root, 1, outcomes);
    this.outcomesCache = Array.from(outcomes.values());
    return this.outcomesCache;
  }

  getProbabilityDistribution(): Map<string, number> {
    if (this.distributionCache) {
      return this.distributionCache;
    }
    const distribution = new Map<string, number>();
    const outcomes = new Map<string, Outcome<T>>();
    this.traverseAndCollectOutcomes(this.root, 1, outcomes);
    for (const outcome of outcomes.values()) {
      distribution.set(outcome.id, outcome.probability);
    }
    this.distributionCache = distribution;
    return distribution;
  }

  getStats(): Stats {
    const outcomes = this.getOutcomes();
    const nodeDepths = Array.from(this.nodeMap.values()).map(n => n.depth);
    const maxDepth = nodeDepths.length > 0 ? Math.max(...nodeDepths) : 0;
    const totalProbabilityMass = outcomes.reduce((sum, o) => sum + o.probability, 0);

    return {
      totalNodes: this.nodeMap.size,
      maxDepth,
      totalProbabilityMass,
      edgeCount: this.edgeCount,
    };
  }

  getPaths(): Array<{path: Node<T>[]; probability: number}> {
    const paths: Array<{path: Node<T>[]; probability: number}> = [];
    this.collectPaths(this.root, [], 1, paths);
    return paths;
  }

  private collectPaths(node: Node<T>, currentPath: Node<T>[], probability: number, allPaths: Array<{path: Node<T>[]; probability: number}>): void {
    const newPath = [...currentPath, node];

    if (node.children.size === 0) {
      allPaths.push({path: newPath, probability});
      return;
    }

    for (const edge of node.children.values()) {
      this.collectPaths(edge.target, newPath, probability * edge.probability, allPaths);
    }
  }

  visualize(maxDepth: number = Infinity): void {
    console.log('=== DAG Structure Visualization ===\n');

    const visited = new Set<string>();

    const printNode = (node: Node<T>, depth: number, edgeProbability: number): void => {
      if (depth > maxDepth) {
        return;
      }

      const nodeKey = node.id;
      const isRepeated = visited.has(nodeKey);
      visited.add(nodeKey);

      const indent = '    '.repeat(depth);
      const probPercent = (edgeProbability * 100).toFixed(2);
      const nodeStr = JSON.stringify(node.value);
      const repeated = isRepeated ? ' (deduplicated)' : '';

      console.log(`${indent}├─ [${probPercent}%] ${nodeStr}${repeated}`);

      if (!isRepeated) {
        for (const edge of node.children.values()) {
          printNode(edge.target, depth + 1, edgeProbability * edge.probability);
        }
      }
    };

    printNode(this.root, 0, 1);

    console.log('\nTotal Nodes:', this.nodeMap.size);
    console.log('Total Edges:', this.edgeCount);
  }

  toGraphviz(maxDepth: number = Infinity, label?: (t: T) => string): string {
    const lines: string[] = ['digraph G {', '  graph [ranksep=5];'];
    const visited = new Set<string>();

    const addNodeAndEdges = (node: Node<T>, depth: number): void => {
      if (depth > maxDepth) {
        return;
      }

      const nodeId = node.id;

      // Skip if already visited to prevent infinite recursion
      if (visited.has(nodeId)) {
        return;
      }
      visited.add(nodeId);

      // Escape nodeId for Graphviz (handle quotes in JSON strings)
      const escapedNodeId = nodeId.replace(/"/g, '\\"');

      // Add node with label (escaped for Graphviz)
      const nodeLabel = label ? label(node.value) : JSON.stringify(node.value).replace(/"/g, '\\"');
      lines.push(`  "${escapedNodeId}" [label="${nodeLabel}"];`);

      // Add edges to children
      for (const edge of node.children.values()) {
        const targetId = edge.target.id;
        const escapedTargetId = targetId.replace(/"/g, '\\"');
        const probPercent = (edge.probability * 100).toFixed(1);
        lines.push(`  "${escapedNodeId}" -> "${escapedTargetId}" [label="${probPercent}%"];`);
        addNodeAndEdges(edge.target, depth + 1);
      }
    };

    addNodeAndEdges(this.root, 0);
    lines.push('}');

    return lines.join('\n');
  }
}

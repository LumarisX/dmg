import {Distribution, Keyer, Labels, Outcome} from './distribution';
import {stateKey} from './key';
import {State} from './state';

/**
 * A move resolution in progress: a state, whether this line of play has stopped, whether any hit
 * connected, and the scalar label values describing how it got here.
 *
 * Neither flag is derivable from the state. A missed move leaves the state untouched, so `done`
 * must be carried. And `landed` is not the same as `done` — a move that connected and fainted the
 * target is both done and landed, and still applies its secondaries, while a move that missed
 * outright applies none.
 *
 * `remaining` is how many hits this line still owes. It is what lets one distribution carry lines
 * from different hit-count branches at once: a line that runs out passes through the remaining
 * iterations untouched. Terminated lines are always normalised to `remaining: 0` so that a line
 * which fainted its target on hit 2 of five merges with one that simply had two hits to give.
 *
 * `done`, `landed` and `remaining` participate in the merge key but are not projected: they
 * describe how a resolution got here, not the state it reached.
 */
export interface Resolution {
  state: State;
  done: boolean;
  landed: boolean;
  remaining: number;
  labels: LabelValues;
}

export interface LabelValues {
  [axis: string]: string | number;
}

export function resolutionKey(resolution: Resolution): string {
  let key = (resolution.done ? 'x' : 'o') + (resolution.landed ? 'h' : 'm') + resolution.remaining;
  for (const axis of Object.keys(resolution.labels).sort()) {
    key += ';' + axis + '=' + resolution.labels[axis];
  }
  return key + '|' + stateKey(resolution.state);
}

export function single(resolution: Resolution): Distribution<Resolution> {
  const distribution = resolutionDistribution();
  distribution.outcomes = [{data: resolution, count: 1}];
  return distribution;
}

export function resolutionDistribution(): Distribution<Resolution> {
  return new Distribution<Resolution>(undefined, resolutionKey as Keyer<Resolution>);
}

export function withLabel(resolution: Resolution, axis: string, value: string | number): Resolution {
  return {...resolution, labels: {...resolution.labels, [axis]: value}};
}

/**
 * Collapses resolutions to states, turning each resolution's scalar label values into the
 * per-outcome label distributions callers see. Resolutions that reached the same state merge, which
 * is where an irrelevant crit or an irrelevant move-data branch disappears.
 */
export function toStateDistribution(resolved: Distribution<Resolution>): Outcome<State>[] {
  const merged = new Map<string, Outcome<State>>();
  for (const outcome of resolved.outcomes) {
    const {state, labels} = outcome.data;
    const key = stateKey(state);
    const existing = merged.get(key);
    if (existing) {
      existing.count += outcome.count;
      for (const axis of Object.keys(labels)) {
        const counts = (existing.labels![axis] ??= {});
        counts[labels[axis]] = (counts[labels[axis]] ?? 0) + outcome.count;
      }
    } else {
      const collected: Labels = {};
      for (const axis of Object.keys(labels)) collected[axis] = {[labels[axis]]: outcome.count};
      merged.set(key, {data: state, count: outcome.count, labels: collected});
    }
  }
  return [...merged.values()];
}

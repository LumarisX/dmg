import {Generations} from '@pkmn/data';

import {LabelCounts} from '../distribution';
import {
  UnsupportedMoveError,
  accuracyBranches,
  critBranches,
  critCounts,
  hitCountBranches,
  labelCounts,
  resolveMove,
  secondaryBranches,
} from '../resolve';
import {State} from '../state';
import {resolveTurns} from '../turns';
import {Scenario, ScenarioSide} from './scenarios';

export interface DamagePoint {
  damage: number;
  percent: number;
  probability: number;
}

export interface Analysis {
  scenario: Scenario;
  supported: boolean;
  reasons?: string[];
  maxhp: number;
  startingHp: number;
  elapsedMs: number;

  distinctOutcomes?: number;
  exact?: boolean;
  totalWeight?: number;
  damage?: {min: number; max: number; expected: number; points: DamagePoint[]};
  survival?: {damage: number; probability: number}[];
  crits?: LabelCounts;
  moveData?: LabelCounts;
  branches?: {label: string; entries: string[]}[];
  turns?: {
    count: number;
    exactlyOn: number[];
    cumulative: number[];
    stillStanding: number;
    unexpanded: number;
    resolves: number;
    summary: string;
  };
  outcomes?: {probability: number; damage: number; hp: number; fainted: boolean; status?: string}[];
}

function buildPokemon(gen: ReturnType<Generations['get']>, side: ScenarioSide): State.Pokemon {
  const pokemon = State.createPokemon(gen, side.species, {
    level: side.level,
    ability: side.ability,
    item: side.item,
    nature: side.nature as never,
    evs: side.evs,
    ivs: side.ivs,
    boosts: side.boosts,
    status: side.status as never,
    teraType: side.teraType as never,
    terastallized: side.terastallized,
  });
  if (side.hp !== undefined) pokemon.hp = side.hp;
  return pokemon;
}

export function analyse(gens: Generations, scenario: Scenario): Analysis {
  const gen = gens.get((scenario.gen ?? 9) as never);
  const attacker = buildPokemon(gen, scenario.attacker);
  const defender = buildPokemon(gen, scenario.defender);
  const state = State.oneOnOne(
    gen,
    attacker,
    defender,
    State.createMove(gen, scenario.move),
    State.createField(gen, {weather: scenario.weather, terrain: scenario.terrain})
  );

  const maxhp = state.target.maxhp;
  const startingHp = state.target.hp;
  const started = process.hrtime.bigint();

  let distribution;
  try {
    distribution = resolveMove(state);
  } catch (error) {
    if (!(error instanceof UnsupportedMoveError)) throw error;
    return {
      scenario,
      supported: false,
      reasons: error.reasons,
      maxhp,
      startingHp,
      elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
    };
  }

  const total = distribution.totalOutcomes;
  const byDamage = new Map<number, number>();
  for (const outcome of distribution.outcomes) {
    const damage = startingHp - Math.max(0, outcome.data.target.hp);
    byDamage.set(damage, (byDamage.get(damage) ?? 0) + outcome.count / total);
  }

  const points: DamagePoint[] = [...byDamage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([damage, probability]) => ({
      damage,
      percent: (damage / maxhp) * 100,
      probability,
    }));

  const survival: {damage: number; probability: number}[] = [];
  let remaining = 1;
  for (const point of points) {
    survival.push({damage: point.damage, probability: remaining});
    remaining -= point.probability;
  }
  survival.push({damage: points.length ? points[points.length - 1].damage : 0, probability: Math.max(0, remaining)});

  const turnCount = scenario.turns ?? 10;
  const projection = resolveTurns(state, {turns: turnCount, maxResolves: scenario.maxResolves});
  const cumulative = projection.knockoutByTurn;
  const exactlyOn = cumulative.map((chance, index) => chance - (index ? cumulative[index - 1] : 0));

  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  return {
    scenario,
    supported: true,
    maxhp,
    startingHp,
    elapsedMs,
    distinctOutcomes: distribution.size(),
    exact: distribution.exact,
    totalWeight: total,
    crits: critCounts(distribution),
    moveData: labelCounts(distribution, 'branch'),
    damage: {
      min: points.length ? points[0].damage : 0,
      max: points.length ? points[points.length - 1].damage : 0,
      expected: points.reduce((sum, p) => sum + p.damage * p.probability, 0),
      points,
    },
    survival,
    branches: [
      {
        label: 'Accuracy',
        entries: accuracyBranches(state.move).map(b => `${b.lands ? 'lands' : 'misses'} × ${b.weight}`),
      },
      {
        label: 'Crit',
        entries: critBranches(state).map(b => `${b.crit ? 'crit' : 'no crit'} × ${b.weight}`),
      },
      {
        label: 'Hits',
        entries: hitCountBranches(gen.num, state.move, state.attacker).map(b => `${b.hits} hit(s) × ${b.weight}`),
      },
      {
        label: 'Secondaries',
        entries: secondaryBranches(state).map(
          b => `${b.effects.length ? b.effects.map(describeSecondary).join('; ') : 'none'} × ${b.weight}`
        ),
      },
    ],
    turns: {
      count: turnCount,
      exactlyOn,
      cumulative,
      stillStanding: 1 - (cumulative[cumulative.length - 1] ?? 0),
      unexpanded: projection.unexpandedMass,
      resolves: projection.resolves,
      summary: summarise(exactlyOn, cumulative, turnCount, projection.unexpandedMass),
    },
    outcomes: distribution.outcomes
      .map(outcome => ({
        probability: outcome.count / total,
        damage: startingHp - Math.max(0, outcome.data.target.hp),
        hp: Math.max(0, outcome.data.target.hp),
        fainted: outcome.data.target.hp <= 0,
        status: outcome.data.target.status,
      }))
      .sort((a, b) => a.damage - b.damage),
  };
}

function describeSecondary(effect: {chance?: number; status?: string; volatileStatus?: string; boosts?: object}): string {
  const parts: string[] = [];
  if (effect.status) parts.push(effect.status);
  if (effect.volatileStatus) parts.push(effect.volatileStatus);
  if (effect.boosts) parts.push(JSON.stringify(effect.boosts));
  return `${effect.chance ?? 100}% ${parts.join('/') || 'effect'}`;
}

function summarise(exactlyOn: number[], cumulative: number[], turns: number, unexpanded: number): string {
  const pct = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
  const resolved = exactlyOn
    .map((probability, index) => ({turn: index + 1, probability}))
    .filter(entry => entry.probability > 1e-9);

  const found = cumulative[cumulative.length - 1] ?? 0;
  if (unexpanded > 1e-9) {
    return `at least ${pct(found)} within ${turns} turns — ${pct(unexpanded)} never advanced (compute budget), so this is a floor`;
  }
  if (!resolved.length) return `no knockout within ${turns} turns`;
  if (found < 0.005) return `essentially never — ${pct(found, 3)} to knock out within ${turns} turns`;

  const likeliest = resolved.reduce((best, entry) => (entry.probability > best.probability ? entry : best));
  const first = resolved[0].turn;
  const last = resolved[resolved.length - 1].turn;
  const range = first === last ? `${first}` : `${first}–${last}`;
  const standing = 1 - (cumulative[cumulative.length - 1] ?? 0);
  const tail = standing > 1e-9 ? `, ${pct(standing)} still standing after ${turns}` : '';
  return `${likeliest.turn}HKO — ${range} turns (${pct(likeliest.probability)} on turn ${likeliest.turn})${tail}`;
}

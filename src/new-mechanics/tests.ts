import {Data, Generation, Generations, ID} from '@pkmn/data';
import {Dex, ModData, ModdedDex} from '@pkmn/dex';
import {DMG} from './dmg';
import {computeTurn, TurnResult} from './poc';
import * as fs from 'fs';
import {StateTree} from './state-tree';

const NATDEX_UNOBTAINABLE_SPECIES = ['Pichu-Spiky-eared', 'Eternatus-Eternamax'];

const COSMETIC_SPECIES = [
  'Maushold-Four',
  'Sinistea-Antique',
  'Polteageist-Antique',
  'Dudunsparce-Three-Segment',
  'Poltchageist-Artisan',
  'Sinistcha-Masterpiece',
  'Magearna-Original',
  'Magearna-Original-Mega',
  'Pikachu-Original',
  'Pikachu-Hoenn',
  'Pikachu-Sinnoh',
  'Pikachu-Unova',
  'Pikachu-Kalos',
  'Pikachu-Alola',
  'Pikachu-Partner',
  'Pikachu-World',
  'Vivillon-Pokeball',
  'Vivillon-Fancy',
  'Cramorant-Gorging',
  'Ogerpon-Teal-Tera',
  'Ogerpon-Hearthflame-Tera',
  'Ogerpon-Cornerstone-Tera',
  'Ogerpon-Wellspring-Tera',
  'Tatsugiri-Stretchy',
  'Tatsugiri-Droopy',
  'Tatsugiri-Stretchy-Mega',
  'Tatsugiri-Droopy-Mega',
];

type ExistFilter = {
  nonstandard?: string[];
  species?: {
    unobtainable?: string[];
    cosmetic?: string[];
  };
};

function _exists(d: Data, filters: ExistFilter = {}) {
  if (!d.exists) return false;
  if (d.kind === 'Ability' && d.id === 'noability') return false;
  if ('isNonstandard' in d && d.isNonstandard) {
    if ('tier' in d && d.tier === 'Unreleased') return false;
    if (filters.nonstandard && filters.nonstandard.includes(d.isNonstandard)) {
      return false;
    }
    if (d.kind === 'Move' && d.isNonstandard !== 'Past' && d.isNonstandard !== 'Unobtainable') {
      return false;
    }
  }
  if (d.kind === 'Species') {
    if (d.forme === 'Totem' || d.forme === 'Alola-Totem') return false;
    if (d.isCosmeticForme) return false;
    if (filters.species) {
      if (filters.species.unobtainable && filters.species.unobtainable.includes(d.name)) return false;
      if (filters.species.cosmetic && filters.species.cosmetic.includes(d.name)) return false;
    }
  }

  if (d.kind === 'Item' && d.isNonstandard && ['Past', 'Unobtainable'].includes(d.isNonstandard) && !d.zMove && !d.itemUser && !d.forcedForme) {
    return false;
  }
  return true;
}

function ROM_EXISTS(d: Data) {
  return _exists(d, {
    nonstandard: ['CAP', 'Custom', 'Future'],
  });
}

function NATDEX_EXISTS(d: Data) {
  return _exists(d, {
    nonstandard: ['CAP', 'Custom', 'Future'],
    species: {
      unobtainable: NATDEX_UNOBTAINABLE_SPECIES,
      cosmetic: COSMETIC_SPECIES,
    },
  });
}

function ZA_EXISTS(d: Data) {
  return _exists(d, {
    nonstandard: ['CAP', 'Custom'],
    species: {
      unobtainable: NATDEX_UNOBTAINABLE_SPECIES,
      cosmetic: COSMETIC_SPECIES,
    },
  });
}

function CAP_EXISTS(d: Data) {
  return _exists(d, {
    nonstandard: ['Custom', 'Future'],
    species: {
      unobtainable: NATDEX_UNOBTAINABLE_SPECIES,
      cosmetic: COSMETIC_SPECIES,
    },
  });
}

function DRAFT_EXISTS(d: Data) {
  if (!NATDEX_EXISTS(d)) return false;
  if ('isNonstandard' in d && d.isNonstandard) return false;
  return !('tier' in d && ['Illegal'].includes(d.tier));
}

const RULESET_IDS = {
  ZA_NATDEX: 'ZA NatDex',
  GEN9_NATDEX: 'Gen9 NatDex',
  PALDEA_DEX: 'Paldea Dex',
  GEN8_NATDEX: 'Gen8 NatDex',
  GALAR_DEX: 'Galar Dex',
  ALOLA_DEX: 'Alola Dex',
  KALOS_DEX: 'Kalos Dex',
  UNOVA_DEX: 'Unova Dex',
  SINNOH_DEX: 'Sinnoh Dex',
  HOENN_DEX: 'Hoenn Dex',
  JOHTO_DEX: 'Johto Dex',
  KANTO_DEX: 'Kanto Dex',
  SWORD_SHIELD: 'Sword/Shield',
  RADICAL_RED: 'radicalred',
  INSURGANCE: 'insurgance',
  CAP_GEN9: 'CAP Gen 9',
} as const;

export type RulesetId = (typeof RULESET_IDS)[keyof typeof RULESET_IDS];

export class Ruleset extends Generation {
  name: RulesetId;
  restriction?: 'Pentagon' | 'Plus' | 'Galar' | 'Paldea';
  isNatDex: boolean;
  constructor(dex: ModdedDex, exists: (d: Data) => boolean, name: RulesetId, options?: {restriction?: 'Pentagon' | 'Plus' | 'Galar' | 'Paldea'}) {
    super(dex, exists);
    this.name = name;
    this.restriction = options?.restriction;
    this.isNatDex = this.exists === NATDEX_EXISTS;
  }
}

const gens = new Generations(Dex);

export const Rulesets: {
  [key: string]: {
    [key: string]: {
      desc?: string;
      id: RulesetId;
      ruleset: Ruleset;
    };
  };
} = {
  'Gen 9': {
    'National Dex': {
      id: RULESET_IDS.GEN9_NATDEX,
      desc: 'Only Pokémon available in Generation 9 and before',
      ruleset: new Ruleset(Dex.forGen(9), (d: Data) => !(!NATDEX_EXISTS(d) || (d.kind === 'Species' && d.forme === 'Gmax')), RULESET_IDS.GEN9_NATDEX),
    },
    'Paldea Dex': {
      id: RULESET_IDS.PALDEA_DEX,
      desc: 'Only Pokémon available in the Paldea Dex',
      ruleset: new Ruleset(Dex.forGen(9), DRAFT_EXISTS, RULESET_IDS.PALDEA_DEX, {
        restriction: 'Paldea',
      }),
    },
    'ZA National Dex': {
      id: RULESET_IDS.ZA_NATDEX,
      desc: 'Only Pokémon available in Generation 9 and before',
      ruleset: new Ruleset(Dex.forGen(9), (d: Data) => !(!ZA_EXISTS(d) || (d.kind === 'Species' && d.forme === 'Gmax')), RULESET_IDS.ZA_NATDEX),
    },
  },
  //Lazy-loaded since not frequently accessed
  'Gen 8': {
    'National Dex': {
      id: RULESET_IDS.GEN8_NATDEX,
      desc: 'All Pokémon available in Generation 8 and before',
      get ruleset() {
        return new Ruleset(Dex.forGen(8), NATDEX_EXISTS, this.id);
      },
    },
    'Sword/Shield': {
      id: RULESET_IDS.SWORD_SHIELD,
      desc: 'All Pokémon available to be transferred to Sword/Shield',
      get ruleset() {
        return new Ruleset(Dex.forGen(8), DRAFT_EXISTS, this.id);
      },
    },
    'Galar Dex': {
      id: RULESET_IDS.GALAR_DEX,
      desc: 'Only Pokémon available in the Galar Dex',
      get ruleset() {
        return new Ruleset(Dex.forGen(8), DRAFT_EXISTS, this.id, {
          restriction: 'Galar',
        });
      },
    },
  },
  'Older Gens': {
    'Generation 7': {
      id: RULESET_IDS.ALOLA_DEX,
      desc: 'All Pokémon available in Generation 7 and before',
      get ruleset() {
        return new Ruleset(Dex.forGen(7), DRAFT_EXISTS, this.id);
      },
    },
    'Generation 6': {
      id: RULESET_IDS.KALOS_DEX,
      desc: 'All Pokémon available in Generation 6 and before',
      get ruleset() {
        return new Ruleset(Dex.forGen(6), DRAFT_EXISTS, this.id);
      },
    },
    'Generation 5': {
      id: RULESET_IDS.UNOVA_DEX,
      desc: 'All Pokémon available in Generation 5 and before',
      get ruleset() {
        return new Ruleset(Dex.forGen(5), DRAFT_EXISTS, this.id);
      },
    },
    'Generation 4': {
      id: RULESET_IDS.SINNOH_DEX,
      desc: 'All Pokémon available in Generation 4 and before',
      get ruleset() {
        return new Ruleset(Dex.forGen(4), DRAFT_EXISTS, this.id);
      },
    },
    'Generation 3': {
      id: RULESET_IDS.HOENN_DEX,
      desc: 'All Pokémon available in Generation 3 and before',
      get ruleset() {
        return new Ruleset(Dex.forGen(3), DRAFT_EXISTS, this.id);
      },
    },
    'Generation 2': {
      id: RULESET_IDS.JOHTO_DEX,
      desc: 'All Pokémon available in Generation 2 and before',
      get ruleset() {
        return new Ruleset(Dex.forGen(2), DRAFT_EXISTS, this.id);
      },
    },
    'Generation 1': {
      id: RULESET_IDS.KANTO_DEX,
      desc: 'All Pokémon available in Generation 1',
      get ruleset() {
        return new Ruleset(Dex.forGen(1), DRAFT_EXISTS, this.id);
      },
    },
  },
};
function printOutput(outcomes: TurnResult['outcomes']) {
  const totalProbability = outcomes.reduce((sum, o) => sum + o.probability, 0);

  console.table(
    outcomes
      .map(o => ({
        hp: o.state.hp,
        item: o.state.item,
        probability: `${(o.probability * 100).toFixed(2)}%`,
      }))
      .sort((a, b) => b.hp - a.hp)
  );

  console.log('Total Probability', totalProbability);
}

function printKoChance(outcomes: TurnResult['outcomes'], turn: number) {
  const koChance = outcomes.filter(o => o.state.hp === 0).reduce((sum, o) => sum + o.probability, 0);
  console.log(`Turn ${turn} KO: ${Math.round(koChance * 10000) / 100}%`);
}

function printBarChart(outcomes: TurnResult['outcomes'], options: {maxBarWidth?: number; binSize?: number; floatPoint?: number} = {}) {
  // Get max HP from first outcome
  const maxHp = outcomes.length > 0 ? outcomes[0].state.data.stats.hp : 0;
  const floatPoint = options.floatPoint ?? 1;
  // Set default binSize if not provided
  if (options.binSize === undefined) {
    options.binSize = Math.max(1, Math.round(maxHp / 100));
  }

  // Group outcomes by HP, summing probabilities
  const hpMap = new Map<number, number>();

  for (const outcome of outcomes) {
    const currentProb = hpMap.get(outcome.state.hp) || 0;
    hpMap.set(outcome.state.hp, currentProb + outcome.probability);
  }

  // Bin HP values and probabilities (0 always in its own bin)
  const binMap = new Map<number, number>();

  for (const [hp, prob] of hpMap.entries()) {
    let binMinValue: number;
    if (hp === 0) {
      binMinValue = 0;
    } else {
      binMinValue = 1 + Math.floor((hp - 1) / options.binSize) * options.binSize;
    }
    const currentProb = binMap.get(binMinValue) || 0;
    binMap.set(binMinValue, currentProb + prob);
  }

  // Create data from maxHp down to 0, respecting bin size (0 always in its own bin)
  const hpData: Array<{binMin: number; probability: number}> = [];

  // Add bins from maxHp down to 1
  for (let hp = maxHp; hp >= 1; hp -= options.binSize) {
    const binMinValue = 1 + Math.floor((hp - 1) / options.binSize) * options.binSize;
    if (!hpData.some(d => d.binMin === binMinValue)) {
      hpData.push({
        binMin: binMinValue,
        probability: binMap.get(binMinValue) || 0,
      });
    }
  }

  // Add 0 bin at the end
  hpData.push({
    binMin: 0,
    probability: binMap.get(0) || 0,
  });

  // Find max probability for scaling
  const maxProb = Math.max(...hpData.map(d => d.probability), 0);

  console.log('\n=== HP Distribution ===\n');

  for (const data of hpData) {
    const percentage = (data.probability * 100).toFixed(floatPoint);
    const barLength = maxProb > 0 ? Math.round((data.probability / maxProb) * (options.maxBarWidth ?? 50)) : 0;
    const bar = '█'.repeat(barLength);
    let binLabel: string;
    if (data.binMin === 0) {
      binLabel = '0';
    } else if (options.binSize === 1) {
      binLabel = data.binMin.toString();
    } else {
      binLabel = `${data.binMin}`;
    }
    const hpStr = binLabel.padStart(3, ' ');

    console.log(`${hpStr} HP │${bar} ${percentage}%`);
  }

  const totalProb = hpData.reduce((sum, d) => sum + d.probability, 0);
  console.log(`\nTotal Probability: ${(totalProb * 100).toFixed(floatPoint)}%`);
}

function exportTreeToGraphviz(tree: StateTree<DMG.PokemonState>) {
  const graphvizCode = tree.toGraphviz(Infinity, s => `HP: ${s.hp}` + (s.item ? '\n' + s.item : ''));
  const filePath = 'turn-tree.dot';

  fs.writeFileSync(filePath, graphvizCode);
  console.log(`\nGraphviz output saved to: ${filePath}`);
  console.log(`To generate a PNG: dot -Tpng ${filePath} -o turn-tree.png`);
  console.log(`To generate an SVG: dot -Tsvg ${filePath} -o turn-tree.svg`);
}

function printHPStatistics(outcomes: TurnResult['outcomes']) {
  const maxTotalHP = outcomes.reduce((t, o) => Math.max(o.state.data.stats.hp, t), 0);

  // Sort outcomes by HP for percentile calculations
  const sortedOutcomes = [...outcomes].sort((a, b) => a.state.hp - b.state.hp);

  // Calculate min and max HP
  const minHP = Math.min(...outcomes.map(o => o.state.hp));
  const maxHP = Math.max(...outcomes.map(o => o.state.hp));

  // Calculate weighted mean HP
  const meanHP = outcomes.reduce((sum, o) => sum + o.state.hp * o.probability, 0);

  // Calculate weighted median and quartiles
  let cumulativeProb = 0;
  let medianHP = 0;
  let q1HP = 0;
  let q3HP = 0;

  for (const outcome of sortedOutcomes) {
    cumulativeProb += outcome.probability;

    if (q1HP === 0 && cumulativeProb >= 0.25) {
      q1HP = outcome.state.hp;
    }
    if (medianHP === 0 && cumulativeProb >= 0.5) {
      medianHP = outcome.state.hp;
    }
    if (q3HP === 0 && cumulativeProb >= 0.75) {
      q3HP = outcome.state.hp;
    }

    if (cumulativeProb >= 0.75) break;
  }

  // Calculate weighted standard deviation
  const variance = outcomes.reduce((sum, o) => sum + o.probability * Math.pow(o.state.hp - meanHP, 2), 0);
  const stdDev = Math.sqrt(variance);

  // Calculate KO chance (sum probabilities, not just count outcomes)
  const koChance = outcomes.filter(o => o.state.hp === 0).reduce((sum, o) => sum + o.probability, 0) * 100;

  console.log('=== Remaining HP Statistics ===');
  console.log(`Total HP: ${maxTotalHP}`);
  console.log(`HP Range: ${minHP}-${maxHP} (${((minHP / maxTotalHP) * 100).toFixed(1)}%-${((maxHP / maxTotalHP) * 100).toFixed(1)}%)`);
  console.log(`Mean HP: ${meanHP.toFixed(2)}`);
  console.log(`Median HP: ${medianHP.toFixed(2)}`);
  console.log(`Std Dev: ${stdDev.toFixed(2)}`);
  console.log(`Q1 (25th %ile): ${q1HP}`);
  console.log(`Q3 (75th %ile): ${q3HP}`);
  console.log(`KO Chance: ${koChance.toFixed(2)}%`);
}

function example1() {
  const gen = gens.get(9);

  const attacker = new DMG.Pokemon(gen, 'Gengar');
  const target = new DMG.Pokemon(gen, 'Deoxys-Defense', {item: 'Sitrus Berry'});
  const move = new DMG.Move(gen, 'Poltergeist', {crit: false});

  const result = computeTurn(attacker, target, move);

  console.log(`Outcomes: ${result.outcomes.length}`);
  console.log(`Total prob: ${result.outcomes.reduce((s, o) => s + o.probability, 0).toFixed(4)}`);

  const withItem = result.outcomes.filter(o => o.state.item !== null);
  console.log(`With item: ${withItem.length}, total prob: ${withItem.reduce((s, o) => s + o.probability, 0).toFixed(4)}`);

  const withoutItem = result.outcomes.filter(o => o.state.item === null);
  console.log(`Without item: ${withoutItem.length}, total prob: ${withoutItem.reduce((s, o) => s + o.probability, 0).toFixed(4)}`);
  printOutput(result.outcomes);

  // ┌─────────┬─────┬───────────────┬─────────────┐
  // │ (index) │ hp  │ item          │ probability │
  // ├─────────┼─────┼───────────────┼─────────────┤
  // │ 0       │ 241 │ 'sitrusberry' │ '10%'       │
  // │ 1       │ 127 │ 'sitrusberry' │ '11.25%'    │
  // │ 2       │ 125 │ 'sitrusberry' │ '11.25%'    │
  // │ 3       │ 121 │ 'sitrusberry' │ '16.875%'   │
  // │ 4       │ 119 │ 'sitrusberry' │ '11.25%'    │
  // │ 5       │ 115 │ 'sitrusberry' │ '11.25%'    │
  // │ 6       │ 113 │ 'sitrusberry' │ '11.25%'    │
  // │ 7       │ 109 │ 'sitrusberry' │ '11.25%'    │
  // │ 8       │ 107 │ 'sitrusberry' │ '5.625%'    │
  // └─────────┴─────┴───────────────┴─────────────┘
}

function example2() {
  const gen = gens.get(9);

  const attacker = new DMG.Pokemon(gen, 'Gengar');
  const target = new DMG.Pokemon(gen, 'Deoxys-Defense', {item: 'Sitrus Berry'});
  const move = new DMG.Move(gen, 'Poltergeist');

  // Turn 1
  let result = computeTurn(attacker, target, move);
  let tree = result.tree;
  let outcomes = result.outcomes;

  // console.log('=== After Turn 1 ===');
  // console.table(
  //   outcomes
  //     .map(o => ({
  //       hp: o.state.hp,
  //       item: o.state.item,
  //       probability: `${(o.probability * 100).toFixed(3)}%`,
  //     }))
  //     .sort((a, b) => b.hp - a.hp)
  // );

  // Turn 2
  result = computeTurn(attacker, target, move, tree, outcomes);
  tree = result.tree;
  outcomes = result.outcomes;

  // console.log('\n=== After Turn 2 ===');
  // tree.visualize(Infinity, s => `${s.hp}|${s.item}`);

  exportTreeToGraphviz(tree);

  printOutput(outcomes);

  // ┌─────────┬─────┬───────────────┬─────────────┐
  // │ (index) │ hp  │ item          │ probability │
  // ├─────────┼─────┼───────────────┼─────────────┤
  // │ 0       │ 241 │ 'sitrusberry' │ '1.00%'     │
  // │ 1       │ 179 │ null          │ '11.86%'    │
  // │ 2       │ 175 │ null          │ '11.86%'    │
  // │ 3       │ 173 │ null          │ '11.86%'    │
  // │ 4       │ 169 │ null          │ '11.86%'    │
  // │ 5       │ 167 │ null          │ '5.93%'     │
  // │ 6       │ 133 │ null          │ '0.26%'     │
  // │ 7       │ 131 │ null          │ '0.26%'     │
  // │ 8       │ 127 │ 'sitrusberry' │ '2.16%'     │
  // │ 9       │ 127 │ null          │ '0.52%'     │
  // │ 10      │ 125 │ 'sitrusberry' │ '2.16%'     │
  // │ 11      │ 125 │ null          │ '0.26%'     │
  // │ 12      │ 121 │ 'sitrusberry' │ '3.23%'     │
  // │ 13      │ 121 │ null          │ '0.52%'     │
  // │ 14      │ 119 │ null          │ '0.26%'     │
  // │ 15      │ 115 │ null          │ '0.52%'     │
  // │ 16      │ 113 │ null          │ '0.26%'     │
  // │ 17      │ 109 │ null          │ '0.52%'     │
  // │ 18      │ 107 │ null          │ '0.26%'     │
  // │ 19      │ 103 │ null          │ '0.26%'     │
  // │ 20      │ 101 │ null          │ '0.26%'     │
  // │ 21      │ 73  │ null          │ '1.16%'     │
  // │ 22      │ 71  │ null          │ '2.32%'     │
  // │ 23      │ 69  │ null          │ '1.16%'     │
  // │ 24      │ 67  │ null          │ '3.49%'     │
  // │ 25      │ 65  │ null          │ '4.65%'     │
  // │ 26      │ 63  │ null          │ '1.16%'     │
  // │ 27      │ 61  │ null          │ '3.78%'     │
  // │ 28      │ 0   │ 'sitrusberry' │ '16.24%'    │
  // └─────────┴─────┴───────────────┴─────────────┘
}

function example3() {
  const gen = gens.get(9);

  const attacker = new DMG.Pokemon(gen, 'Bisharp');
  const target = new DMG.Pokemon(gen, 'Deoxys-Defense');
  const move = new DMG.Move(gen, 'Iron Head');

  let result = computeTurn(attacker, target, move);
  result = computeTurn(attacker, target, move, result.tree, result.outcomes);
  result = computeTurn(attacker, target, move, result.tree, result.outcomes);

  console.table(
    result.outcomes
      .map(o => ({
        hp: o.state.hp,
        item: o.state.item,
        probability: `${(o.probability * 100).toFixed(5)}%`,
      }))
      .sort((a, b) => b.hp - a.hp),
    ['hp', 'probability', 'item']
  );

  // ┌─────────┬─────┬─────────────┬───────────┐
  // │ (index) │ hp  │ probability │ item      │
  // ├─────────┼─────┼─────────────┼───────────┤
  // │ 0       │ 103 │ '0.36%'     │ undefined │
  // │ 1       │ 102 │ '1.44%'     │ undefined │
  // │ 2       │ 101 │ '1.44%'     │ undefined │
  // │ 3       │ 100 │ '1.44%'     │ undefined │
  // │ 4       │ 99  │ '3.59%'     │ undefined │
  // │ 5       │ 98  │ '1.44%'     │ undefined │
  // │ 6       │ 97  │ '2.87%'     │ undefined │
  // │ 7       │ 96  │ '5.74%'     │ undefined │
  // │ 8       │ 95  │ '3.23%'     │ undefined │
  // │ 9       │ 94  │ '4.31%'     │ undefined │
  // │ 10      │ 93  │ '8.61%'     │ undefined │
  // │ 11      │ 92  │ '4.31%'     │ undefined │
  // │ 12      │ 91  │ '5.02%'     │ undefined │
  // │ 13      │ 90  │ '9.33%'     │ undefined │
  // │ 14      │ 89  │ '4.31%'     │ undefined │
  // │ 15      │ 88  │ '4.31%'     │ undefined │
  // │ 16      │ 87  │ '7.89%'     │ undefined │
  // │ 17      │ 86  │ '3.59%'     │ undefined │
  // │ 18      │ 85  │ '2.87%'     │ undefined │
  // │ 19      │ 84  │ '5.74%'     │ undefined │
  // │ 20      │ 83  │ '2.87%'     │ undefined │
  // │ 21      │ 82  │ '1.44%'     │ undefined │
  // │ 22      │ 81  │ '2.87%'     │ undefined │
  // │ 23      │ 80  │ '1.44%'     │ undefined │
  // │ 24      │ 79  │ '0.36%'     │ undefined │
  // │ 25      │ 78  │ '0.72%'     │ undefined │
  // │ 26      │ 77  │ '0.36%'     │ undefined │
  // │ 27      │ 69  │ '0.03%'     │ undefined │
  // │ 28      │ 68  │ '0.06%'     │ undefined │
  // │ 29      │ 67  │ '0.03%'     │ undefined │
  // │ 30      │ 66  │ '0.16%'     │ undefined │
  // │ 31      │ 65  │ '0.09%'     │ undefined │
  // │ 32      │ 64  │ '0.12%'     │ undefined │
  // │ 33      │ 63  │ '0.31%'     │ undefined │
  // │ 34      │ 62  │ '0.16%'     │ undefined │
  // │ 35      │ 61  │ '0.22%'     │ undefined │
  // │ 36      │ 60  │ '0.41%'     │ undefined │
  // │ 37      │ 59  │ '0.22%'     │ undefined │
  // │ 38      │ 58  │ '0.28%'     │ undefined │
  // │ 39      │ 57  │ '0.56%'     │ undefined │
  // │ 40      │ 56  │ '0.31%'     │ undefined │
  // │ 41      │ 55  │ '0.31%'     │ undefined │
  // │ 42      │ 54  │ '0.62%'     │ undefined │
  // │ 43      │ 53  │ '0.28%'     │ undefined │
  // │ 44      │ 52  │ '0.28%'     │ undefined │
  // │ 45      │ 51  │ '0.59%'     │ undefined │
  // │ 46      │ 50  │ '0.31%'     │ undefined │
  // │ 47      │ 49  │ '0.25%'     │ undefined │
  // │ 48      │ 48  │ '0.53%'     │ undefined │
  // │ 49      │ 47  │ '0.25%'     │ undefined │
  // │ 50      │ 46  │ '0.22%'     │ undefined │
  // │ 51      │ 45  │ '0.37%'     │ undefined │
  // │ 52      │ 44  │ '0.19%'     │ undefined │
  // │ 53      │ 43  │ '0.16%'     │ undefined │
  // │ 54      │ 42  │ '0.25%'     │ undefined │
  // │ 55      │ 41  │ '0.09%'     │ undefined │
  // │ 56      │ 40  │ '0.09%'     │ undefined │
  // │ 57      │ 39  │ '0.12%'     │ undefined │
  // │ 58      │ 38  │ '0.03%'     │ undefined │
  // │ 59      │ 37  │ '0.03%'     │ undefined │
  // │ 60      │ 36  │ '0.03%'     │ undefined │
  // │ 61      │ 35  │ '0.00%'     │ undefined │
  // │ 62      │ 33  │ '0.00%'     │ undefined │
  // │ 63      │ 32  │ '0.00%'     │ undefined │
  // │ 64      │ 31  │ '0.00%'     │ undefined │
  // │ 65      │ 30  │ '0.00%'     │ undefined │
  // │ 66      │ 29  │ '0.00%'     │ undefined │
  // │ 67      │ 28  │ '0.00%'     │ undefined │
  // │ 68      │ 27  │ '0.01%'     │ undefined │
  // │ 69      │ 26  │ '0.00%'     │ undefined │
  // │ 70      │ 25  │ '0.00%'     │ undefined │
  // │ 71      │ 24  │ '0.01%'     │ undefined │
  // │ 72      │ 23  │ '0.00%'     │ undefined │
  // │ 73      │ 22  │ '0.00%'     │ undefined │
  // │ 74      │ 21  │ '0.01%'     │ undefined │
  // │ 75      │ 20  │ '0.01%'     │ undefined │
  // │ 76      │ 19  │ '0.00%'     │ undefined │
  // │ 77      │ 18  │ '0.01%'     │ undefined │
  // │ 78      │ 17  │ '0.01%'     │ undefined │
  // │ 79      │ 16  │ '0.01%'     │ undefined │
  // │ 80      │ 15  │ '0.01%'     │ undefined │
  // │ 81      │ 14  │ '0.01%'     │ undefined │
  // │ 82      │ 13  │ '0.01%'     │ undefined │
  // │ 83      │ 12  │ '0.01%'     │ undefined │
  // │ 84      │ 11  │ '0.01%'     │ undefined │
  // │ 85      │ 10  │ '0.01%'     │ undefined │
  // │ 86      │ 9   │ '0.01%'     │ undefined │
  // │ 87      │ 8   │ '0.00%'     │ undefined │
  // │ 88      │ 7   │ '0.00%'     │ undefined │
  // │ 89      │ 6   │ '0.01%'     │ undefined │
  // │ 90      │ 5   │ '0.00%'     │ undefined │
  // │ 91      │ 4   │ '0.00%'     │ undefined │
  // │ 92      │ 3   │ '0.01%'     │ undefined │
  // │ 93      │ 2   │ '0.00%'     │ undefined │
  // │ 94      │ 1   │ '0.00%'     │ undefined │
  // │ 95      │ 0   │ '0.01%'     │ undefined │
  // └─────────┴─────┴─────────────┴───────────┘
}

function example4() {
  const gen = gens.get(9);

  const attacker = new DMG.Pokemon(gen, 'Sneasel');
  const target = new DMG.Pokemon(gen, 'Deoxys-Defense', {item: 'Sitrus Berry'});
  const move = new DMG.Move(gen, 'Triple Kick', {crit: false, hits: 3});

  let turn = computeTurn(attacker, target, move);
  turn.tree.debugVisualize();
  printOutput(turn.outcomes);
  exportTreeToGraphviz(turn.tree);

  // ┌─────────┬─────┬───────────────┬─────────────┐
  // │ (index) │ hp  │ item          │ probability │
  // ├─────────┼─────┼───────────────┼─────────────┤
  // │ 0       │ 241 │ 'sitrusberry' │ '10.00%'    │
  // │ 1       │ 239 │ 'sitrusberry' │ '0.56%'     │
  // │ 2       │ 238 │ 'sitrusberry' │ '8.44%'     │
  // │ 3       │ 234 │ 'sitrusberry' │ '0.47%'     │
  // │ 4       │ 233 │ 'sitrusberry' │ '7.15%'     │
  // │ 5       │ 232 │ 'sitrusberry' │ '0.47%'     │
  // │ 6       │ 227 │ 'sitrusberry' │ '2.67%'     │
  // │ 7       │ 226 │ 'sitrusberry' │ '41.82%'    │
  // │ 8       │ 225 │ 'sitrusberry' │ '26.80%'    │
  // │ 9       │ 224 │ 'sitrusberry' │ '1.60%'     │
  // └─────────┴─────┴───────────────┴─────────────┘
}

function example5() {
  const gen = gens.get(9);

  const attacker = new DMG.Pokemon(gen, 'Sunkern');
  const target = new DMG.Pokemon(gen, 'Deoxys-Defense', {item: 'Sitrus Berry'});
  const move = new DMG.Move(gen, 'Rock Blast');

  // console.log(move);

  let turn = computeTurn(attacker, target, move);
  // turn.tree.debugVisualize();
  printOutput(turn.outcomes);
  printBarChart(turn.outcomes);
  exportTreeToGraphviz(turn.tree);
}

function example6() {
  const gen = gens.get(9);

  const attacker = new DMG.Pokemon(gen, 'Sunkern');
  const target = new DMG.Pokemon(gen, 'Deoxys-Defense', {item: 'Sitrus Berry'});
  const move = new DMG.Move(gen, 'Population Bomb', {crit: false});

  // console.log(move);

  let turn = computeTurn(attacker, target, move);
  // turn.tree.debugVisualize();
  printOutput(turn.outcomes);
  printBarChart(turn.outcomes);
  exportTreeToGraphviz(turn.tree);
}

function example7() {
  const gen = Rulesets['Gen 9']['National Dex'].ruleset;

  const attacker = new DMG.Pokemon(gen, 'Mewtwo-Mega-X', {level: 50, nature: 'Jolly', evs: {atk: 252, spe: 252}, item: 'Scope Lens'});
  const target = new DMG.Pokemon(gen, 'Zacian', {level: 50});
  const move = new DMG.Move(gen, 'Poison Jab');

  const TURNS = 1;
  let turnResult: TurnResult | {outcomes: undefined; tree: undefined} = {outcomes: undefined, tree: undefined};

  for (let turn = 0; turn < TURNS; turn++) {
    turnResult = computeTurn(attacker, target, move, turnResult.tree, turnResult.outcomes);
  }

  // turn.tree.debugVisualize();
  if (turnResult.outcomes && turnResult.tree) {
    printOutput(turnResult.outcomes);
    printBarChart(turnResult.outcomes);
    exportTreeToGraphviz(turnResult.tree);
    printHPStatistics(turnResult.outcomes);
  }
}

example7();

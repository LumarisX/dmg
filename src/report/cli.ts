import * as fs from 'fs';
import * as path from 'path';

import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {Analysis, analyse} from './analyse';
import {renderReport} from './html';
import {SCENARIOS, Scenario} from './scenarios';

function matches(scenario: Scenario, filters: string[]): boolean {
  if (!filters.length) return true;
  const haystack = `${scenario.name} ${scenario.group} ${scenario.move}`.toLowerCase();
  return filters.some(filter => haystack.includes(filter.toLowerCase()));
}

function line(analysis: Analysis): string {
  const name = analysis.scenario.name.padEnd(32);
  const elapsed = `${analysis.elapsedMs.toFixed(0)}ms`.padStart(7);
  if (!analysis.supported) return `${name} ${elapsed}  refused: ${analysis.reasons?.join(', ')}`;
  const route = analysis.turns!.resolves === 1 ? 'hp   ' : 'state';
  return `${name} ${elapsed}  ${route}  ${String(analysis.distinctOutcomes).padStart(4)} outcomes  ${analysis.turns!.summary}`;
}

function main(): void {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const out = outIndex === -1 ? 'report.html' : args[outIndex + 1];
  const filters = args.filter((arg, index) => !arg.startsWith('--') && index !== outIndex + 1);

  const gens = new Generations(Dex as never);
  const selected = SCENARIOS.filter(scenario => matches(scenario, filters));

  if (!selected.length) {
    process.stdout.write(`no scenarios matched ${filters.join(', ')}\n`);
    process.exitCode = 1;
    return;
  }

  const analyses: Analysis[] = [];
  for (const scenario of selected) {
    const analysis = analyse(gens, scenario);
    analyses.push(analysis);
    process.stdout.write(`${line(analysis)}\n`);
  }

  const destination = path.resolve(out);
  fs.writeFileSync(destination, renderReport(analyses, new Date().toISOString()));
  process.stdout.write(`\nwrote ${destination}\n`);
}

main();

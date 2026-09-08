import {LabelCounts} from '../distribution';
import {Analysis} from './analyse';

const WIDTH = 720;
const HEIGHT = 200;
const PAD = {top: 14, right: 16, bottom: 28, left: 52};

function escape(text: string): string {
  return text.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c] as string);
}

function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function axes(yLabel: string, xLabel: string): string {
  const gridlines = [0, 0.25, 0.5, 0.75, 1]
    .map(fraction => {
      const y = PAD.top + (1 - fraction) * (HEIGHT - PAD.top - PAD.bottom);
      return `<line class="grid" x1="${PAD.left}" y1="${y}" x2="${WIDTH - PAD.right}" y2="${y}" />
        <text class="tick" x="${PAD.left - 8}" y="${y + 4}" text-anchor="end">${(fraction * 100).toFixed(0)}%</text>`;
    })
    .join('');
  return `${gridlines}
    <text class="axis" x="${PAD.left}" y="${PAD.top - 4}">${escape(yLabel)}</text>
    <text class="axis" x="${WIDTH - PAD.right}" y="${HEIGHT - 6}" text-anchor="end">${escape(xLabel)}</text>`;
}

function barChart(
  bars: {label: string; value: number; muted?: boolean}[],
  yLabel: string,
  xLabel: string,
  scaleMax = 1
): string {
  if (!bars.length) return '<p class="empty">no data</p>';
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotWidth / bars.length;

  const rects = bars
    .map((bar, index) => {
      const height = Math.max(0, (bar.value / scaleMax) * plotHeight);
      const x = PAD.left + index * slot + slot * 0.15;
      const y = PAD.top + plotHeight - height;
      const label = bar.value > 0.005 ? `<text class="value" x="${x + slot * 0.35}" y="${y - 4}" text-anchor="middle">${pct(bar.value)}</text>` : '';
      return `<rect class="${bar.muted ? 'bar muted' : 'bar'}" x="${x}" y="${y}" width="${slot * 0.7}" height="${height}" rx="2"><title>${escape(bar.label)}: ${pct(bar.value, 2)}</title></rect>
        ${label}
        <text class="tick" x="${x + slot * 0.35}" y="${HEIGHT - PAD.bottom + 14}" text-anchor="middle">${escape(bar.label)}</text>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img">${axes(yLabel, xLabel)}${rects}</svg>`;
}

function lineChart(
  points: {x: number; y: number}[],
  yLabel: string,
  xLabel: string,
  markers: {x: number; label: string}[] = []
): string {
  if (points.length < 2) return '<p class="empty">no data</p>';
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const minX = points[0].x;
  const maxX = points[points.length - 1].x || 1;
  const spanX = maxX - minX || 1;

  const toX = (x: number) => PAD.left + ((x - minX) / spanX) * plotWidth;
  const toY = (y: number) => PAD.top + (1 - y) * plotHeight;

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`).join(' ');
  const rules = markers
    .filter(marker => marker.x >= minX && marker.x <= maxX)
    .map(
      marker => `<line class="marker" x1="${toX(marker.x)}" y1="${PAD.top}" x2="${toX(marker.x)}" y2="${PAD.top + plotHeight}" />
        <text class="marker-label" x="${toX(marker.x) + 4}" y="${PAD.top + 10}">${escape(marker.label)}</text>`
    )
    .join('');

  const xTicks = [0, 0.25, 0.5, 0.75, 1]
    .map(fraction => {
      const value = minX + fraction * spanX;
      return `<text class="tick" x="${toX(value)}" y="${HEIGHT - PAD.bottom + 14}" text-anchor="middle">${Math.round(value)}</text>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img">${axes(yLabel, xLabel)}${rules}${xTicks}<path class="line" d="${path}" /></svg>`;
}

function detailRows(analysis: Analysis): string {
  const rows: [string, string][] = [
    ['move', analysis.scenario.move],
    ['attacker', describeSide(analysis.scenario.attacker)],
    ['defender', `${describeSide(analysis.scenario.defender)} — ${analysis.startingHp}/${analysis.maxhp} HP`],
  ];
  if (analysis.scenario.weather) rows.push(['weather', analysis.scenario.weather]);
  if (analysis.scenario.terrain) rows.push(['terrain', analysis.scenario.terrain]);
  if (analysis.damage) {
    rows.push([
      'damage',
      `${analysis.damage.min}–${analysis.damage.max} (${((analysis.damage.min / analysis.maxhp) * 100).toFixed(1)}%–${((analysis.damage.max / analysis.maxhp) * 100).toFixed(1)}%) · expected ${analysis.damage.expected.toFixed(1)}`,
    ]);
  }
  if (analysis.distinctOutcomes !== undefined) {
    rows.push([
      'distribution',
      `${analysis.distinctOutcomes} distinct outcomes · denominator ${analysis.totalWeight?.toExponential(3)} · ${analysis.exact ? 'exact' : 'past the exact horizon (float)'}`,
    ]);
  }
  if (analysis.turns) {
    rows.push([
      'projection',
      `${analysis.turns.resolves} resolve(s) — ${analysis.turns.resolves === 1 ? 'HP projection' : 'full state space'}${analysis.turns.unexpanded > 1e-9 ? ` · ${pct(analysis.turns.unexpanded)} never advanced` : ''}`,
    ]);
  }
  rows.push(['elapsed', `${analysis.elapsedMs.toFixed(1)}ms`]);

  return rows.map(([key, value]) => `<tr><th>${escape(key)}</th><td>${escape(value)}</td></tr>`).join('');
}

function describeSide(side: {species: string; nature?: string; evs?: {[k: string]: number}; ability?: string; item?: string; boosts?: {[k: string]: number}; status?: string; terastallized?: boolean; teraType?: string}): string {
  const bits = [side.species];
  if (side.nature) bits.push(side.nature);
  if (side.evs) bits.push(Object.entries(side.evs).map(([stat, value]) => `${value} ${stat}`).join('/'));
  if (side.ability) bits.push(`ability: ${side.ability}`);
  if (side.item) bits.push(`item: ${side.item}`);
  if (side.boosts) bits.push(Object.entries(side.boosts).map(([stat, value]) => `${value > 0 ? '+' : ''}${value} ${stat}`).join('/'));
  if (side.status) bits.push(side.status);
  if (side.terastallized) bits.push(`tera ${side.teraType ?? ''}`.trim());
  return bits.join(', ');
}

function critsTable(crits: {[crits: number]: number} | undefined, total: number | undefined): string {
  if (!crits || !total) return '';
  const entries = Object.keys(crits)
    .map(Number)
    .sort((a, b) => a - b)
    .filter(count => crits[count] > 0);
  if (!entries.length) return '';
  const cells = entries
    .map(count => `<tr><th>${count} crit${count === 1 ? '' : 's'}</th><td>${pct(crits[count] / total, 3)}</td></tr>`)
    .join('');
  return `<h4>Critical hits</h4><table class="kv">${cells}</table>`;
}

function moveDataTable(moveData: LabelCounts | undefined, total: number | undefined): string {
  if (!moveData || !total) return '';
  const entries = Object.keys(moveData).filter(label => moveData[label] > 0);
  if (!entries.length) return '';
  const cells = entries
    .map(label => `<tr><th>${escape(label)}</th><td>${pct(moveData[label] / total, 3)}</td></tr>`)
    .join('');
  return `<h4>Move data</h4><table class="kv">${cells}</table>`;
}

function section(analysis: Analysis): string {
  const head = `<header><h2>${escape(analysis.scenario.name)}</h2>
    <span class="group">${escape(analysis.scenario.group)}</span>
    ${analysis.scenario.note ? `<p class="note">${escape(analysis.scenario.note)}</p>` : ''}</header>
    <table class="kv">${detailRows(analysis)}</table>`;

  if (!analysis.supported) {
    return `<section class="card refused">${head}
      <h4>Refused</h4>
      <ul>${(analysis.reasons ?? []).map(reason => `<li>${escape(reason)}</li>`).join('')}</ul>
    </section>`;
  }

  const damagePoints = analysis.damage!.points;
  const peak = damagePoints.reduce((best, point) => Math.max(best, point.probability), 0);

  const koBars = analysis.turns!.exactlyOn.map((probability, index) => ({
    label: `${index + 1}`,
    value: probability,
  }));
  if (analysis.turns!.stillStanding > 1e-9) {
    koBars.push({label: 'none', value: analysis.turns!.stillStanding, muted: true} as never);
  }

  const branches = analysis
    .branches!.map(
    branch => `<div><h5>${escape(branch.label)}</h5><ul>${branch.entries.map(entry => `<li>${escape(entry)}</li>`).join('')}</ul></div>`
  )
    .join('');

  const worstOutcomes = analysis.outcomes!.slice(-8).reverse();

  return `<section class="card">${head}
    <p class="headline">${escape(analysis.turns!.summary)}</p>

    <h4>Damage distribution</h4>
    <p class="caption">Probability mass per damage roll. ${analysis.maxhp} HP is lethal.</p>
    ${lineChart(
    damagePoints.map(point => ({x: point.damage, y: peak ? point.probability / peak : 0})),
    `probability (peak ${pct(peak, 2)})`,
    'damage',
    [{x: analysis.maxhp, label: 'KO'}]
  )}

    <h4>Survival function</h4>
    <p class="caption">P(damage ≥ x).</p>
    ${lineChart(
    analysis.survival!.map(point => ({x: point.damage, y: point.probability})),
    'probability',
    'damage ≥ x',
    [{x: analysis.maxhp, label: 'KO'}]
  )}

    <h4>Turns to knock out</h4>
    <p class="caption">Probability the target faints on exactly that turn, repeating the same move. Grey "none" is the mass still standing at the horizon.</p>
    ${barChart(koBars, 'probability', 'turn')}

    <h4>Cumulative knockout chance</h4>
    ${barChart(
    analysis.turns!.cumulative.map((chance, index) => ({label: `${index + 1}`, value: chance})),
    'cumulative',
    'by turn'
  )}

    <div class="columns">
      <div><h4>Branches</h4><div class="branches">${branches}</div></div>
      <div>${critsTable(analysis.crits, analysis.totalWeight)}
      ${moveDataTable(analysis.moveData, analysis.totalWeight)}</div>
    </div>

    <h4>Heaviest outcomes</h4>
    <table class="outcomes">
      <thead><tr><th>probability</th><th>damage</th><th>HP left</th><th>status</th></tr></thead>
      <tbody>${worstOutcomes
    .map(
      outcome => `<tr class="${outcome.fainted ? 'fainted' : ''}"><td>${pct(outcome.probability, 3)}</td><td>${outcome.damage}</td><td>${outcome.fainted ? 'fainted' : outcome.hp}</td><td>${escape(outcome.status ?? '—')}</td></tr>`
    )
    .join('')}</tbody>
    </table>
  </section>`;
}

export function renderReport(analyses: Analysis[], generatedAt: string): string {
  const groups = [...new Set(analyses.map(a => a.scenario.group))];
  const nav = groups
    .map(
      group => `<li><strong>${escape(group)}</strong><ul>${analyses
        .filter(a => a.scenario.group === group)
        .map(a => `<li><a href="#${slug(a.scenario.name)}">${escape(a.scenario.name)}</a></li>`)
        .join('')}</ul></li>`
    )
    .join('');

  const sections = analyses
    .map(analysis => `<a id="${slug(analysis.scenario.name)}"></a>${section(analysis)}`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>@pdz/calc report</title>
<style>
  :root { color-scheme: light dark; --fg: #16181d; --dim: #5b616e; --line: #d8dce3; --bg: #fbfbfc; --card: #fff; --series: #1f6feb; --muted: #6e7681; --danger: #c9372c; }
  @media (prefers-color-scheme: dark) {
    :root { --fg: #e6e8ec; --dim: #9aa3b2; --line: #2b303a; --bg: #14161a; --card: #1a1d23; --series: #58a6ff; --muted: #8b949e; --danger: #ff7b72; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
  .wrap { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 24px; max-width: 1100px; margin: 0 auto; padding: 24px; }
  nav { position: sticky; top: 24px; align-self: start; font-size: 13px; }
  nav ul { list-style: none; margin: 0; padding: 0 0 0 8px; }
  nav > ul { padding: 0; }
  nav li { margin: 2px 0; }
  nav strong { display: block; margin-top: 12px; color: var(--dim); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
  nav a { color: var(--fg); text-decoration: none; }
  nav a:hover { text-decoration: underline; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .lede { color: var(--dim); margin: 0 0 20px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 18px; margin-bottom: 20px; }
  .card.refused { border-color: var(--danger); }
  .card h2 { font-size: 17px; margin: 0; display: inline-block; }
  .group { margin-left: 8px; font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: .06em; }
  .note { color: var(--dim); margin: 4px 0 12px; }
  .headline { font-weight: 600; margin: 12px 0; }
  h4 { font-size: 13px; margin: 20px 0 2px; }
  h5 { font-size: 12px; margin: 0 0 4px; color: var(--dim); }
  .caption { color: var(--dim); font-size: 12px; margin: 0 0 6px; }
  .empty { color: var(--dim); font-style: italic; }
  table { border-collapse: collapse; font-size: 13px; }
  table.kv th { text-align: left; font-weight: 500; color: var(--dim); padding: 2px 12px 2px 0; vertical-align: top; white-space: nowrap; }
  table.kv td { padding: 2px 0; }
  table.outcomes { width: 100%; margin-top: 4px; }
  table.outcomes th { text-align: left; color: var(--dim); font-weight: 500; border-bottom: 1px solid var(--line); padding: 4px 8px 4px 0; }
  table.outcomes td { padding: 3px 8px 3px 0; border-bottom: 1px solid var(--line); }
  tr.fainted td { color: var(--danger); }
  .columns { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; align-items: start; }
  .branches { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .branches ul { margin: 0; padding-left: 16px; font-size: 12px; }
  svg { width: 100%; height: auto; display: block; }
  .grid { stroke: var(--line); stroke-width: 1; }
  .tick, .axis, .value, .marker-label { fill: var(--dim); font-size: 10px; }
  .value { fill: var(--fg); }
  .bar { fill: var(--series); }
  .bar.muted { fill: var(--muted); }
  .line { fill: none; stroke: var(--series); stroke-width: 2; }
  .marker { stroke: var(--danger); stroke-width: 1; stroke-dasharray: 4 3; }
  .marker-label { fill: var(--danger); }
</style>
</head>
<body>
<div class="wrap">
  <nav><ul>${nav}</ul></nav>
  <main>
    <h1>@pdz/calc report</h1>
    <p class="lede">${analyses.length} scenarios · generated ${escape(generatedAt)} · add cases in <code>src/report/scenarios.ts</code></p>
    ${sections}
  </main>
</div>
</body>
</html>`;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

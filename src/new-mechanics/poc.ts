import {count} from 'console';
import {DAG} from './dag';
import {EventSpace} from './event-space';
import {Dex} from '@pkmn/sim';
import {Move, Species} from '@pkmn/dex';
import {DMG} from './dmg';

type Pokemon = {
  name: string;
  item?: string | null;
  hp: number;
  readonly maxHp: number;
};

type Hit = {
  damage: number;
  isCrit: boolean;
  missed: boolean;
  failed: boolean;
};

function damageCalc() {}

function getHitOutcomes(move: DMG.Move, attacker: Pokemon, target: Pokemon) {
  const inital: Hit = {damage: 0, isCrit: false, missed: false, failed: false};
  const hitSpace = new EventSpace<Hit>(inital, v => {
    const key = v.damage.toString();
    if (v.isCrit) return key + '-crit';
    if (v.missed) return key + '-miss';
    return key;
  });

  // Split off miss chance using filter
  hitSpace.splitEventByFilter(e => true, {failed: target.item == null}, 1);

  // Split off miss chance using filter
  hitSpace.splitEventByFilter(e => !e.failed, {missed: true}, move.accuracy === true || move.alwaysHit ? 0 : (100 - move.accuracy) / 100);

  // Split crit from regular hits using filter
  hitSpace.splitEventByFilter(e => !e.failed && !e.missed, {isCrit: true}, move.critChance);

  // Distribute hit outcomes into damage rolls and crit rolls
  const damageRegular: {value: {damage: number}; weight: number}[] = [
    {value: {damage: 114}, weight: 2},
    {value: {damage: 116}, weight: 2},
    {value: {damage: 120}, weight: 3},
    {value: {damage: 122}, weight: 2},
    {value: {damage: 126}, weight: 2},
    {value: {damage: 128}, weight: 2},
    {value: {damage: 132}, weight: 2},
    {value: {damage: 134}, weight: 1},
  ];

  hitSpace.distributeEventByFilter(e => !e.failed && !e.missed && !e.isCrit, damageRegular);

  // Distribute crit damage outcomes
  const damageCrit: {value: {damage: number}; weight: number}[] = [
    {value: {damage: 168}, weight: 1},
    {value: {damage: 170}, weight: 1},
    {value: {damage: 174}, weight: 2},
    {value: {damage: 176}, weight: 1},
    {value: {damage: 180}, weight: 2},
    {value: {damage: 182}, weight: 1},
    {value: {damage: 186}, weight: 1},
    {value: {damage: 188}, weight: 1},
    {value: {damage: 192}, weight: 2},
    {value: {damage: 194}, weight: 1},
    {value: {damage: 198}, weight: 1},
    {value: {damage: 200}, weight: 1},
  ];

  hitSpace.distributeEventByFilter(e => !e.failed && !e.missed && e.isCrit, damageCrit);

  return hitSpace.getOutcomes();
}

function computeTurn(move: DMG.Move, attacker: EventSpace<Pokemon>, target: EventSpace<Pokemon>) {
  const attackerOutcomes = attacker.getOutcomes();
  const targetOutcomes = target.getOutcomes();

  const allHitOutcomes: Array<{value: Hit; probability: number}> = [];

  for (const aEvent of attackerOutcomes) {
    for (const tEvent of targetOutcomes) {
      const hitOutcomes = getHitOutcomes(move, aEvent.value, tEvent.value);

      const combinedProbability = aEvent.probability * tEvent.probability;
      for (const hit of hitOutcomes) {
        allHitOutcomes.push({
          value: hit.value,
          probability: hit.probability * combinedProbability,
        });
      }
    }
  }

  console.table(
    allHitOutcomes.map(o => ({
      ...o.value,
      probability: `${Math.round(o.probability * 1000) / 100}%`,
    }))
  );

  target.distributeEventByFilter(
    d => d.hp > 0,
    allHitOutcomes.map(o => ({
      value: (d: Pokemon) => ({
        hp: Math.max(d.hp - o.value.damage, 0),
      }),
      weight: o.probability,
    }))
  );

  target.splitEventByFilter(
    d => d.hp <= Math.floor(0.5 * d.maxHp) && d.item === 'Sitrus Berry',
    {hp: d => Math.min(d.hp + Math.floor(d.maxHp / 4), d.maxHp), item: null},
    1.0
  );
  const finalOutcomes = target.getOutcomes();

  console.table(
    finalOutcomes
      .map(o => ({
        ...o.value,
        probability: `${Math.round(o.probability * 100000) / 1000}%`,
      }))
      .sort((a, b) => b.hp - a.hp)
  );
}

export function calcPOC(attackerSpecies: DMG.Pokemon | Species, targetSpecies: DMG.Pokemon | Species, basemove: DMG.Move | Move) {
  const move = new DMG.Move(basemove, {crit: false, alwaysHit: true});
  const attacker: Pokemon = {name: 'Gengar', hp: 261, maxHp: 261};
  const target: Pokemon = {name: 'Deoxys-Defense', hp: 241, maxHp: 241, item: 'Sitrus Berry'};
  const attackerSpace = new EventSpace<Pokemon>(attacker, p => `${p.name}-${p.hp}` + (p.item ? `-${p.item}` : ''));
  const targetSpace = new EventSpace<Pokemon>(target, p => `${p.name}-${p.hp}` + (p.item ? `-${p.item}` : ''));

  computeTurn(move, attackerSpace, targetSpace);

  console.log(
    'Total Probability',
    targetSpace.getTotalProbability(t => t.item !== null)
  );
}

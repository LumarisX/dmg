import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/dex';
import {DMG} from './dmg';
import {computeTurn} from './poc';

const gens = new Generations(Dex);

function printOutput(target: DMG.Pokemon) {
  const finalOutcomes = target.states.getOutcomes();

  console.table(
    finalOutcomes
      .map(o => ({
        hp: o.value.hp,
        item: o.value.item,
        probability: `${Math.round(o.probability * 100000) / 1000}%`,
      }))
      .sort((a, b) => b.hp - a.hp)
  );

  console.log('Total Probability', target.states.getTotalProbability());
}

function printKoChance(target: DMG.Pokemon, turn: number) {
  console.log(`Turn ${turn} KO: ${Math.round(target.states.getTotalProbability(state => state.hp === 0) * 10000) / 100}%`);
}

function example1() {
  const gen = gens.get(9);

  const attacker = new DMG.Pokemon(gen, 'Gengar');
  const target = new DMG.Pokemon(gen, 'Deoxys-Defense', {item: 'Sitrus Berry'});
  const move = new DMG.Move(gen, 'Poltergeist', {crit: false, alwaysHit: true});

  if (!move || !attacker || !target) return;

  computeTurn(attacker, target, move);

  printOutput(target);

  // ┌─────────┬─────┬───────────────┬─────────────┐
  // │ (index) │ hp  │ item          │ probability │
  // ├─────────┼─────┼───────────────┼─────────────┤
  // │ 0       │ 241 │ 'sitrusberry' │ '10%'       │
  // │ 1       │ 179 │ null          │ '11.25%'    │
  // │ 2       │ 175 │ null          │ '11.25%'    │
  // │ 3       │ 173 │ null          │ '11.25%'    │
  // │ 4       │ 169 │ null          │ '11.25%'    │
  // │ 5       │ 167 │ null          │ '5.625%'    │
  // │ 6       │ 127 │ 'sitrusberry' │ '11.25%'    │
  // │ 7       │ 121 │ 'sitrusberry' │ '18.75%'    │
  // └─────────┴─────┴───────────────┴─────────────┘
}

function example2() {
  const gen = gens.get(9);

  const attacker = new DMG.Pokemon(gen, 'Gengar');
  const target = new DMG.Pokemon(gen, 'Deoxys-Defense', {item: 'Sitrus Berry'});
  const move = new DMG.Move(gen, 'Poltergeist', {crit: false, alwaysHit: true});

  if (!move || !attacker || !target) return;

  computeTurn(attacker, target, move);
  computeTurn(attacker, target, move);

  printOutput(target);

  // ┌─────────┬─────┬───────────────┬─────────────┐
  // │ (index) │ hp  │ item          │ probability │
  // ├─────────┼─────┼───────────────┼─────────────┤
  // │ 0       │ 179 │ null          │ '12.5%'     │
  // │ 1       │ 175 │ null          │ '12.5%'     │
  // │ 2       │ 173 │ null          │ '12.5%'     │
  // │ 3       │ 169 │ null          │ '12.5%'     │
  // │ 4       │ 167 │ null          │ '6.25%'     │
  // │ 5       │ 73  │ null          │ '1.563%'    │
  // │ 6       │ 71  │ null          │ '3.125%'    │
  // │ 7       │ 69  │ null          │ '1.563%'    │
  // │ 8       │ 67  │ null          │ '4.688%'    │
  // │ 9       │ 65  │ null          │ '6.25%'     │
  // │ 10      │ 63  │ null          │ '1.563%'    │
  // │ 11      │ 61  │ null          │ '5.078%'    │
  // │ 12      │ 0   │ 'sitrusberry' │ '19.922%'   │
  // └─────────┴─────┴───────────────┴─────────────┘
}

function example3() {
  const gen = gens.get(9);

  const attacker = new DMG.Pokemon(gen, 'Gengar');
  const target = new DMG.Pokemon(gen, 'Deoxys-Defense', {item: 'Sitrus Berry'});
  const move = new DMG.Move(gen, 'Poltergeist', {crit: true, alwaysHit: true});

  if (!move || !attacker || !target) return;

  computeTurn(attacker, target, move);

  printOutput(target);

  // ┌─────────┬─────┬──────┬─────────────┐
  // │ (index) │ hp  │ item │ probability │
  // ├─────────┼─────┼──────┼─────────────┤
  // │ 0       │ 133 │ null │ '6.25%'     │
  // │ 1       │ 131 │ null │ '6.25%'     │
  // │ 2       │ 127 │ null │ '12.5%'     │
  // │ 3       │ 125 │ null │ '6.25%'     │
  // │ 4       │ 121 │ null │ '12.5%'     │
  // │ 5       │ 119 │ null │ '6.25%'     │
  // │ 6       │ 115 │ null │ '12.5%'     │
  // │ 7       │ 113 │ null │ '6.25%'     │
  // │ 8       │ 109 │ null │ '12.5%'     │
  // │ 9       │ 107 │ null │ '6.25%'     │
  // │ 10      │ 103 │ null │ '6.25%'     │
  // │ 11      │ 101 │ null │ '6.25%'     │
  // └─────────┴─────┴──────┴─────────────┘
}

function example4() {
  const gen = gens.get(9);

  const attacker = new DMG.Pokemon(gen, 'Gengar');
  const target = new DMG.Pokemon(gen, 'Deoxys-Defense', {item: 'Sitrus Berry'});
  const move = new DMG.Move(gen, 'Poltergeist', {crit: false});

  if (!move || !attacker || !target) return;

  computeTurn(attacker, target, move);

  printOutput(target);

  // ┌─────────┬─────┬───────────────┬─────────────┐
  // │ (index) │ hp  │ item          │ probability │
  // ├─────────┼─────┼───────────────┼─────────────┤
  // │ 0       │ 241 │ 'sitrusberry' │ '10%'       │
  // │ 1       │ 179 │ null          │ '11.25%'    │
  // │ 2       │ 175 │ null          │ '11.25%'    │
  // │ 3       │ 173 │ null          │ '11.25%'    │
  // │ 4       │ 169 │ null          │ '11.25%'    │
  // │ 5       │ 167 │ null          │ '5.625%'    │
  // │ 6       │ 127 │ 'sitrusberry' │ '11.25%'    │
  // │ 7       │ 125 │ 'sitrusberry' │ '11.25%'    │
  // │ 8       │ 121 │ 'sitrusberry' │ '16.875%'   │
  // └─────────┴─────┴───────────────┴─────────────┘
}

function example5() {
  const gen = gens.get(9);

  const attacker = new DMG.Pokemon(gen, 'Gengar');
  const target = new DMG.Pokemon(gen, 'Deoxys-Defense', {item: 'Sitrus Berry'});
  const move = new DMG.Move(gen, 'Poltergeist', {alwaysHit: true});

  if (!move || !attacker || !target) return;

  computeTurn(attacker, target, move);
  computeTurn(attacker, target, move);

  printOutput(target);

  // ┌─────────┬─────┬───────────────┬─────────────┐
  // │ (index) │ hp  │ item          │ probability │
  // ├─────────┼─────┼───────────────┼─────────────┤
  // │ 0       │ 179 │ null          │ '11.979%'   │
  // │ 1       │ 175 │ null          │ '11.979%'   │
  // │ 2       │ 173 │ null          │ '11.979%'   │
  // │ 3       │ 169 │ null          │ '11.979%'   │
  // │ 4       │ 167 │ null          │ '5.99%'     │
  // │ 5       │ 133 │ null          │ '0.26%'     │
  // │ 6       │ 131 │ null          │ '0.26%'     │
  // │ 7       │ 127 │ null          │ '0.521%'    │
  // │ 8       │ 125 │ null          │ '0.26%'     │
  // │ 9       │ 121 │ null          │ '0.521%'    │
  // │ 10      │ 119 │ null          │ '0.26%'     │
  // │ 11      │ 115 │ null          │ '0.521%'    │
  // │ 12      │ 113 │ null          │ '0.26%'     │
  // │ 13      │ 109 │ null          │ '0.521%'    │
  // │ 14      │ 107 │ null          │ '0.26%'     │
  // │ 15      │ 103 │ null          │ '0.26%'     │
  // │ 16      │ 101 │ null          │ '0.26%'     │
  // │ 17      │ 73  │ null          │ '1.435%'    │
  // │ 18      │ 71  │ null          │ '2.87%'     │
  // │ 19      │ 69  │ null          │ '1.435%'    │
  // │ 20      │ 67  │ null          │ '4.305%'    │
  // │ 21      │ 65  │ null          │ '5.74%'     │
  // │ 22      │ 63  │ null          │ '1.435%'    │
  // │ 23      │ 61  │ null          │ '4.664%'    │
  // │ 24      │ 0   │ 'sitrusberry' │ '20.043%'   │
  // └─────────┴─────┴───────────────┴─────────────┘
}

function example6() {
  const gen = gens.get(9);

  const attacker = new DMG.Pokemon(gen, 'Gengar');
  const target = new DMG.Pokemon(gen, 'Deoxys-Defense', {item: 'Sitrus Berry'});
  const move = new DMG.Move(gen, 'Poltergeist');

  if (!move || !attacker || !target) return;

  computeTurn(attacker, target, move);
  computeTurn(attacker, target, move);

  printOutput(target);

  // ┌─────────┬─────┬───────────────┬─────────────┐
  // │ (index) │ hp  │ item          │ probability │
  // ├─────────┼─────┼───────────────┼─────────────┤
  // │ 0       │ 241 │ 'sitrusberry' │ '1%'        │
  // │ 1       │ 179 │ null          │ '11.859%'   │
  // │ 2       │ 175 │ null          │ '11.859%'   │
  // │ 3       │ 173 │ null          │ '11.859%'   │
  // │ 4       │ 169 │ null          │ '11.859%'   │
  // │ 5       │ 167 │ null          │ '5.93%'     │
  // │ 6       │ 133 │ null          │ '0.258%'    │
  // │ 7       │ 131 │ null          │ '0.258%'    │
  // │ 8       │ 127 │ 'sitrusberry' │ '1.186%'    │
  // │ 9       │ 127 │ null          │ '0.516%'    │
  // │ 10      │ 125 │ 'sitrusberry' │ '1.186%'    │
  // │ 11      │ 125 │ null          │ '0.258%'    │
  // │ 12      │ 121 │ 'sitrusberry' │ '1.779%'    │
  // │ 13      │ 121 │ null          │ '0.516%'    │
  // │ 14      │ 119 │ null          │ '0.258%'    │
  // │ 15      │ 115 │ null          │ '0.516%'    │
  // │ 16      │ 113 │ null          │ '0.258%'    │
  // │ 17      │ 109 │ null          │ '0.516%'    │
  // │ 18      │ 107 │ null          │ '0.258%'    │
  // │ 19      │ 103 │ null          │ '0.258%'    │
  // │ 20      │ 101 │ null          │ '0.258%'    │
  // │ 21      │ 73  │ null          │ '1.279%'    │
  // │ 22      │ 71  │ null          │ '2.557%'    │
  // │ 23      │ 69  │ null          │ '1.279%'    │
  // │ 24      │ 67  │ null          │ '3.836%'    │
  // │ 25      │ 65  │ null          │ '5.114%'    │
  // │ 26      │ 63  │ null          │ '1.279%'    │
  // │ 27      │ 61  │ null          │ '4.155%'    │
  // │ 28      │ 0   │ 'sitrusberry' │ '17.859%'   │
  // └─────────┴─────┴───────────────┴─────────────┘
}

function example7() {
  const gen = gens.get(9);

  const attacker = new DMG.Pokemon(gen, 'Bisharp');
  const target = new DMG.Pokemon(gen, 'Deoxys-Defense');
  const move = new DMG.Move(gen, 'Throat Chop');

  if (!move || !attacker || !target) return;

  for (let i = 1; i <= 4; i++) {
    computeTurn(attacker, target, move);
    printKoChance(target, i);
  }
}

example7();

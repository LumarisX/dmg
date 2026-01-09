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

  computeTurn(attacker, target, move);
  console.log(target.states.projectToSubspace(s => `${s.types.toString()}|${s.item}|${s.ability}`).getOutcomes());

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
  const move = new DMG.Move(gen, 'Iron Head');

  computeTurn(attacker, target, move);
  computeTurn(attacker, target, move);
  computeTurn(attacker, target, move);

  console.table(
    target.states
      .getOutcomes()
      .map(o => ({
        ...o.value,
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

function example8() {
  const gen = gens.get(9);

  const attacker = new DMG.Pokemon(gen, 'Sneasel');
  const target = new DMG.Pokemon(gen, 'Deoxys-Defense', {item: 'Sitrus Berry'});
  const move = new DMG.Move(gen, 'Triple Axel', {crit: false});

  //   computeTurn(attacker, target, move);
  //   printOutput(target);
}

example7();

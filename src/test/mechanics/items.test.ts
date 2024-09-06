import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';
import {computeModifiedSpeed} from '../../mechanics';
import {State} from '../../state';

const gens = new Generations(Dex as any);

describe('Mechanics', () => {
  test('Modified Speeds', () => {
    expect(
      computeModifiedSpeed(
        new State(
          gens.get(9),
          State.createPokemon(gens.get(9), 'Deoxys', {
            boosts: {spe: 1},
          }),
          State.createPokemon(gens.get(9), 'Deino'),
          State.createMove(gens.get(9), 'Scratch')
        )
      )
    ).toBe(504);
    expect(
      computeModifiedSpeed(
        new State(
          gens.get(9),
          State.createPokemon(gens.get(9), 'Deoxys', {
            boosts: {spe: 5},
          }),
          State.createPokemon(gens.get(9), 'Deino'),
          State.createMove(gens.get(9), 'Scratch')
        )
      )
    ).toBe(1176);
    expect(
      computeModifiedSpeed(
        new State(
          gens.get(9),
          State.createPokemon(gens.get(9), 'Deoxys', {
            boosts: {spe: -6},
          }),
          State.createPokemon(gens.get(9), 'Deino'),
          State.createMove(gens.get(9), 'Scratch')
        )
      )
    ).toBe(84);
  });
});

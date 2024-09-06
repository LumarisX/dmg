import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';
import {State} from '../../state';
import {computeModifiedSpeed} from '../../mechanics';

const gens = new Generations(Dex as any);

describe('Abilities', () => {
  test('Weather Speed', () => {
    expect(
      computeModifiedSpeed(
        new State(
          gens.get(9),
          State.createPokemon(gens.get(9), 'Poliwrath', {
            ability: 'Swift Swim',
          }),
          State.createPokemon(gens.get(9), 'Deoxys'),
          State.createMove(gens.get(9), 'Scratch'),
          State.createField(gens.get(9), {weather: 'Rain'})
        )
      )
    ).toBe(352);
    expect(
      computeModifiedSpeed(
        new State(
          gens.get(9),
          State.createPokemon(gens.get(9), 'Lilligant', {
            ability: 'Chlorophyll',
          }),
          State.createPokemon(gens.get(9), 'Deoxys'),
          State.createMove(gens.get(9), 'Scratch'),
          State.createField(gens.get(9), {weather: 'Sun'})
        )
      )
    ).toBe(432);
    expect(
      computeModifiedSpeed(
        new State(
          gens.get(9),
          State.createPokemon(gens.get(9), 'Cetitan', {
            ability: 'Slush Rush',
          }),
          State.createPokemon(gens.get(9), 'Deoxys'),
          State.createMove(gens.get(9), 'Scratch'),
          State.createField(gens.get(9), {weather: 'Snow'})
        )
      )
    ).toBe(364);
    expect(
      computeModifiedSpeed(
        new State(
          gens.get(7),
          State.createPokemon(gens.get(7), 'Beartic', {
            ability: 'Slush Rush',
          }),
          State.createPokemon(gens.get(7), 'Deoxys'),
          State.createMove(gens.get(7), 'Scratch'),
          State.createField(gens.get(7), {weather: 'Hail'})
        )
      )
    ).toBe(272);
    expect(
      computeModifiedSpeed(
        new State(
          gens.get(9),
          State.createPokemon(gens.get(9), 'Excadrill', {
            ability: 'Sand Rush',
          }),
          State.createPokemon(gens.get(9), 'Deoxys'),
          State.createMove(gens.get(9), 'Scratch'),
          State.createField(gens.get(9), {weather: 'Sand'})
        )
      )
    ).toBe(424);
  });
});

import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/sim';

import {CORPUS, characterize} from './helpers/characterize';

const gens = new Generations(Dex as any);
const gen = gens.get(9);

describe('characterization', () => {
  test.each(CORPUS.map(scenario => [scenario.name, scenario] as const))('%s', (_name, scenario) => {
    expect(characterize(gen, scenario)).toMatchSnapshot();
  });
});

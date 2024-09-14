import type {GameType, Generation, GenerationNum, Generations, Specie} from '@pkmn/data';

import {FieldOptions, MoveOptions, PokemonOptions, SideOptions, State} from './state';
import {Result} from './result';
import {calculate} from './mechanics';

import * as parser from './parse';

/** Constructs a `State.Pokemon` in a specific generation `gen`. */
const pokemon =
  (gen: Generation) =>
    (name: string, options: PokemonOptions = {}, move: string | {name?: string} = {}) =>
      State.createPokemon(gen, name, options, move);

/** Constructs a `State.Side` in a specific generation `gen`. */
const side =
  (gen: Generation) =>
    (sPokemon: State.Pokemon | string, sideOptions: SideOptions = {}) => {
      if (typeof sPokemon === 'string') sPokemon = State.createPokemon(gen, sPokemon);
      return State.createSide(gen, sPokemon, sideOptions);
    };

/** Constructs a `State.Move` in a specific generation `gen`. */
const createMove =
  (gen: Generation) =>
    (
      name: string,
      options: MoveOptions = {},
      // eslint-disable-next-line @typescript-eslint/no-shadow
      pokemon:
      | string
      | {
        species?: string | Specie;
        item?: string;
        ability?: string;
      } = {}
    ) =>
      State.createMove(gen, name, options, pokemon);

/** Constructs a `State.Field` in a specific generation `gen`. */
const field =
  (gen: Generation) =>
    (options: FieldOptions = {}) =>
      State.createField(gen, options);

/** Performs a damage calculation in specific generation `gen`. */
interface Calculate {
  (
    gen: Generation
  ): (
    attacker: State.Side | State.Pokemon,
    defender: State.Side | State.Pokemon,
    move: State.Move,
    field?: State.Field,
    gameType?: GameType
  ) => Result;
  (gen: Generation): (args: string) => Result;
}

/** Parses a string into `State` in a specific generation `gen`. */
const parse = (gen: Generation) => (s: string, strict?: boolean) => parser.parse(gen, s, strict);

/** A collection of `State` factory methods and helpers scoped to a specific generation `gen`. */
export interface Scope {
  gen: Generation;
  calculate: Calculate;
  parse: ReturnType<typeof parse>;
  Pokemon: ReturnType<typeof pokemon>;
  Move: ReturnType<typeof createMove>;
  Field: ReturnType<typeof field>;
  Side: ReturnType<typeof side>;
}

/** Executes a function `fn` scoped to a specific generation `gen`. */
export function inGen<T>(gen: Generation, fn: (scope: Scope) => T) {
  return fn({
    gen,
    calculate: ((generation: Generation) => (attacker: State.Pokemon, defender: State.Pokemon, smove: State.Move) =>
      calculate(generation, attacker, defender, smove)) as Calculate,
    parse: parse(gen),
    Move: createMove(gen),
    Pokemon: pokemon(gen),
    Field: field(gen),
    Side: side(gen),
  });
}

/**
 * Executes a function `fn` for each of the generations between `from` and `to`. If neither are
 * specified `fn` is executed for every gen. If `to` is not specified it defaults to Generation 8.
 */
export function inGens(gens: Generations, fn: (scope: Scope) => void): void;
export function inGens(gens: Generations, from: GenerationNum, fn: (scope: Scope) => void): void;
export function inGens(gens: Generations, from: GenerationNum, to: GenerationNum, fn: (scope: Scope) => void): void;
export function inGens(
  gens: Generations,
  from: GenerationNum | ((scope: Scope) => void),
  to?: GenerationNum | ((scope: Scope) => void),
  fn?: (scope: Scope) => void
) {
  if (typeof from !== 'number') {
    fn = fn ?? from;
    from = 1;
    to = 8;
  }
  if (typeof to !== 'number') {
    fn = fn ?? to;
    to = 8;
  }
  for (let gen = from; gen <= to; gen++) {
    inGen(gens.get(gen), fn!);
  }
}

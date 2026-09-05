import * as assert from 'assert';

import {Specie} from '@pkmn/data';

import {State} from '../../state';

/**
 * Workaround for asserting equality between between two `State` objects.
 *
 * Jest's `toEqual` and assert's `deepStrictEqual` choke on the circular references in `State` and
 * fail to terminate. Instead, this helper compares the objects piecemeal, strict comparing the
 * problematic fields and temporarily mutating the fields to work around the issues. `assert` is
 * used here as opposed to `expect` to faciliate use in the integration runner which does not run
 * in the Jest enviroment.
 */
export function assertStateEqual(a: State, b: State) {
  assert.strictEqual(a.gen, b.gen);
  assert.strictEqual(a.gameType, b.gameType);
  assert.deepStrictEqual(a.field, b.field);

  const A = {p1: a.attacker.species, p2: a.target.species};
  const B = {p1: b.attacker.species, p2: b.target.species};
  try {
    assert.strictEqual(a.attacker.species, b.attacker.species);
    a.attacker.species = b.attacker.species = undefined! as Specie;
    assert.strictEqual(a.target.species, b.target.species);
    a.target.species = b.target.species = undefined! as Specie;

    assert.deepStrictEqual(a.sides, b.sides);
    assert.deepStrictEqual(a.move, b.move);
  } finally {
    a.attacker.species = A.p1;
    a.target.species = A.p2;
    b.attacker.species = B.p1;
    b.target.species = B.p2;
  }
}

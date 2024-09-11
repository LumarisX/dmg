import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/sim";
import { calculate, Field, Move, Pokemon } from "@smogon/calc";
import { Context } from "../context";
import { calculate2 } from "../mechanics";
import { State } from "../state";

const gens = new Generations(Dex as any);
const gen = gens.get(7);

let attacker = "Incineroar";
let attackerMod = { evs: { atk: 4 }, level: 50, happiness: 0 };

let defender = "Amoonguss";
let defenderMod = { evs: { def: 76 }, level: 50, item: "Black Sludge" };

let move = "Frustration";

let smogCalc = calculate(
  gen,
  new Pokemon(gen, attacker, attackerMod),
  new Pokemon(gen, defender, defenderMod),
  new Move(gen, move),
  new Field()
);
console.log(smogCalc.damage);

const state = new State(
  gen,
  State.createPokemon(gen, attacker, attackerMod),
  State.createPokemon(gen, defender, defenderMod),
  State.createMove(gen, move),
  State.createField(gen)
);

let newCalc = calculate2(Context.fromState(state));

console.log(newCalc);
let equals = () => {
  for (let i = 0; i < newCalc.length; i++) {
    if (newCalc[i] != (smogCalc.damage as number[])[i]) return false;
  }
  return true;
};
console.log(equals());

import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/sim";
import { calculate as calculateSmog, Field, Move, Pokemon } from "@smogon/calc";
import { calculate } from "../mechanics";
import { State } from "../state";

const gens = new Generations(Dex as any);
const gen = gens.get(9);

let attacker = "Incineroar";
let attackerMod = {
  evs: { atk: 4 },
  level: 50,
  ability: "Huge Power",
  item: "Flame Plate",
};

let defender = "Amoonguss";
let defenderMod = { evs: { def: 76 }, level: 50, item: "Black Sludge" };

let move = "Flare Blitz";

let fieldMod: Partial<Field> = { weather: "Sun" };

let start = performance.now();
let smogCalc = calculateSmog(
  gen,
  new Pokemon(gen, attacker, attackerMod),
  new Pokemon(gen, defender, defenderMod),
  new Move(gen, move),
  new Field(fieldMod)
);
console.log("@smogon/calc", performance.now() - start, "ms");

start = performance.now();

let newCalc = calculate(
  new State(
    gen,
    State.createPokemon(gen, attacker, attackerMod),
    State.createPokemon(gen, defender, defenderMod),
    State.createMove(gen, move),
    State.createField(gen, fieldMod)
  )
);

console.log("@pkmn/dmg", performance.now() - start, "ms");

console.log("\n", newCalc.toString(), "\n");

let equals = () => {
  if (Array.isArray(newCalc.hits[0].damage))
    for (let i = 0; i < newCalc.hits[0].damage.length; i++) {
      if (newCalc.hits[0].damage[i] != (smogCalc.damage as number[])[i])
        return false;
    }
  return true;
};
if (!equals) {
  console.log(smogCalc.damage);
  console.log(newCalc.hits[0].damage);
}
console.log("Equal");

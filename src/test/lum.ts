import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/sim";
import { Field, Move, Pokemon } from "@smogon/calc";
import { Context } from "../context";
import { calculate2 } from "../mechanics";
import { calculateBaseDamageSMSSSV } from "../mechanics/smogonMech";
import { getFinalDamage } from "../mechanics/smogonUtil";
import { State } from "../state";

const gens = new Generations(Dex as any);
const gen = gens.get(9);

let baseDamage = calculateBaseDamageSMSSSV(
  gen,
  new Pokemon(gen, "Incineroar", { evs: { atk: 4 }, level: 50 }),
  new Pokemon(gen, "Amoonguss", { evs: { def: 76 }, level: 50 }),
  70,
  136,
  100,
  new Move(gen, "U-Turn"),
  new Field(),
  {
    attackerName: "Incineroar",
    moveName: "U-Turn",
    defenderName: "Amoongus",
    isDefenderDynamaxed: false,
    isWonderRoom: false,
  }
);
console.log(baseDamage);
let lowFinal = getFinalDamage(baseDamage, 0, 2, false, 0x1000, 0x1000, false);
let highFinal = getFinalDamage(baseDamage, 15, 2, false, 0x1000, 0x1000, false);

console.log(lowFinal, highFinal);

const state = new State(
  gen,
  State.createPokemon(gen, "Incineroar", { evs: { atk: 4 }, level: 50 }),
  State.createPokemon(gen, "Amoonguss", { evs: { def: 76 }, level: 50 }),
  State.createMove(gen, "U-Turn"),
  State.createField(gen)
);

console.log(calculate2(Context.fromState(state)));

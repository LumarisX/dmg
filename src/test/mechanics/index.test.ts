import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/sim";
import { calculate2, computeModifiedSpeed } from "../../mechanics";
import { State } from "../../state";
import { Context } from "../../context";

const gens = new Generations(Dex as any);

describe("Mechanics", () => {
  test("Modified Speeds", () => {
    expect(
      computeModifiedSpeed(
        new State(
          gens.get(9),
          State.createPokemon(gens.get(9), "Deoxys", {
            boosts: { spe: 1 },
          }),
          State.createPokemon(gens.get(9), "Deino"),
          State.createMove(gens.get(9), "Scratch")
        )
      )
    ).toBe(504);
    expect(
      computeModifiedSpeed(
        new State(
          gens.get(9),
          State.createPokemon(gens.get(9), "Deoxys", {
            boosts: { spe: 5 },
          }),
          State.createPokemon(gens.get(9), "Deino"),
          State.createMove(gens.get(9), "Scratch")
        )
      )
    ).toBe(1176);
    expect(
      computeModifiedSpeed(
        new State(
          gens.get(9),
          State.createPokemon(gens.get(9), "Deoxys", {
            boosts: { spe: -6 },
          }),
          State.createPokemon(gens.get(9), "Deino"),
          State.createMove(gens.get(9), "Scratch")
        )
      )
    ).toBe(84);
  });
  test("Calculations", () => {
    expect(
      calculate2(
        Context.fromState(
          new State(
            gens.get(9),
            State.createPokemon(gens.get(9), "Incineroar", {
              evs: { atk: 4 },
              level: 50,
            }),
            State.createPokemon(gens.get(9), "Amoonguss", {
              evs: { def: 76 },
              level: 50,
            }),
            State.createMove(gens.get(9), "U-Turn"),
            State.createField(gens.get(9))
          )
        )
      )
    ).toBe([72, 72, 74, 74, 76, 76, 78, 78, 78, 80, 80, 82, 82, 84, 84, 86]);
  });
});

import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/sim";
import { WeatherName } from "../conditions";
import { calculate } from "../mechanics";
import { State } from "../state";

const gens = new Generations(Dex as any);
const gen = gens.get(9);

const attacker = State.createPokemon(gen, "Poliwrath", {
  nature: "Jolly",
  evs: { spe: 252 },
  ability: "Swift Swim",
  item: "Choice Scarf",
});

const p1 = State.createSide(gen, attacker, {
  sideConditions: ["tailwind"],
  abilities: ["swiftswim"],
});
const defender = {
  pokemon: State.createPokemon(gen, "Blissey", {
    evs: { hp: 252, spd: 252 },
  }),
  sideConditions: { spikes: { level: 2 }, stealthrock: {} },
};
const move = State.createMove(gen, "Focus Blast");
const field = { weather: "Rain" as WeatherName, pseudoWeather: {} };
const result = calculate(gen, attacker, defender, move, field);

// console.log(result);

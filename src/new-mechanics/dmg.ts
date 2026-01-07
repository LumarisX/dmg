import {BoostsTable, Generation, Specie, SpeciesName, StatsTable, TypeName} from '@pkmn/data';
import {Move as DexMove} from '@pkmn/dex';

export namespace DMG {
  type OverriddenFields = 'item' | 'ability' | 'nature' | 'status' | 'volatiles' | 'ivs' | 'evs' | 'boosts';
  export interface PokemonOptions extends Partial<Omit<Pokemon, OverriddenFields>> {
    name?: SpeciesName;
    weightkg?: number;
    item?: string;
    ability?: string;
    nature?: string;
    status?: string;
    hpPercent?: number;
    // volatiles?: string[] | State.Pokemon['volatiles'];
    evs?: Partial<StatsTable & {spc: number}>;
    ivs?: Partial<StatsTable & {spc: number}>;
    dvs?: Partial<StatsTable & {spc: number}>;
    boosts?: Partial<BoostsTable & {spc: number}>;
    teraType?: TypeName;
  }
  export class Pokemon extends Specie {
    item?: string | null;
    hp: number;
    readonly maxHp: number;

    constructor(gen: Generation, name: string, options: Partial<PokemonOptions> = {}) {
      const species = gen.species.get(name);
      if (!species) {
        throw new Error(`Invalid species name: ${name}`);
      }
      super(gen.dex, gen.exists, species);
      this.maxHp = gen.stats.calc('hp', this.baseStats.hp, 31, 0, 100);
      this.hp = this.maxHp;
      this.item = options.item || null;
    }

    // static createPokemon(gen: Generation, name: string, options: PokemonOptions = {}, move: string | {name?: string} = '') {
    //   const pokemon: Partial<State.Pokemon> = {};

    //   // Species
    //   const species = gen.species.get(name);
    //   if (!species) invalid(gen, 'species', name);
    //   if (options.species && options.species !== species) {
    //     throw new Error(`Species mismatch: ${options.species.name} does not match ${species.name}`);
    //   }
    //   pokemon.species = species;

    //   // Level
    //   pokemon.level = 100;
    //   if (typeof options.level === 'number') {
    //     pokemon.level = bounded('level', options.level);
    //   }

    //   // Weight
    //   pokemon.weighthg =
    //     typeof options.weighthg === 'number' ? options.weighthg : typeof options.weightkg === 'number' ? options.weightkg * 10 : species.weighthg;
    //   if (pokemon.weighthg < 1) throw new Error(`weighthg of ${pokemon.weighthg} must be at least 1`);

    //   // Item
    //   pokemon.item = undefined;
    //   setItem(gen, pokemon, options.item);

    //   // Ability
    //   pokemon.ability = undefined;
    //   setAbility(gen, pokemon as {species: Specie; ability?: ID}, options.ability);

    //   // Happiness
    //   pokemon.happiness = typeof options.happiness === 'undefined' ? undefined : bounded('happiness', options.happiness);

    //   // Status
    //   pokemon.status = undefined;
    //   pokemon.statusState = undefined;
    //   if (options.status) {
    //     const condition = Conditions.get(gen, options.status);
    //     if (!condition) invalid(gen, 'status', options.status);
    //     const [status, kind] = condition;
    //     if (kind !== 'Status') {
    //       throw new Error(`'${status} is a ${kind} not a Status in generation ${gen.num}`);
    //     }
    //     pokemon.status = status as StatusName;
    //     if (pokemon.status === 'tox') pokemon.statusState = {toxicTurns: 0};
    //   }

    //   // Status Data
    //   if (options.statusState) {
    //     if (options.statusState.toxicTurns) {
    //       const turns = options.statusState.toxicTurns;
    //       bounded('toxicCounter', turns);
    //       if (pokemon.status !== 'tox') {
    //         throw new Error(`toxicTurns set to ${turns} but the Pokemon's status is not 'tox'`);
    //       }
    //     }
    //     pokemon.statusState = options.statusState;
    //   }

    //   // Volatiles
    //   pokemon.volatiles = setConditions(gen, 'Volatile Status', options.volatiles);

    //   // Types
    //   pokemon.types = options.types || pokemon.species.types;
    //   pokemon.addedType = options.addedType;

    //   // Nature
    //   pokemon.nature = undefined;
    //   setNature(gen, pokemon, options.nature);

    //   // EVs
    //   setValues(gen, pokemon, 'evs', options.evs);

    //   // IVs / DVs
    //   setValues(gen, pokemon, 'ivs', options.ivs);
    //   for (const stat of gen.stats) {
    //     const val = options.dvs?.[stat];
    //     if (typeof val === 'number') {
    //       const dv = bounded('dvs', val);
    //       if (typeof options.ivs?.[stat] === 'number' && gen.stats.toDV(options.ivs[stat]) !== dv) {
    //         throw new Error(`${stat} DV of '${dv}' does not match IV of '${options.ivs[stat]}'`);
    //       }
    //       pokemon.ivs![stat] = gen.stats.toIV(dv);
    //     }
    //   }
    //   setSpc(gen, pokemon.ivs!, 'ivs', options.dvs, gen.stats.toIV.bind(gen.stats));

    //   if (move) {
    //     move = typeof move === 'string' ? move : move.name || '';
    //     setHiddenPowerIVs(gen, pokemon as {level: number; ivs: StatsTable}, [move]);
    //   }

    //   // Stats
    //   if (options.stats) pokemon.stats = extend({}, options.stats);

    //   // Boosts
    //   pokemon.boosts = {};
    //   if (options.boosts) {
    //     for (const b in options.boosts) {
    //       if (b === 'spc') continue;
    //       const boost = b as keyof BoostsTable;
    //       const val = options.boosts[boost];
    //       if (typeof val === 'number') pokemon.boosts[boost] = bounded('boosts', val);
    //     }
    //   }
    //   setSpc(gen, pokemon.boosts, 'boosts', options.boosts);

    //   // Gender (depends on DVs)
    //   const setAtkDV = typeof (options.dvs?.atk ?? options.ivs?.atk) === 'number';
    //   setGender(gen, pokemon as {species: Specie; ivs: StatsTable; gender?: GenderName}, options.gender, setAtkDV);

    //   // HP (depends on stats)
    //   const setHPDV = typeof (options.dvs?.hp ?? options.ivs?.hp) === 'number';
    //   correctHPDV(gen, pokemon as {species: Specie; ivs: StatsTable}, setHPDV);
    //   pokemon.maxhp = gen.stats.calc('hp', species.baseStats.hp, pokemon.ivs!.hp, pokemon.evs!.hp, pokemon.level);
    //   if (options.maxhp) {
    //     if (options.maxhp < pokemon.maxhp) {
    //       throw new RangeError(`maxhp ${options.maxhp} less than calculated max HP ${pokemon.maxhp}`);
    //     }
    //     pokemon.maxhp = options.maxhp;
    //   }

    //   //Tera Type

    //   pokemon.teraType = pokemon.types[0];

    //   const computed = typeof options.hpPercent === 'number' ? round((options.hpPercent * pokemon.maxhp) / 100) : undefined;
    //   pokemon.hp = typeof options.hp === 'number' ? options.hp : typeof computed === 'number' ? computed : pokemon.maxhp;
    //   if (!(pokemon.hp >= 0 && pokemon.hp <= pokemon.maxhp)) {
    //     throw new RangeError(`hp ${pokemon.hp} is not within [0,${pokemon.maxhp}]`);
    //   }
    //   if (typeof options.hp === 'number' && typeof computed === 'number') {
    //     if (pokemon.hp !== computed) {
    //       throw new Error(`hp mismatch: '${computed}' does not match '${pokemon.hp}'`);
    //     }
    //   }

    //   // Miscellaneous
    //   pokemon.position = options.position;
    //   pokemon.switching = options.switching;
    //   pokemon.moveLastTurnResult = options.moveLastTurnResult;
    //   pokemon.hurtThisTurn = options.hurtThisTurn;

    //   return validateStats(gen, pokemon as State.Pokemon);
    // }
  }

  const CRITRATES = [0, 1 / 24, 1 / 8, 1 / 2];

  export type MoveOptions = {crit?: boolean; alwaysHit?: boolean; alwaysSucceed?: boolean};

  export class Move extends DexMove {
    critChance: number;
    alwaysHit?: boolean;
    alwaysSucceed?: boolean;

    constructor(move: DexMove, options: MoveOptions = {}) {
      super(move);
      this.critChance =
        options.crit === undefined
          ? move.critRatio
            ? move.critRatio > CRITRATES.length
              ? 1
              : CRITRATES[move.critRatio]
            : CRITRATES[0]
          : options.crit
          ? 1
          : 0;
      this.alwaysHit = options.alwaysHit;
      this.alwaysSucceed = options.alwaysSucceed;
    }
  }
}

import {Applier, Handler} from '../handlers';
import {Context} from '../context';
import {is} from '../utils';

const UMBRELLA = 'utilityumbrella';

function shieldedFromSun(context: Context): boolean {
  return context.target.item?.id === UMBRELLA;
}

export const Conditions: {
  [id: string]: Partial<Applier & Handler<Context.Pokemon>> | Partial<Applier & Handler<Context>>;
} = {
  brn: {
    onModifyAtk(pokemon: Context.Pokemon) {
      if (!is(pokemon.ability?.id, 'guts') && !is(pokemon.move?.id, 'facade')) return 0x800;
    },
  },
  par: {
    onModifySpe(pokemon: Context.Pokemon) {
      if (pokemon.gen.num > 6) return 0x800;
      return 0x400;
    },
  },
  sun: {
    onWeatherModifyDamage(context: Context) {
      if (is(context.move.id, 'hydrosteam') && context.attacker.item?.id !== UMBRELLA) return 0x1800;
      if (shieldedFromSun(context)) return undefined;
      if (is(context.move.type, 'Fire')) return 0x1800;
      if (is(context.move.type, 'Water')) return 0x800;
      return undefined;
    },
  },
  rain: {
    onWeatherModifyDamage(context: Context) {
      if (shieldedFromSun(context)) return undefined;
      if (is(context.move.type, 'Water')) return 0x1800;
      if (is(context.move.type, 'Fire')) return 0x800;
      return undefined;
    },
  },
  harshsunshine: {
    onTryImmunity(context: Context) {
      return is(context.move.type, 'Water') && !is(context.move.category, 'Status');
    },
    onWeatherModifyDamage(context: Context) {
      if (is(context.move.id, 'hydrosteam') && context.attacker.item?.id !== UMBRELLA) return 0x1800;
      if (shieldedFromSun(context)) return undefined;
      if (is(context.move.type, 'Fire')) return 0x1800;
      return undefined;
    },
  },
  heavyrain: {
    onTryImmunity(context: Context) {
      return is(context.move.type, 'Fire') && !is(context.move.category, 'Status');
    },
    onWeatherModifyDamage(context: Context) {
      if (shieldedFromSun(context)) return undefined;
      if (is(context.move.type, 'Water')) return 0x1800;
      return undefined;
    },
  },
};

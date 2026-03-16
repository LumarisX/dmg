import {Applier, Handler} from '../handlers';
import {Context} from '../../../pokemon-draftzone-server/dmg/context';
import {is} from '../utils';

export const Conditions: {
  [id: string]: Partial<Applier & Handler<Context.Pokemon>>;
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
};

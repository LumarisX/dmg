import {State} from '../../pokemon-draftzone-server/dmg/state';
import {Abilities} from './mechanics/abilities';
import {Conditions} from './mechanics/conditions';
import {Items} from './mechanics/items';
import {Moves} from './mechanics/moves';

export interface Applier {
  apply(side: 'p1' | 'p2', state: State, guaranteed?: boolean): void;
}

export interface Handler<S> {
  basePowerCallback(scope: S): number;
  damageCallback(scope: S): number;
  onAnyBasePower(scope: S): number | undefined;
  onBasePower(scope: S): number | undefined;
  onModifyMove(scope: S): void;
  onModifyAtk(scope: S): number | undefined;
  onModifySpA(scope: S): number | undefined;
  onModifyDef(scope: S): number | undefined;
  onModifySpD(scope: S): number | undefined;
  onModifySpe(scope: S): number | undefined;
  onModifyWeight(scope: S): number | undefined;
  onResidual(scope: S): number | undefined;
  onModifyDamageAttacker(scope: S): number | undefined;
  onModifyDamageDefender(scope: S): number | undefined;
  onUpdate(scope: S): void;
  onModifyMoveStat(scope: S): number | undefined;
  onModifySTAB(scope: S): number | undefined;
  onEffectiveness(scope: S): number | undefined;
  onTryImmunity(scope: S): boolean;
  onEat(scope: S): void;
}

export type HandlerKind = 'Abilities' | 'Items' | 'Moves' | 'Conditions';
export type Handlers = typeof HANDLERS;
export const HANDLERS = {Abilities, Conditions, Items, Moves};

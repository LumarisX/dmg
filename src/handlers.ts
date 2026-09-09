import {State} from './state';
import {Abilities} from './mechanics/abilities';
import {Conditions} from './mechanics/conditions';
import {Items} from './mechanics/items';
import {Moves} from './mechanics/moves';

export interface Applier {
  apply(side: 'p1' | 'p2', state: State, guaranteed?: boolean): void;
}

export interface MoveDataBranch {
  label: string;
  weight: number;
  move?: Partial<State.Move>;
  flags?: {[flag: string]: boolean};
}

export interface Brancher {
  branches: MoveDataBranch[];
}

export interface Handler<S> {
  basePowerCallback(scope: S): number;
  damageCallback(scope: S): number;
  onAnyBasePower(scope: S): number | undefined;
  onBasePower(scope: S): number | undefined;
  onSourceBasePower(scope: S): number | undefined;
  onModifyMove(scope: S): void;
  onModifyAtk(scope: S): number | undefined;
  onModifySpA(scope: S): number | undefined;
  onSourceModifyAtk(scope: S): number | undefined;
  onSourceModifySpA(scope: S): number | undefined;
  onModifyDef(scope: S): number | undefined;
  onModifySpD(scope: S): number | undefined;
  onModifySpe(scope: S): number | undefined;
  onModifyWeight(scope: S): number | undefined;
  onResidual(scope: S): number | undefined;
  onModifyDamageAttacker(scope: S): number | undefined;
  onModifyDamageDefender(scope: S): number | undefined;
  onWeatherModifyDamage(scope: S): number | undefined;
  onUpdate(scope: S): void;
  onModifyMoveStat(scope: S): number | undefined;
  onModifySTAB(scope: S): number | undefined;
  onEffectiveness(scope: S): number | undefined;
  onTryImmunity(scope: S): boolean;
  onEat(scope: S): void;
}

const HANDLER_FN_KEYS: {[K in keyof Handler<unknown>]: true} = {
  basePowerCallback: true,
  damageCallback: true,
  onAnyBasePower: true,
  onBasePower: true,
  onSourceBasePower: true,
  onModifyMove: true,
  onModifyAtk: true,
  onModifySpA: true,
  onSourceModifyAtk: true,
  onSourceModifySpA: true,
  onModifyDef: true,
  onModifySpD: true,
  onModifySpe: true,
  onModifyWeight: true,
  onResidual: true,
  onModifyDamageAttacker: true,
  onModifyDamageDefender: true,
  onWeatherModifyDamage: true,
  onUpdate: true,
  onModifyMoveStat: true,
  onModifySTAB: true,
  onEffectiveness: true,
  onTryImmunity: true,
  onEat: true,
};

export const HANDLER_FNS = Object.keys(HANDLER_FN_KEYS) as (keyof Handler<unknown>)[];

export type Participant =
  | 'move'
  | 'field.weather'
  | 'attacker.ability'
  | 'attacker.item'
  | 'attacker.status'
  | 'target.ability'
  | 'target.item';

export const CONSULTS: {[K in keyof Handler<unknown>]: Participant[]} = {
  basePowerCallback: ['move'],
  damageCallback: ['move'],
  onBasePower: ['attacker.ability', 'attacker.item', 'move'],
  onSourceBasePower: ['target.ability', 'target.item'],
  onModifyMove: ['attacker.ability', 'attacker.item', 'move'],
  onModifyAtk: ['attacker.ability', 'attacker.item', 'attacker.status'],
  onModifySpA: ['attacker.ability', 'attacker.item'],
  onSourceModifyAtk: ['target.ability'],
  onSourceModifySpA: ['target.ability'],
  onModifyDef: ['target.ability', 'target.item'],
  onModifySpD: ['target.ability', 'target.item'],
  onModifySpe: ['attacker.ability', 'attacker.item'],
  onModifyDamageAttacker: ['attacker.ability', 'attacker.item'],
  onModifyDamageDefender: ['target.ability', 'target.item'],
  onWeatherModifyDamage: ['field.weather'],
  onModifySTAB: ['attacker.ability'],
  onEffectiveness: ['move'],
  onTryImmunity: ['move', 'field.weather', 'target.ability', 'target.item'],

  onAnyBasePower: [],
  onModifyWeight: [],
  onResidual: [],
  onModifyMoveStat: [],
  onUpdate: [],
  onEat: [],
};

export type HandlerKind = 'Abilities' | 'Items' | 'Moves' | 'Conditions';
export type Handlers = typeof HANDLERS;
export const HANDLERS = {Abilities, Conditions, Items, Moves};

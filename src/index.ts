// core API
export {calculate} from './mechanics';
export {State} from './state';
export {Result} from './result';
export {Relevancy} from './relevancy';

// outcome distributions
export {Distribution, NumberDistribution, ExactHorizonError, ProbabilityMassError, addCritCounts} from './distribution';
export type {CritCounts, Keyer, Outcome} from './distribution';
export {stateKey, stateDistribution, pokemonKey, sideKey, fieldKey, moveKey} from './key';
export {resolveMove, critCounts, assertSupported, UnsupportedMoveError, accuracyBranches, critBranches, hitCountBranches, secondaryBranches} from './resolve';
export {resolveTurns, knockoutChances, guaranteedKnockoutTurn, repeatMove} from './turns';
export type {Policy, TurnsOptions, TurnsOutcome, TurnsResult} from './turns';

// parsing
export {parse, ParseError} from './parse';
export {encode} from './encode';

// convenience scoping
export {inGen, inGens, Scope} from './gens';

// UI and mod support
export * from './conditions';
export {override} from './utils';
export {Applier, Handler, HANDLERS as Handlers} from './mechanics';
export {computeStats} from './stats';

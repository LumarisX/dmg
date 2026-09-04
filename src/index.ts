// core API
export {calculate} from './mechanics';
export {State} from './state';
export {Result} from './result';
export {Relevancy} from './relevancy';

// outcome distributions
export {Distribution, NumberDistribution, ExactHorizonError, ProbabilityMassError} from './distribution';
export type {Keyer, Outcome} from './distribution';
export {stateKey, stateDistribution, pokemonKey, sideKey, fieldKey, moveKey} from './key';
export {resolveMove, assertSupported, UnsupportedMoveError, accuracyBranches, critBranches, hitCountBranches, secondaryBranches} from './resolve';
export {search, knockoutChances, guaranteedKnockoutTurn, repeatMove} from './search';
export type {Policy, SearchOptions, SearchOutcome, SearchResult} from './search';

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

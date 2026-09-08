# Mechanics Layer — Transitions

The primitive this calculator is actually built on, and what follows from taking it seriously.

Read [`PLAN.md`](PLAN.md) for the project goal and [`REFACTOR.md`](REFACTOR.md) for the performance
work. **This document *is* `REFACTOR.md` phase 1** as of 2026-09-08 — that document's phase list was
rewritten to absorb it. Unlike the phases after it, this work changes answers on purpose and is
verified against the `@pkmn/sim` oracle rather than a self-baseline.

## The frame

`@pkmn/dmg` is a from-scratch rewrite of a calculator whose mechanics layer mirrors a **simulator's
event system** — 24 hooks named after Showdown's, consulted at hand-written call sites. This project
inherited that decomposition.

But this calculator's distinguishing feature is not that it evaluates a damage formula. It is that
it computes a **probability distribution over resulting battle states**, and that branches which
reach the same state **merge**. That is what makes it more precise than `@smogon/calc`, and it is
what `PLAN.md` says the whole design serves.

The mechanics layer should be organised around that. It currently is not, and the cost is
measurable.

## Evidence

**Five branch types, one concept.** `resolve.ts` and `handlers.ts` declare:

```
AccuracyBranch   {lands, weight}
CritBranch       {crit, weight}
HitCountBranch   {hits, weight}
SecondaryBranch  {effects, weight}
MoveDataBranch   {label, weight, move?, flags?}
```

Plus a sixth axis with no type at all — the 16 damage rolls, returned as a bare `number[]` and
consumed inline. Six weighted-branch axes, five interfaces, no shared abstraction, and bespoke
consumption code for each inside `resolveMove`.

**The unifying abstraction already exists and is unused.** `Distribution.flatMap`
(`distribution.ts:208`) is `(value: T) => Distribution<T>` — monadic bind over weighted states. It
computes the LCM common denominator, scales each sub-distribution, merges by key and asserts mass.
**`resolve.ts` never calls it.** Its one `flatMap` is `Array.prototype.flatMap`.

Instead `resolveMove` hand-rolls that arithmetic as `expansion` / `perResolution` /
`accumulateStep` / `advance`. On 2026-09-08 LCM logic was added *inside `resolveMove`* to put
move-data branches on a common denominator — reimplementing, forty lines away, what `flatMap`
already does. That is the clearest possible symptom: the central abstraction is correct, and the
main algorithm cannot reach it because the axes are not distributions.

## The primitive

A weighted state transition: **`State → Distribution<State>`**.

Every axis is already one, wearing a different shape:

| axis | today | as a transition |
| --- | --- | --- |
| move data | `{label, weight, move?, flags?}[]` | 2 outcomes, 7/3 for Fickle Beam |
| accuracy | `{lands, weight}[]` | 2 outcomes |
| crit | `{crit, weight}[]` | folded into damage, see below |
| damage rolls | bare `number[]` | 16 outcomes |
| hit count | `{hits, weight}[]` | iteration with termination, not a product |
| secondaries | `{effects, weight}[]` | 2 outcomes; 3 for Tri Attack's status sample |

And so is everything that had no home under the hook framing:

- **Volt Absorb's heal** — a transition with one outcome.
- **A berry firing** — a conditional transition with one outcome.
- **Motor Drive's +1 Spe, Flash Fire's volatile** — one outcome each.

**This dissolves the "effect channel" problem rather than solving it.** Handlers do not need to
return effects. An effect *is* a transition. Two earlier designs failed because they treated state
change as a special return value bolted onto a modifier system; state change is the primary thing,
and damage modifiers are a detail *inside* one transition.

## Does it compose? Worked through

Target shape:

```
resolveMove(s) = moveData(s)
  .flatMap(hitSequence)      // iterate the damage transition, with termination
  .flatMap(secondaries)
```

Two findings, both structural.

### Crit and damage rolls are one transition, not two

Crit is not a property of the resulting state — it is an input to damage. Today `critBranches` and
`damageRolls` are separate, multiplied together by hand in `advance`. As transitions they are a
single `State → Distribution<State>` producing 23×16 + 1×16 weighted damaged states.

That combined object is exactly what `REFACTOR.md` calls a **kernel** — its `~32 (damage, crit)`
entries. So the transition formulation and REFACTOR's kernel are the same construct arrived at from
two directions, which is strong evidence for both.

### Termination has no representation in `State`

The one real gap. A line of play can end mid-move — the move missed, or the target fainted — and
must not receive further hits. Today that is a side channel:

```ts
interface Step {state: State; count: number; finished: boolean; crits: number}
// key: `${finished ? 'x' : 'o'}${crits};${stateKey(state)}`
```

`finished` is not part of `State`, and it is prefixed into the merge key so a terminated branch does
not merge with a live one at the same state. A pure `State → Distribution<State>` cannot express
this: `flatMap` merges on `stateKey`, so a missed move and a landed-for-zero move would collapse
together and then wrongly receive another hit.

This is a real part of the domain, not a hack — move resolution terminates.

**Settled 2026-09-08: it lives in a resolution wrapper, not in `State`.** The transition operates on
a `Resolution`, not a bare state:

```
Resolution = {state: State; done: boolean; labels: Labels}
transition : Resolution → Distribution<Resolution>
```

with a projection to `Distribution<State>` at the end, `labels` landing on `Outcome.labels` where
they already go.

Three reasons, in order of weight:

1. **A transient flag on `State` leaks across turns.** `resolveTurns` carries resulting states into
   the next turn, so a `done` that is not explicitly stripped would mark every later turn finished.
   This is not hypothetical — the Fickle Beam `allOut` flag had exactly this failure mode, and is
   only correct because `resolveMove` restores the original move before accumulating. Putting a
   second transient in `State` re-opens a bug that was just closed.
2. **`Step` already is this wrapper.** `{state, count, finished, crits}` is `Resolution` plus a
   weight, hand-rolled. Formalising it removes a parallel structure rather than adding one.
3. **It gives per-resolution metadata a home.** `crits` is already there; `hits` is wanted;
   `REFACTOR.md`'s bucket tuple is `(hp, hits, crits, variantId)`, which is a packed `Resolution`.
   The two designs agree again.

`done` also subsumes the faint case, which is derivable from `state.target.hp <= 0` — but "missed"
is not derivable from any state, which is why the flag has to exist at all.

`hitCountBranches` then stops being a product and becomes what it always was — iterate the damage
transition, retiring mass at each step. The current `expansion ** (maxHits - hits)` padding exists
only to force a common denominator by hand; `flatMap`'s LCM removes the need for it.

## What this does *not* fix

Stated plainly, so the reframe is not oversold.

- **Merging does not get earlier.** `advance` already merges per hit via a keyed `Map`. The
  transition formulation is a structural unification, not a change in merge timing. An earlier
  claim in this conversation that it merges sooner was wrong.
- **Damage modifiers still need declared consultation.** Kind-A hooks live *inside* the damage
  transition, and `heatproof`-class bugs — a handler implemented but never consulted — remain
  possible there. The participation-table idea still applies, now scoped to one transition instead
  of the whole layer.
- **Reachability still needs asserting**, for the same reason.
- **The burn bug is untouched.** Burn is consulted at the wrong point with no category check; that
  is a staging error inside the damage transition and only differential tests catch it.
- **Performance is genuinely open.** The hand-rolled loop exists partly for speed —
  `REFACTOR.md` measures 46,961 `stateKey` builds and ~49% of runtime in keying for one Rock Blast.
  `flatMap` allocates a `Distribution` per step against the current `Map` churn; the shapes are
  comparable, but this must be measured, not assumed. REFACTOR's answer — integer buckets, packed
  keys, memoised kernels — applies far more easily to one uniform fold than to six bespoke loops.

## Open questions, before any mechanism is proposed

- [x] **Where does termination live?** ✅ Settled — a `Resolution` wrapper, see above.
- [x] **Does this replace `REFACTOR.md` phase 1?** ✅ **Yes, decided 2026-09-08.** Phase 1 was
      *"extract the kernel boundary — split damage derivation from state application"*, which is
      precisely what the transition draws. `REFACTOR.md`'s phase list has been rewritten: phase 1 is
      now this work and is **not** behaviour-preserving, while phases 2 and 3 survive with their
      content and success criteria intact.
- [ ] **Is `State.Pokemon` immutable?** `CLAUDE.md` documents it mutable and `Applier` mutates it,
      while `resolve.ts` spreads everywhere and treats it as immutable. `PLAN.md` has this open
      under "Builder outputs are immutable values". A transition returning new states makes the
      answer mandatory rather than academic.
- [ ] **Does `Applier` become the transition type, or get deleted?** It exists for state changes, is
      used only by `result.ts`, and has zero live implementations — Intimidate, its one example, is
      inside a block comment.
- [ ] **What is the transition's scope vocabulary?** Move data is chosen once per move, rolls happen
      per hit, secondaries once at the end. Nesting is required; how it is expressed is not settled.

## Progress, 2026-09-08

All six axes are migrated. `resolveMove` is now a composition:

```
moveData
  .flatMap(accuracy)
  .flatMap(hitCount → damage transition × maxHits)
  .flatMap(secondaries)
  → project to Distribution<State>
```

`Step`, `accumulateStep` and `advance` are deleted, and with them every piece of hand-rolled
denominator arithmetic — `expansion ** (maxHits - hits)` padding, `perResolution`, `dataScale`,
`common`, the `plans` precomputation and the `leastCommonMultiple` import. `flatMap` does all of it.

**Verified against a 12-case corpus** (multi-hit, Loaded Dice, move-data branches, Stamina, Focus
Sash, sub-100 accuracy, secondaries, past-horizon): identical as probability distributions, exact at
zero tolerance for 11 of 12. Only Population Bomb — the sole `exact: false` case — drifts, at ~1e-14
relative, which is the float-accumulation-order régime `REFACTOR.md` predicts.

**Two traps for whoever writes the phase 0 harness.** Compare **probabilities, not counts**:
`flatMap` ends in `normalize()`, so the denominator is an implementation detail and legitimately
changes (Population Bomb went 6.97e35 → 8.6e33). And **sort object keys before comparing** — label
insertion order changed and produced three phantom failures on the first run.

### Performance: better in the middle, worse at the tail

| | before | after |
| --- | --- | --- |
| Rock Blast | 129 ms | **88 ms** |
| Icicle Spear | 166 ms | **119 ms** |
| Aura Sphere | 0.49 ms | 0.6 ms |
| **Population Bomb** | **127 ms** | **474 ms** |
| `resolveTurns` Rock Blast ×10 | 270 ms | 313 ms |

The mid-size multi-hit cases got ~30% faster; the 10-hit case is 3.7× slower. The cause is a real
trade, not an accident: `advance` merged eagerly into a `Map`, keeping the working set small, while
a transition returns its branches unmerged and lets `flatMap` do the single merge. That avoids
keying every branch twice — worth ~20% on Rock Blast — but allocates a `Resolution` per branch
instead of merging on the way in. Population Bomb has the largest intermediate distribution, so it
pays the most.

**This is what `REFACTOR.md` phase 2 is for**: buckets of packed integers instead of `Resolution`
objects, `State` materialised only for survivors. The regression is expected to disappear there, and
should be measured rather than assumed.

## Sequencing

This **is** `REFACTOR.md` phase 1; that document's phase list has been rewritten to match.

1. ✅ Design the `Resolution` and transition types against all six axes.
2. ✅ Migrate `resolveMove` onto `Distribution.flatMap`, one axis at a time, differentially tested
   at each step.
3. Modifiers and consultation *inside* the damage transition, with the reachability assertion.
4. `REFACTOR.md` phase 0 characterization, on a corpus that is finally correct.
5. `REFACTOR.md` phases 2-3, behaviour-preserving against that baseline.

**Do not port the remaining ~47 unimplemented abilities before step 4.** They are the reason to do
this, not a prerequisite.

## Rejected designs

Kept because the reasons generalise.

- **A declared stage table** (stages as data, handlers registering against a stage). Restructured
  the trigger vocabulary, which is not what is broken: 20 of 24 hooks return `number | undefined`
  and that layer is already a uniform functional `(scope) => modifier`.
- **Stages plus an explicit `role` sub-key.** Water Bubble boosts its holder's Water moves *and*
  weakens incoming Fire, so the same entry is walked in both roles; the design reduced to
  reinventing the `onSource` prefix one level down.
- **An `onAbsorb` hook.** It had no trigger of its own — the same implicit coupling that killed
  `heatproof`. The immunity decision *is* the trigger, and `figyberry.onUpdate` already shows the
  correct pattern for state-conditioned firing.

All three were mechanism-first, and each was killed by a real ability it could not express. That is
why this document stops before proposing one.

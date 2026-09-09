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
- **Reachability asserting catches less than it sounds like.** A table of which participants each
  hook is consulted from will fail on a hook nothing consults — the four orphans, and `onEat` /
  `onUpdate` being unreachable from tier 2. It would **not** have caught old-`heatproof`, which
  declared `onBasePower`: a hook that *is* consulted, just from the attacker only. `technician` and
  `heatproof` are both `Abilities` entries and only the hook name distinguishes them, so **polarity
  is not checkable from data at all.** Worth building — it is cheap and catches a real class — but
  the ability/item differential sweep against `@pkmn/sim` is the load-bearing net, and it is what
  found six of the seven defects.
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

## Berries fire between hits — measured, not assumed

Established against the sim on 2026-09-08, because the answer decides where the transition goes.

| | start | sim final HP |
| --- | --- | --- |
| Population Bomb into Blissey, no berry | 499/714 | **0** — faints |
| same, target holding Sitrus | 499/714 | **127** — survives |

End-of-move healing cannot resurrect a fainted Pokémon, so the heal must land mid-sequence. The
arithmetic agrees exactly: ~55 per hit, the 50% threshold crossed after hit 3 (499 → 334), heal 178
→ 512, seven more hits → 127.

Note that the obvious experiments do **not** distinguish the two models: with no faint and no cap,
`start − damage + heal` is the same whether the heal lands in the middle or at the end. Only a case
where the berry prevents a faint separates them.

So the berry transition belongs **inside** the hit sequence, after each damage step — not after the
move. That is cheap to express now that the hit loop is a `flatMap` chain.

### The open fork before this can be built

`onUpdate` and `onEat` are typed `Handler<Context.Pokemon>` like every other item hook, and the
berry implementations read `pokemon.ability?.id` and `pokemon.item?.onEat` — reified Context shapes.
But the natural place to run them is inside the damage transition, which holds a `State`, and
building a `Context` per branch would mean ~32 of them per hit.

The tempting answer — *"kind-E triggers take `State.Pokemon`, kind-A modifiers take
`Context.Pokemon`"* — **was proposed and rejected on 2026-09-08.** The resist berries kill it:

```js
chartiberry: {
  onSourceModifyDamage(damage, source, target, move) {
    if (move.type === 'Rock' && target.getMoveHitData(move).typeMod > 0) {
      this.add('-enditem', target, this.effect, '[weaken]');   // a state effect
      return this.chainModify(0.5);                            // and a modifier
    }
  },
}
```

Charti, Shuca and Occa need `Context` data — move type and `typeMod` — so they cannot take
`State.Pokemon`; and they consume the item, so they must emit a state effect. **One handler, both
kinds.** `Focus Sash` (`onDamage`) is the same shape and is currently hardcoded inside `endures()`;
`Air Balloon` (`onDamagingHit`) is the mirror image, a pure effect with no modifier. `Custap Berry`
is a third shape again: a state-conditioned trigger whose effect is turn order rather than damage.

**So the effect channel is orthogonal to scope.** Any handler, whatever data it needs, may need to
emit an effect, and the two questions must not be answered together.

### Direction: widen the return type, not the scope

```ts
type Contribution = number | {mod?: number; effect?: Effect};
```

Existing handlers keep returning plain numbers and are untouched. Charti returns
`{mod: 0x800, effect: {consumeItem: true}}`; Air Balloon returns `{effect: {consumeItem: true}}`
with no mod; Sitrus's `onUpdate` returns `{effect: {heal: 178, consumeItem: true}}`. One scope, pure
functions, no mutation, and it stays open to effects from hooks nobody has classified yet.

**Trap to settle before building this.** `critExpansion` calls `damageRolls` purely to count
`.length`, and `damageRolls` calls `calculateDamage`. If handlers emit effects during that probe, an
item is consumed by a measurement. Effect collection must either run only on the real path or be
idempotent — decide explicitly, because the failure mode is a silently wrong answer.

## Idea, not yet decided: one scope for every handler

Raised 2026-09-08, written down rather than acted on.

The four tables take three different scope shapes today, and one of them has already given up:

```
Moves:      Handler<{gen, attacker?, target?, move, field?}>   // a Context in all but name
Conditions: Handler<Context.Pokemon> | Handler<Context>        // a union
Abilities:  Handler<Context.Pokemon>
Items:      Handler<Context.Pokemon>
```

`Context.Pokemon` is not a narrow scope — it already carries `.move`, `.side` and `.gen`. It is an
*arbitrary* subset that happens to exclude `field` and the opposing Pokémon.

Measured against the 62 unimplemented damage-relevant abilities: 4 need field (Solar Power, Hadron
Engine, Orichalcum Pulse, Grass Pelt), 9+ need the foe (the Ruin quartet, Merciless, Plus/Minus,
Berserk), 2 need turn data that does not exist. **Treat 15 as a floor, not a count** — the bucketing
keyed on Showdown's parameter names, which are inconsistent, and Rivalry
(`attacker.gender === defender.gender`) was demonstrably missed.

So the case for unifying on `Context` is consistency rather than headcount, and the cost is low for
the same reason: most of the data is already reachable.

**What it would not fix, listed because these look similar and are not:**

- **Polarity.** A unified `Context` still cannot say whether the holder is attacking or defending.
  That stays with hook naming, or with an explicit `self` reference in the scope — which is the
  cleanest place it could eventually live, and would let `onSource*` stop being a convention.
- **The effect channel.** Orthogonal, as the Charti case established above.
- **Analytic, Stakeout, Supreme Overlord.** These need *model* extensions — turn order, switch-in
  tracking, party faint count. `Supreme Overlord` reads `effectState.fallen`; no scope change
  conjures that data into existence.

## The `State` / `Context` split does not describe what the code does

Raised 2026-09-08. `CLAUDE.md` documents the layering as:

```
state.ts        outside layer — plain, serializable, what a UI/API binds to
context.ts      inside layer — State reified with handler fns bound on
```

The engine does not work that way. `resolve.ts` mentions `State` 26 times and `Context` twice, and
the two `Context` mentions are a short-lived argument to `damageRolls`. **The internal tier-2 loop
threads the documented *outside* type through every branch**, and builds a throwaway `Context` per
bucket purely so the damage formula has something to read. `Context` is also not something the
engine can advance — you cannot apply damage to it — so it is not "the internal form" in any useful
sense; it is an evaluation scope for handlers.

Looked at properly there are **four** roles, and the two names cover them badly.

| # | role | today | health |
| --- | --- | --- | --- |
| 1 | the partial spec a caller writes — defaults unresolved | `PokemonOptions` / `MoveOptions` / `FieldOptions` / `SideOptions` + `parse.ts` | real, but unnamed and scattered across option bags |
| 2 | the fully built world — field, sides, teams, pokemon, move, every default resolved | `State` | **already correct**; `createPokemon` is ~200 lines of exactly this |
| 3 | per-hit evaluation — handlers bound, derived values computed, provenance tracked | `Context` | not a *layer*; a computed view, rebuilt per bucket |
| 4 | the engine's working form — cheap, mergeable, advanced hit by hit | `Resolution`, wrapping a `State` | right seam, wrong payload |

Two corrections to the obvious reading. **`State` is not a shell** — it is role 2 and it does that job
well; the shell is role 1, which already exists as option bags. And **`Context` is not "the internal
form"** — it adds exactly three things over `State`: reified handler functions, `Relevancy`
provenance, and computed values (types after tera, stats after item modifiers, move `effectiveness`,
`basePower` after modifiers). Reification is not even required for dispatch: `computeModifiedSpeed`
looks handlers up directly with `Abilities[pokemon.ability.id]`.

So the damage is that roles 3 and 4 were both called "internal", role 4 was never given a type, and
`State` was pressed into being role 4 as well as role 2.

**The naming problem and the remaining performance problem are the same problem.** Every branch
allocates a `State` and a `State.Pokemon` — serializable boundary objects — as internal scratch, and
that allocation is the last structural cost in `REFACTOR.md` phase 2 (`withDamage` at 11.1% of the
profile plus its share of GC). The dense buffer described there *is* the act of giving role three
its own representation.

`Resolution` is already the right seam — it is the engine's working wrapper, carrying `done`,
`landed`, `remaining` and labels. It just holds the wrong payload: a `State` where it wants packed
fields. So the fix is not a rename; it is finishing the thing `Resolution` started, at which point
`State` stops appearing in the hit loop at all and the documented layering becomes true.

### Renaming — options, not a decision

Names to settle before any of this is built, because they are cheap to argue about now and expensive
to change later.

| role | candidates | notes |
| --- | --- | --- |
| 1 spec | `Spec`, `Input`, `Draft`, keep the `*Options` bags but name the aggregate | `parse.ts` already treats these as one concept without naming it |
| 2 built world | keep `State`, or `Battle` / `Scenario` / `Setup` / `World` | `Battle` collides conceptually with `@pkmn/sim`'s `Battle`, which this project is careful not to be |
| 3 evaluation | `Evaluation`, `Frame`, `Reading`, or keep `Context` scoped to what it is | its problem is the layout comment, not the word itself |
| 4 working form | keep `Resolution` | already the right name; only its payload is wrong |

**Breaking changes to `@pdz/calc` are acceptable** (confirmed 2026-09-08). It is not publicly
consumed; the only live user is the server's `speedchart.ts`, which imports `State` and
`computeStats`, and that can be changed in the same pass. So no deprecation path is needed and no
name is pinned by compatibility — design for the right shape and update the one call site.

`PLAN.md` already carries a related open decision under the end-user API — *"Naming — the root
container is not `Field`"* — so this should be settled in the same pass rather than twice.

## The shape it should be

### The organising idea: split every participant by who owns the field

A `State.Pokemon` has 25 fields. `withDamage` copies all 25 to change four:

```ts
const pokemon: State.Pokemon = {...defender, hp, boosts, item, hurtThisTurn};
```

That runs once per branch — around 430,000 times in one Population Bomb resolve, each also
allocating a fresh `State` and sides array. **The waste is that one object mixes what the caller
fixed with what the battle changes.** Split it:

| | fields | lifetime |
| --- | --- | --- |
| **Build** — what the caller specified or that follows from it | `species`, `level`, `weighthg`, `gender`, `happiness`, `nature`, `evs`, `ivs`, `stats`, `maxhp`, `types`, `addedType`, `teraType`, `terastallized`, `position`, `ability` | fixed for the whole calculation; **shared by reference, never copied** |
| **Vitals** — what a move can change | `hp`, `boosts`, `item`, `status`, `statusState`, `volatiles`, `hurtThisTurn`, `switching`, `moveLastTurnResult` | varies per branch; the only thing a branch copies |

Sixteen immutable, nine varying — and inside a single move's hit loop only four of the nine move at
all, which is what `VARIES_DURING_HITS` already measures. A branch then copies four numbers instead
of twenty-five fields plus two containers.

`ability` sits in Build because nothing in this engine changes it; Trace and Skill Swap would move it
across if they are ever modelled. `pp` would join Vitals when it is modelled at all.

### The split is decided by *pinning*, not by which field it is

The table above is the **default** split, for a caller who specified nothing beyond the participants.
The real rule is:

> **Anything the caller pinned is fixed for the whole calculation. Everything they left open is what
> branches.**

A pin collapses an axis. That is not a new idea to bolt on — **the code already does it in three
unrelated places, with no shared name**:

| pin | effect | where |
| --- | --- | --- |
| `move.crit` / `move.willCrit` | `critBranches` returns one branch instead of 23/1 | `resolve.ts` |
| `move.hits` | `hitCountBranches` returns one branch instead of 2-5 | `resolve.ts` |
| `magnitude` | *required* today, collapsing an axis that was never built | `state.ts` |

Naming it makes every axis pinnable by the same mechanism, and turns questions users actually ask
into ordinary inputs rather than features:

- "what if it crits and rolls max?" → pin `crit` and the damage roll
- "assume it hits" → pin accuracy
- "what if Fickle Beam goes all out?" → pin the move-data branch
- "it's already at +2" → pin `boosts`, which stays *branchable* afterwards because Stamina can still
  move it

That last one matters: pinning sets a starting value; it does not always freeze the field. `crit` and
`hits` are consumed by an axis and collapse it, whereas `boosts` and `hp` are Vitals with a specified
starting point. Both are pins; they differ in whether an axis reads them.

### The round trip

The results are the same shape as the input — a `Distribution<Battle>`, each outcome a `Battle` and a
probability. **The outputs must be valid inputs**, because that is exactly what `resolveTurns` does:
it feeds each resulting `Battle` back in as the next turn's starting point. Anything the engine
leaves on an output state that a fresh input would not carry is a bug, which is the failure the
Fickle Beam `allOut` flag would have caused had the move not been restored before accumulating.

### The pipeline

Two types at the boundary, two inside. An earlier draft of this drew them as a five-box flow, which
made it look like there were four boxes too many — `Battle` appears at both ends because
`resolveMove` takes one and returns a distribution of them, and buckets recur because the hit loop
is a loop.

```
Spec ──build──▶ Battle ──compile──▶ Frame        invariants of this resolve, built once
                                      +
                                    Bucket ⟲     Vitals + counters + weight; branches and merges
                                      │
                                 materialize ──▶ Distribution<Battle>
```

### What the internal objects actually look like

Sketch, not a signature. Three things, and only the third is per-branch.

**Build — immutable, one per participant per resolve, shared by reference.**

```ts
interface Build {
  species: Specie;
  level: number;
  weighthg: number;
  gender?: GenderName;
  happiness?: number;
  nature?: NatureName;
  evs?: Partial<StatsTable>;
  ivs?: Partial<StatsTable>;
  stats: StatsTable;
  maxhp: number;
  types: readonly TypeName[];
  addedType?: TypeName;
  teraType?: TypeName;
  terastallized: boolean;
  ability?: ID;
  position?: number;
}
```

Never copied. Two of these — attacker and defender — plus the field and the base move data live on
the `Frame` for the whole resolve.

**Vitals — the volatile record.** Everything a move can change:

```ts
interface Vitals {
  hp: number;
  boosts: Partial<BoostsTable>;
  item?: ID;
  status?: StatusName;
  statusState?: {toxicTurns?: number};
  volatiles: {[id: string]: {level?: number}};
  hurtThisTurn: boolean;
}
```

**But `Vitals` is not what branches.** Split it again: `hp` is a dense integer, and everything else
is *categorical* and takes very few distinct values in one resolve — usually one, up to about eight
against Stamina or a consumable item. So the categorical part interns to a small id, and a branch is:

```ts
type Bucket = number;
// ((((vitalsId * hitSpan + remaining) * hitSpan + crits) * 4 + flags) * hpSpan) + hp
```

`VariantIds` already does this for three of the categorical fields; extending it to `status`,
`statusState` and `volatiles` covers the rest.

**Frame — everything invariant, plus the tables and the scratchpad.**

```ts
class Frame {
  readonly attacker: Build;
  readonly defender: Build;
  readonly field: Field;
  readonly move: MoveBuild;
  readonly vitals: VitalsTable;   // id ↔ categorical record, grown lazily
  readonly scratch: Scratch;      // derived values, overwritten per bucket
}
```

So the mutable/immutable line is: **`Build`, `Field` and `MoveBuild` are immutable and shared;
`Scratch` is mutable and reused; buckets are numbers and are neither.** Nothing is allocated per
branch — advancing a bucket reads `hp` and `vitalsId` out of an integer, computes the new ones, and
writes an integer back.

The transition mechanic — `endures`, Stamina, `hurtThisTurn` — lives **once**, over
`(vitalsId, hp, damage) → (vitalsId', hp')`, using `VitalsTable` to look up and insert categorical
records. That is what stops it being written twice: `Battle` is produced *from* buckets at
materialisation, so there is no second implementation on the boundary type.

### `Result` is a different tier, and should go

`Result` is not an alternative shape for the same answer — it is the **tier-1 legacy path**:

```ts
class Result {
  readonly hits: [HitResult, ...HitResult[]];
  readonly damage: NumberDistribution;   // a distribution over damage numbers
  private cache: {range?; recovery?; recoil?; crash?; relevant?};
}
```

It answers "how much damage", in the shape `@smogon/calc` answers it — a damage range plus a text
description — which is exactly what `PLAN.md` says this project exists *not* to be. `resolveMove`
answers the actual question, "what states result and with what probability", and returns
`Distribution<State>`.

So `Result` should not be reshaped to match the new input; it should be **replaced by the
distribution**, with the things people genuinely want from it becoming derived views over it:

| `Result` gives you | becomes |
| --- | --- |
| `damage` / `range` | a projection of the distribution onto damage |
| `recovery`, `recoil`, `crash` | outcome fields, once those mechanics are modelled at all |
| `toString()` / `text()` | a formatter over a distribution |
| `relevant` (`Relevancy`) | provenance carried on the resolve, not the result |

It is already half dead: `PLAN.md` records `Result.toString()` throwing for every state since the
Slice B reshape, and `mechanics/index.test.ts` is one of the two baseline test failures because of
it. `calculate()` is the entry point that returns it, so retiring `Result` and pointing `calculate()`
at the distribution is the same piece of work as the rename.

### Why each piece is that way

**`Spec` becomes first-class.** It already exists as `PokemonOptions` and friends; naming it makes
the validation boundary explicit and is the same work `PLAN.md` wants for its constructor API. It is
the *partial* thing — the only layer where a field may be absent.

**`Battle` is `State` with its participants split into Build and Vitals.** It stays plain and
serializable, and this is the point of the exercise: once buckets exist, the boundary type is free
to be shaped for readers instead of quietly optimised for iteration. It is built at the start and at
materialisation, and nowhere in between.

**`Frame` replaces `Context`, and is built once per resolve rather than once per bucket.** `Context`
today mirrors the entire participant tree — `Context.Move`, `Context.Pokemon`, `Context.Side`,
`Context.Field` — so that handlers can be called as methods. But its three jobs do not need that:

- handler binding → direct table lookup, which `computeModifiedSpeed` already does
- derived values (`effectiveness`, `basePower` after modifiers, stats after item modifiers) → a flat
  scratchpad, **overwritten per bucket rather than reallocated**, since its lifetime is one damage
  computation
- `Relevancy` → written by whatever invokes the handler

This also settles the earlier open question about handler scope: **`Frame` is the full context, and
every handler takes it.** The field/foe ceiling disappears, `Context.Pokemon`'s arbitrary subset
disappears, and the four tables stop having three different scope shapes.

**`Bucket` is Vitals plus the counters, carrying its weight.** It is what branches. Because Build is
shared by reference and Vitals is small and mostly primitive, a bucket is packable into a number —
which `packHitKey` already does for the four fields that vary inside a hit — with side tables for
`boosts` and `item` ids. No object is allocated per branch.

The four roles map onto these as: role 1 is `Spec`, role 2 is `Battle`, role 3 is `Frame`, role 4 is
`Bucket`. Two of them cross the public API; two never leave the engine.

### How this kills the duplicate-`withDamage` hazard

The hazard was that a numeric expansion path would restate `endures`, the Stamina boost and
`hurtThisTurn` alongside the `State` version. The resolution is to **not keep two versions**: move
the mechanic *down* onto `Bucket`, make it the only implementation, and derive `World` from buckets
at materialisation rather than the reverse. Today's direction of travel — mechanics written against
`State`, buckets bolted on beside them — is what forces duplication.

### What this costs, stated plainly

- **The scratchpad is mutable.** Confined to one object with a single-computation lifetime, but the
  engine currently leans on immutability, and `CLAUDE.md` records a `sideKey` memo whose soundness
  depends on states not being mutated after keying. That interaction needs settling, not assuming.
- **`Relevancy` per-bucket versus per-resolve** is still open (`REFACTOR.md` flags it). A shared
  scratchpad pushes toward per-resolve, which changes what sensitivity output means.
- **Packed buckets need a size cap** with a fallback, as sized in `REFACTOR.md`.
- It is a rewrite of `context.ts` and `resolve.ts`, not an increment. The 19 phase 0 snapshots are
  the check that it changes no answer, and they are worth more here than anywhere else so far.

### Open questions

- [ ] **Is role 1 worth making first-class now, or with the constructor API?** Same work either way.
- [ ] **Does `Frame` hold one scratchpad or one per participant?** Affects whether handlers can be
      called re-entrantly.
- [ ] **Where does `Relevancy` attach** once there is no per-bucket object to hang it on?

## Sequencing

This **is** `REFACTOR.md` phase 1; that document's phase list has been rewritten to match.

1. ✅ Design the `Resolution` and transition types against all six axes.
2. ✅ Migrate `resolveMove` onto `Distribution.flatMap`, one axis at a time, differentially tested
   at each step.
3. ✅ The reachability assertion (`handlers.test.ts` + `CONSULTS`) and the differential coverage
   sweep (`coverage.test.ts`). Driving consultation *from* the table, rather than declaring it
   alongside hand-written call sites, is still open.
4. ✅ `REFACTOR.md` phase 0 characterization — `characterization.test.ts`, 19 scenarios, verified to
   detect a deliberate perturbation.
5. The effect channel and berries. **Blocked on the scope question above**, not on the effect
   design: `onUpdate` is typed `Handler<Context.Pokemon>` but has to run inside the damage
   transition, which holds a `State`.
6. `REFACTOR.md` phases 2-3, behaviour-preserving against the phase 0 baseline.

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

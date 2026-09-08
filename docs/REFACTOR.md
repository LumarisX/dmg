# Resolve Refactor Plan

How `resolveMove` / `resolveTurns` get from "correct but quadratic" to "correct and linear",
without ever changing an answer along the way.

Read [`PLAN.md`](PLAN.md) first — it holds the project goal and the phase 0-4 roadmap. This
document covers one piece of work: the representation and caching change inside tiers 2 and 3.

## Why

Tier 3 is unusable on the general path. `resolveTurns` runs a full `resolveMove` per carried
state per turn, so a 2-5 hit move producing ~500 outcomes on turn 1 needs ~500 resolves on
turn 2. `projectTargetHp` dodges this when it can, but it is a gate: when `damageIgnoresTargetHp`
says no, the cost goes straight back to the full product.

The gate is also maintained by hand. `TARGET_HP_SENSITIVE_ABILITIES` / `_ITEMS` / `_MOVES` were
derived by grepping the handler tables, and two of their entries currently guard mechanics that
do not fire at all (see [Findings](#findings)). A handler added without updating those sets
silently returns a wrong answer.

## Measurements

Taken 2026-09-06 against `build/cjs`, Cloyster vs Blissey unless noted.

| | |
| --- | --- |
| `resolveMove` Rock Blast | 145.2 ms, 513 outcomes |
| `resolveMove` Icicle Spear | 152.8 ms, 405 outcomes |
| `stateKey` calls per Rock Blast resolve | 46,961 at ~2.62 µs — **~49% of runtime** |
| `calculateDamage` calls per Rock Blast resolve | 2,858, yielding **10** distinct kernels |
| `Reification.of` calls per Rock Blast resolve | 1,429 |
| Branch work surviving the merge | **1.09%** |
| Stamina defender | 619 outcomes across 5 distinct Def levels |

The `stateKey` share was measured under per-call `hrtime` instrumentation, which inflates the
absolute total to ~253 ms; treat the 49% as the load-bearing figure, not the 253.

Two conclusions. First, roughly half the time goes into keying states that are then discarded —
99% of branches merge away, yet every one of them allocates a `State` plus a `State.Pokemon` and
builds a ~500-character key. Second, the per-state kernel derivation is pure repetition.

## Now vs proposed

### Work inside one `resolveMove`

Instrumented counts for Rock Blast, Cloyster vs Blissey. The "proposed" column is what the
target shape reduces each line to.

| operation | now | proposed | why |
| --- | --- | --- | --- |
| `calculateDamage` calls | **2,858** | **10** | only 10 distinct `(hit, crit)` kernels exist — the other 2,848 re-derive one of them |
| `Reification.of` (Context builds) | 1,429 | 10 | one per kernel, not one per step per hit |
| `stateKey` builds | 46,961 | 513 | keying moves to packed integers; strings only at materialization |
| `State` + `State.Pokemon` allocations | ~46,961 | 513 | buckets are integers; States built only for survivors |
| outcomes | 513 | 513 | unchanged — same answer, same counts, same crit breakdown |

The redundancy is not marginal. Rock Blast derives the damage kernel 2,858 times to obtain 10
distinct results, a factor of **285**. Icicle Spear is 3,094 calls for the same 10 kernels.
Even single-hit Aura Sphere does 4 calls for 2 kernels.

The 10 is exactly `5 hit positions × 2 crit branches` — hit position matters because a
`basePowerCallback` may read it, crit because it scales before the rolls. Nothing else in Rock
Blast varies, which is why the count collapses so far.

### The hit loop

Now, per step, per hit — `advance()` in `resolve.ts`:

```
for step of current:                        // Map keyed by "o" + crits + ~500-char stateKey
  context = reification.of(forHit(step.state, hit))     // build a Context from the State
  for accuracy of perHitAccuracy:
    for branch of crits:                    // 2
      for damage of damageRolls(context, branch.crit):  // recomputes calculateDamage
        accumulateStep(next, withDamage(step.state, damage), ...)
        //             ^ allocates State + State.Pokemon, then builds a string key
```

Proposed, per bucket, per hit:

```
table = kernelFor(context, hit, regime)     // memoized; ~32 (damage, crit) entries
for bucket of buckets:                      // Map keyed by a packed integer
  for (damage, crit) of table:
    hp'      = max(0, bucket.hp - damage)
    variant' = intern(delta(bucket.variant, damage))    // identity for a vanilla move
    add(next, pack(hp', bucket.hits + 1, bucket.crits + crit, variant'))

materialize States for the surviving buckets, once, at the end
```

The inner statement goes from *allocate two objects and build a 500-character string* to
*subtract, pack, add*.

### Across turns

`resolveTurns` is where this compounds, because the general path calls `resolveMove` once per
carried state per turn:

| | now | proposed |
| --- | --- | --- |
| turn 2 of Rock Blast | ~513 resolves × 145 ms | one bucket sweep |
| kernel derivations, 10 turns | ~513 × 2,858 × 10 | 10, reused throughout |
| `damageIgnoresTargetHp` gate | required, or it is unusable | unnecessary |
| behaviour when the gate says no | falls back to the full product — hours | no cliff; Σ grows to 2-3, not 513 |

Today that cliff is avoided by `projectTargetHp`, which is exact only under the conditions
`damageIgnoresTargetHp` checks. The proposed shape makes the general path fast enough that the
gate stops being load-bearing.

### What does not change

- Merging stays keyed on resulting state; an irrelevant crit still collapses to one outcome.
- Multi-hit stays iteration, never convolution — early termination and between-hit state are
  still modelled hit by hit.
- The `@pkmn/sim` differential tests remain the definition of correctness for tier 1.
- Output is identical at every phase: same states, same counts, same `(hits, crits)` breakdown.

## Complexity

With `H` hits, `S` distinct reachable states, `K ≈ 32` branches per hit (2 crit × 16 rolls, times
accuracy), `T` turns, and `Σ` distinct damage kernels:

| | now | target |
| --- | --- | --- |
| `resolveMove` | O(H·S·K) × ~2.6 µs/branch | O(H·S·K) × ns, plus Σ kernel derivations |
| `resolveTurns` | **O(T·H·S²·K)** | **O(T·H·S·K)** |
| `State` allocations | O(H·S·K) | O(S) |

`S` is the size of the answer, so Ω(S) stands; `K` and `H` are intrinsic to the mechanics. The
target is the floor.

## Findings

### The memo belongs at the per-hit kernel, not the whole move

The first instinct — cache the whole-move transition table and reuse it across carried states —
does not survive contact with multi-hit moves.

| move | can KO mid-sequence? | distinct whole-move tables |
| --- | --- | --- |
| Aura Sphere (single hit) | n/a | 1 over 352 HP values |
| Rock Blast, 0 Atk EVs vs Bold Blissey | no | **1** over 26 sampled HP values |
| Rock Blast, 252 Atk vs Blissey | yes | **29 of 29** sampled HP values |

Early termination is the *sole* source of HP-dependence for this move class: when the move
cannot KO, the whole-move table is HP-independent; when it can, essentially every starting HP
gets its own table because which hit lands the KO changes with HP.

But each individual hit's damage kernel is still HP-independent — nothing in Rock Blast reads
target HP. What depends on HP is only *whether the sequence stops*. So the memoizable unit is
the per-hit kernel, and the absorption loop around it must be cheap enough to re-run per bucket.

That is why the caching change and the representation change are one refactor and not two.

### Ordering is not exploitable

Crits on hits 1-2 and crits on hits 3-4 usually produce the same total and merge. They are not
interchangeable in general:

- **Stamina** raises Def on every hit, so a crit on hit 1 lands against +0 Def and a crit on
  hit 5 against +4 Def. Same multiset, different total. Implemented today.
- **Focus Sash / Sturdy** only trigger at full HP, so only hit 1 can spend them.
- **Berries.** Target at 100/100, Sitrus heals 25 at ≤50%, hits of 40 and 60: `60 then 40` heals
  and ends at 25 alive; `40 then 60` never crosses the threshold before the second hit and ends
  at 0. Same multiset, opposite outcome.

Consequence: `(hits, crits)` is a sound output *label* — orderings that land on the same state
merge on their own, orderings that diverge stay separate — but exchangeability must never be
used to enumerate combinations instead of permutations. Keep iterating per hit.

### Two guarded mechanics do not fire

**Corrected 2026-09-08: the Sitrus half is not a coverage gap, it is a dead hook.** `onEat` is
declared, implemented for two berries (`items.ts:633`, `:1826`) and **never invoked anywhere**, so
Sitrus cannot be consumed under any input. See [`PIPELINE.md`](PIPELINE.md). The conclusion below —
that HP dependence should be derived from the handlers rather than a central list — still stands,
but do not treat the 0% as evidence about the gate.

- `sitrusberry` is in `TARGET_HP_SENSITIVE_ITEMS`, but Rock Blast taken to 0 HP consumed it in
  **0%** of outcomes.
- `multiscale` is in `TARGET_HP_SENSITIVE_ABILITIES`, but Dragonite at full HP produced the same
  kernel as at 385 HP.

Both are coverage gaps rather than bugs in the gate, and both are arguments for deriving HP
dependence from the handlers themselves rather than a central list.

## Target shape

```
kernelFor(context, hitNumber, regime) -> Table      // ~32 (damage, crit) entries, memoized
resolveMove  -> numeric absorption loop over buckets, States materialized only at the end
resolveTurns -> the same loop, more iterations
```

A **bucket** is `(hp, hits, crits, variantId)`. The first three are integers. `variantId` interns
the categorical part of the state — boosts, consumed item, status, volatiles — into a side table.

For a vanilla move there is exactly one variant, so the hit loop touches three integers per
bucket and allocates nothing. For a Stamina defender there are six variants (Def +0..+5), so six
interned records for the whole resolve instead of one `State` per branch.

Variants are interned from whatever actually changed, so there is no hardcoded field list and no
fallback path to keep in sync.

## Decisions

### 1. Bucket tuple and completeness — *recommended*

The mutable set during the hit loop is small: `withDamage` writes `hp`, `boosts` (Stamina),
`item` (Sash consumed) and `hurtThisTurn`; `applySecondaries` writes `status` / `boosts` /
`volatiles` once at the end.

Rather than hardcode that list, make the delta record an **exhaustive mapping over
`State.Pokemon`'s keys**, so adding a field without handling it is a compile error. This is the
same idiom `handlers.ts` already uses for `HANDLER_FN_KEYS`, where a mapped type over
`keyof Handler<unknown>` makes an unlisted hook fail to compile.

Stamina is the cheapest test that this works: a tuple omitting `boosts` merges states with equal
HP and different Def, which still sums to 1 and still looks plausible. Only exact comparison
against the baseline catches it.

### 2. Memo key and validation — *recommended*

Two rules.

**Bias the key broad.** An over-approximate memo key costs cache misses; an under-approximate one
silently corrupts. Always err toward including more in the key, then narrow only with evidence.

**Validate by recomputation, not by audit.** A debug flag recomputes each kernel from scratch and
asserts equality against the cached one. Run it over the whole corpus during phases 1-3. This
gets the confidence that a `Relevancy` read-set audit would give, without requiring every handler
read to be provably instrumented first.

For the regime — the HP predicates a kernel depends on (Multiscale at full, Brine at ≤50%) —
have each handler declare its own, and derive the regime from the handlers actually present on
the participants. That is what retires `TARGET_HP_SENSITIVE_*`: HP dependence becomes per-handler
data instead of a central list, which is also what the "nothing hardcoded that a mod should be
able to change" rule in `CLAUDE.md` requires.

### 3. Crit and hit labelling — *settled*

Per-move `(hits, crits)`, not cumulative across turns. `hits` means hits that actually connected,
not the intended count from `hitCountBranches` — the two differ when a move KOs early or a
`multiaccuracy` hit misses.

Bounded cost: with `crits ≤ hits ≤ H` that is at most `(H+1)(H+2)/2` = 21 combinations for a
5-hit move, and fewer surviving buckets in practice because different `(hits, crits)` usually
already land on different HP.

Crit counts already ship — `Outcome.crits` is populated by every `resolveMove`, verified against
a closed-form binomial mixture to 12 decimals. `hits` is the remaining half.

## Shapes this refactor must account for before phase 0

**This refactor is deliberately deferred until the correctness census is accounted for** (decided
2026-09-08, see `PLAN.md`). The reason is not caution about breaking things — every phase here is
behaviour-preserving by construction. It is that this is a **representation** change, and the bucket
tuple, the kernel key and what `variantId` interns are all determined by *what can vary*. Designing
them against a corpus that excludes the varying shapes produces a representation that fits today and
needs surgery later, and "behaviour-preserving" gives no protection against that.

Worse, phase 0 freezes a baseline that phases 1-3 must prove identical against. The census found a
dozen answers that are silently wrong today; characterizing them pins them as correct for three
phases.

The shapes below are known and outstanding. Two of them contradict a sizing assumption made above:

- **A damage kernel is not always 16 rolls × 2 crit branches.** `Psywave`'s `damageCallback` is
  `random(50, 151) * level / 100` — 101 equally likely values, so its kernel is ~202 entries, not
  ~32. `calculateDamage` already returns `number | number[]` and `damageRolls` already unwraps
  either, so the numeric loop must stay agnostic to the roll count. **Do not bake 16 into the kernel
  table, the memo key, or the bucket packing.**
- **`Moves.<id>.branches` is a static array today and will become a function of the move and
  attacker**, the way `hitCountBranches` already is — `Magnitude` branches only when the caller has
  not pinned `move.magnitude`, and `Shell Side Arm` only on an exact physical-vs-special tie. Read
  the branch list through `moveDataBranches()` rather than touching `.branches` directly, so the
  change lands in one place.
- `Tri Attack` and `Dire Claw` pick a status with `sample([...])` inside the secondary's `onHit`;
  fixing them multiplies `secondaryBranches` by 3 for those moves. That is the one deferred shape
  this refactor genuinely does not need to plan for, since `applySecondaries` already runs once at
  materialization rather than inside the hit loop.
- **`resolveMove` is about to start reporting unmodelled effects rather than silently ignoring
  them** (`PLAN.md`, decided 2026-09-08). That changes its output — which is the phase 0 baseline —
  for every state whose attacker or target carries an ability or item our tables lack, currently 67
  abilities and 100 items in gen 9. Land the warning first, or phase 0 characterizes a corpus that
  is about to change under it.

## Phases

**Rewritten 2026-09-08.** Phase 1 was absorbed into [`PIPELINE.md`](PIPELINE.md), and the ordering
changed with it: correctness work now comes *first*, because phase 0 freezes a baseline and the
census found a dozen answers that are silently wrong. Phases 2 and 3 are unchanged in content and
keep their success criteria.

**Only phases 2 and 3 are behaviour-preserving.** Phase 1 changes answers by design; it is verified
against the `@pkmn/sim` oracle rather than against a self-baseline.

### Phase 1 — transitions (replaces "extract the kernel boundary")

Was: *"split damage derivation from state application. No representation change, no memoization.
Prove identical."*

That boundary is exactly what a weighted state transition draws, so the work is now
[`PIPELINE.md`](PIPELINE.md): make `State → Distribution<State>` the primitive, fold the six
hand-rolled branch axes onto `Distribution.flatMap`, and give termination and per-resolution
metadata a home in a `Resolution` wrapper.

Two of this document's own findings arrive at the same construct from the other direction, which is
why the merge is safe:

- **The kernel is the damage transition.** Crit and the 16 rolls are one transition producing
  23×16 + 1×16 weighted states — the `~32 (damage, crit)` entries measured above.
- **The bucket tuple is a packed `Resolution`.** `(hp, hits, crits, variantId)` is
  `{state, done, labels}` with the state flattened.

Not behaviour-preserving: it makes dead handlers fire. Verified against the oracle, differential per
axis as each is migrated.

### Phase 0 — characterization harness *(now after phase 1)*

Snapshot `resolveMove` / `resolveTurns` output — states, counts, crit breakdowns — over a corpus:
every existing test case, plus randomized states from the generator already sitting in
`src/test/helpers/`. Stamina, Focus Sash and a `multiaccuracy` move are required fixtures.

**Runs after phase 1, not before.** Characterizing first would pin a dozen known-wrong answers as
"correct" for the remaining phases. Nothing after this starts until it is green and reproducible.

### Phase 2 — numeric inner loop

Buckets replace `Resolution` in the hit loop; `State` is materialized only for surviving outcomes.
Prove identical against the phase 0 baseline, measure.

Unchanged in substance — the bucket tuple was already `(hp, hits, crits, variantId)`, which phase 1
makes an explicit type instead of an inference about what varies.

### Phase 3 — memoize kernels

Keyed on regime, with recomputation validation enabled across the corpus. Prove identical,
measure.

### Phase 4 — deferred

Binning, budgets, caps. Explicitly out of scope until 0-3 are validated. Guardrails go in once
the outcomes are known good, not before.

## Risks

**Float accumulation order.** Past 6 hits, counts leave the safe-integer range and probabilities
become floats — `Distribution.exact` reports which régime a result is in. Reordering the
accumulation changes the last ulp, which breaks byte-identical comparison for exactly the cases
that already cannot be compared exactly. Mitigation: preserve accumulation order in phases 1-2,
and mirror `assertMassConserved`'s own two-régime approach in the harness — exact equality while
integer, tight relative tolerance beyond.

**`Reification` reference identity.** `CLAUDE.md` documents that `Context` reuse depends on the
source `State` fragment being the *same object*, that reuse is refused across differing
`Relevancy`, and that a `Reification` hands out one live `Context` at a time. Caching kernels
across states interacts directly with all three. Do not retain a `Context` past its resolve.

**`Relevancy` provenance.** Memoizing a kernel records its provenance once rather than per state.
Decide explicitly whether `Relevancy` is per-outcome or per-resolve before phase 3, or the
sensitivity output changes meaning without anyone noticing.

## Success criteria

- **Phase 1 is the exception**: it changes answers on purpose, so it is verified against the
  `@pkmn/sim` oracle, differential per axis as each is migrated — not against a self-baseline.
- Every phase after phase 0: output identical to the phase 0 baseline over the whole corpus — same
  states, same counts, same `(hits, crits)` breakdown.
- Phase 2: Rock Blast `stateKey` builds fall from 46,961 to ~513, and `State` allocations with
  them. Resolve time well under 145 ms.
- Phase 3: Rock Blast `calculateDamage` calls fall from 2,858 to 10.
- Phase 3: 10 turns of Rock Blast on the **general** path, with `damageIgnoresTargetHp` forced
  off, in seconds rather than the current hours.
- On completion: `TARGET_HP_SENSITIVE_ABILITIES` / `_ITEMS` / `_MOVES` deleted.

These are counter assertions, not timings, so they can be pinned as tests rather than eyeballed
on a benchmark.

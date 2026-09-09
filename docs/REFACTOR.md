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

### Phase 0 — characterization harness ✅ DONE 2026-09-08 *(runs after phase 1)*

`src/test/characterization.test.ts` over the 19-scenario corpus in
`src/test/helpers/characterize.ts`, as Jest snapshots. Stamina, Focus Sash and a `multiaccuracy`
move are present as required, alongside every branch axis, both `resolveTurns` paths, an absorb, a
defender-side reduction and the past-horizon case.

**Ran after phase 1, not before.** Characterizing first would have pinned a dozen known-wrong
answers as "correct" for every phase that follows.

Two properties are load-bearing, both learned by getting them wrong during phase 1:

- **Probabilities, not counts.** `flatMap` ends in `normalize()`, so the denominator is an
  implementation detail — Population Bomb's total moved 6.97e35 → 8.6e33 during a change that
  altered no answer.
- **Rounded to 12 significant figures, and keys sorted.** Past the exact horizon the last ulp moves
  with accumulation order, exactly as the *Float accumulation order* risk below predicts; and label
  insertion order produced three phantom failures on the first comparison attempt. Twelve figures is
  far tighter than any mechanic-level change and far looser than float noise.

**The harness was verified to bite**: perturbing Thick Fat's constant from `0x800` to `0x900` failed
one snapshot *and* two `coverage.test.ts` oracle cases, independently. A baseline nobody has proved
detects a change is worth nothing.

Regenerate deliberately with `npx jest --runInBand src/test/characterization -u`, and say in the
commit message which answer moved and why.

### Phase 2 — numeric inner loop *(started 2026-09-08)*

Buckets replace `Resolution` in the hit loop; `State` is materialized only for surviving outcomes.
Prove identical against the phase 0 baseline, measure.

Unchanged in substance — the bucket tuple was already `(hp, hits, crits, variantId)`, which phase 1
makes an explicit type instead of an inference about what varies.

**Step one, done: key the hit sequence on the target alone.** Inside `hitSequence` only the target
can change — `withDamage` writes through `withPokemonAt(action.target)` and nothing else — yet every
merge key rebuilt attacker, field, sides and move too. `hitResolutionKey` keys the flags, the labels
and `pokemonKey(target)`; `rekeyed()` puts the distribution back on the full state key on the way
out, because `applySecondaries` writes to the attacker and the narrow key stops being sound there.

**Step two, done: key on the fields that actually vary.** `withDamage` writes exactly four —
`hp`, `boosts`, `item`, `hurtThisTurn` — so the target's species, level, ability, types, stats and
the rest were being serialised on every branch for nothing.

`VARIES_DURING_HITS` in `resolution.ts` is decision #1 above, implemented: a
`{[K in keyof State.Pokemon]-?: boolean}` mapping, so **a field added to `State.Pokemon` fails to
compile until it is classified**. Verified by deleting `weighthg` from the map and confirming
`TS2741`. A wrong `false` would silently merge distinct states, which is exactly the Stamina trap
described above — the phase 0 snapshots are what catch it, and did not move.

**Step three, done: stop keying the same outcomes five times.** A resolve made five full-key passes
over its outcome set — `rekeyed()`, the secondary `flatMap`, a `.mapped()` to restore the move, the
outer `flatMap`, and the projection. Three were redundant:

- `rekeyed()` merged before handing off to a `flatMap` that merges anyway; it now only re-tags the
  keyer and leaves the merging to the one pass that was always going to happen.
- The `.mapped()` that restored the original move is gone; `toStateDistribution` takes the move and
  restores it while doing the keying pass it already performed.
- A move with no data branches skips the outer `flatMap` entirely rather than merging an
  already-merged distribution against itself.

| | pre-phase-1 | after phase 1 | + target key | + varying fields | + fewer passes |
| --- | --- | --- | --- | --- | --- |
| Rock Blast | 129 ms | 88 ms | 52 ms | 40 ms | **31 ms** |
| Icicle Spear | 166 ms | 119 ms | 61 ms | 54 ms | **38 ms** |
| Population Bomb | 127 ms | 474 ms | 243 ms | 176 ms | **135 ms** |
| `resolveTurns` Rock Blast ×10 | 270 ms | 313 ms | 108 ms | 90 ms | **89 ms** |
| Rock Blast full state keys | 46,961 | 27,605 | 4,169 | 4,169 | **2,085** |
| Population Bomb full state keys | — | 143,020 | 19,392 | 19,392 | **9,696** |

Rock Blast is **4.2×** faster than before any of this, Icicle Spear **4.4×**, the turns case
**3.0×**. Population Bomb is back to parity — 135 ms against 127 ms originally, from a 474 ms peak
— so the regression phase 1 introduced is closed.

**All 19 phase 0 snapshots passed unchanged at every step.** That is the sequence working as
designed: the baseline went in first, and each optimisation proved itself against it rather than
against judgement.

### The keys are no longer the problem — allocation is

Measured 2026-09-08, after the three steps above, and it **corrects the framing this document opens
with**. The original measurement blamed a *"~500-character key"*; that cost is now gone, and what is
left is not a keying problem at all.

CPU profile of Population Bomb, 12 resolves:

```
 86.3%  flatMap @distribution.js
  2.5%  forHit @resolve.js
  1.2%  (garbage collector)
  1.0%  hitResolutionKey @resolution.js
  0.2%  stateKey @key.js
```

`stateKey` is 5-7% of a resolve by direct timing, `hitResolutionKey` about 1%. **Building and
hashing keys is ~1-7% of the work.** Counting what `flatMap` actually does per resolve:

| | `f()` invocations | inner outcomes keyed and merged | final outcomes |
| --- | --- | --- | --- |
| Rock Blast | 2,073 | 25,520 | 301 |
| Population Bomb | 13,453 | **133,324** | 636 |

Each `f()` allocates a `Distribution`, an outcomes array, ~32 `Resolution` objects and their label
objects; each inner outcome is an `Outcome` wrapper that is allocated, keyed, merged and discarded.
That is on the order of **600,000 objects allocated to produce 636 outcomes** — the same "99% of
branch work merges away" finding as before, but the waste is now object churn rather than string
building. Phase 1 made this *worse* in exchange for cheaper keys: a transition returns its branches
unmerged so `flatMap` can do the single merge.

**A key-type change is therefore the wrong fix, and a micro-benchmark says so independently.** With
10,000 operations against 700 distinct keys: 258-char string keys 0.72 ms, **short string keys
0.07 ms**, number keys 0.18 ms. Short strings beat numbers. Interning to integers is not motivated
by hashing cost.

What it *is* motivated by is not allocating at all.

### The rule: do not relocate the cost

Every option here is tempting because it makes one line cheaper while the work reappears somewhere
else. Judge a change by total work removed, not by the line it improves.

- **Hash-consing states so `===` is equality** — interning requires hashing at construction, so it
  relocates the hash rather than removing it.
- **Phase 1's own trade** — returning branches unmerged halved keying and doubled allocation. It was
  a net win overall, but it is the same failure mode viewed from the other side.

The only structural win is **not creating the object in the first place.** The dimensions in the hit
loop are bounded and dense — `hp ∈ [0, maxhp]`, `remaining` and `crits` in `[0, maxHits]`, plus a
tiny variant set — so a bucket does not need a key at all, it needs an **offset**:

```
index = ((variant * (maxHits + 1) + remaining) * (maxHits + 1) + crits) * (maxhp + 1) + hp
```

A `Float64Array` reused across hits, `weights[index] += weight`, and `Resolution`/`State`
materialised only for the non-zero slots at the end. No key, no hash, no `Map`, no per-branch
object. Sizing: Rock Blast vs Blissey ~51k slots (0.4 MB), Population Bomb ~173k (1.4 MB), worst
realistic case ~2.4M (19 MB) — so it needs a size cap with a fallback to the keyed path.

**The hazard, and the reason this is not a quick change.** Expansion is not `hp' = hp - damage`:
`withDamage` also runs `endures` (Sturdy and Focus Sash, which fire only from full HP and consume
the item), the Stamina boost, and `hurtThisTurn`. Those change the *variant*, not just the HP. A
numeric expansion path would therefore reimplement `withDamage`'s mechanics — **two implementations
of the same rule, free to diverge**, which is precisely the class of bug this whole refactor exists
to remove. Any dense-buffer implementation has to derive the variant transition from `withDamage`
rather than restate it.

### Step four: stop paying for axes that do not branch

Two further changes, both proved against the phase 0 snapshots.

**The hit loop no longer uses `flatMap`.** Every damage transition returns the *same* total
(`expansion`), so the LCM machinery was computing a constant, and the per-branch `Distribution`,
outcomes array and `Outcome` wrappers existed only to be immediately merged away. `expandHit` writes
straight into the next hit's map, with `normalize()` per hit to keep counts inside the safe-integer
range as `flatMap` used to.

**A trivial axis is skipped rather than merged.** An accuracy axis of one landing branch, and a
secondary axis of one empty branch, each used to trigger a full pass that keyed every outcome with
`stateKey` and produced an identical distribution. Both now short-circuit, as the single move-data
branch already did.

| | pre-phase-1 | after step 3 | after step 4 |
| --- | --- | --- | --- |
| Rock Blast | 129 ms | 31 ms | **29 ms** |
| Icicle Spear | 166 ms | 38 ms | **34 ms** |
| Population Bomb | 127 ms | 135 ms | **124 ms** |
| `resolveTurns` Rock Blast ×10 | 270 ms | 89 ms | **92 ms** |
| Rock Blast full state keys | 46,961 | 2,085 | **1,390** |
| Population Bomb full state keys | — | 9,696 | **3,232** |

Rock Blast is 4.4× faster than where this started and Icicle Spear 4.9×; Population Bomb is now
slightly *ahead* of its pre-refactor time. Full state keys for Rock Blast are down 34× from the
original 46,961, against the ~513 criterion below.

### Step five: build the per-hit move once, not once per bucket

Profiling after step 4 put `forHit` at **16.6% of runtime, the single largest entry**:

```ts
function forHit(state: State, hitNumber: number): State {
  return state.withMove({...state.move, hit: hitNumber});
}
```

It spread a ~45-key move object once per bucket per hit — but every bucket in a hit shares the
branch's move, so the result was identical each time. Hoisted to once per hit.

| | pre-phase-1 | after step 4 | after step 5 |
| --- | --- | --- | --- |
| Rock Blast | 129 ms | 29 ms | **23 ms** |
| Icicle Spear | 166 ms | 34 ms | **27 ms** |
| Population Bomb | 127 ms | 124 ms | **98 ms** |
| `resolveTurns` Rock Blast ×10 | 270 ms | 92 ms | **85 ms** |

Rock Blast **5.6×**, Icicle Spear **6.1×**, turns **3.2×**, and Population Bomb is now faster than
before the refactor rather than merely level.

### Where it stands, and the correction about keys

Profile after step 5: `accumulateHit` 20.3%, `withDamage` 9.1%, `expandHit` 9.0%, `extend` 6.4%,
`calculateDamage` 4.2%, `hitResolutionKey` 3.6%.

**An earlier note here claimed short strings beat numbers and that integer keys were not worth it.
That was measured on 1-3 character keys, which V8 caches, and it is wrong for the keys this code
actually builds.** Re-measured with realistic ~35-character keys, 400k operations over 5,000
distinct values:

| | |
| --- | --- |
| 35-char string keys, get + set | 14.46 ms |
| packed number keys, get + set | **4.70 ms** |
| building the string key alone | 10.15 ms |

So packing *is* worth roughly 3× on the accumulate path, which is ~24% of a resolve
(`accumulateHit` + `hitResolutionKey`). The subtlety is not the packing — `hp`, `remaining`,
`crits` and the flags are already integers — it is the **variant** (`boosts`, `item`,
`hurtThisTurn`), which needs interning to a small id. `withDamage` preserves the `boosts` object
identity whenever Stamina does not fire, so a `WeakMap` keyed on it makes the common case two cheap
lookups; a miss costs a small string but is always correct, so the failure mode is slowness, not a
wrong answer.

### Step six: the hit key is a packed integer

`packHitKey` replaces the string. `hp`, `remaining`, `crits` and the two flags are already integers;
the variant (`boosts`, `item`, `hurtThisTurn`) interns to a small id, and the whole thing multiplies
into one number well inside the 53-bit safe range:

```
((((variant * hitSpan + remaining) * hitSpan + crits) * 4 + flags) * hpSpan) + hp
```

**The first attempt interned the variant by `boosts` object identity and ran the heap out of
memory.** `withDamage` preserves that identity only when Stamina does not fire; when it does, every
branch gets a fresh `boosts` object, so every branch got a fresh variant id, nothing merged, and the
distribution grew without bound. Correctness was never at risk — distinct keys cannot merge things
that differ — but "the failure mode is slowness, not a wrong answer" was too generous. It is
unbounded growth.

`VariantIds` now interns by **value**, with a `WeakMap` memoising the id per `boosts` object so the
value string is built once per distinct object rather than once per branch.

| | pre-phase-1 | after step 5 | after step 6 |
| --- | --- | --- | --- |
| Rock Blast | 129 ms | 23 ms | **16 ms** |
| Icicle Spear | 166 ms | 27 ms | **17 ms** |
| Population Bomb | 127 ms | 98 ms | **61 ms** |
| `resolveTurns` Rock Blast ×10 | 270 ms | 85 ms | **76 ms** |
| Rock Blast vs Stamina | — | — | 17 ms |

**Rock Blast is 8.3× faster than before the refactor, Icicle Spear 9.8×, Population Bomb 2.1×, the
turns case 3.6×.** The whole test suite runs in 25 s against 290 s a few steps ago. All 19 phase 0
snapshots unchanged throughout.

Full state keys are unchanged at 1,390 for Rock Blast, because step 6 removed *hit-loop* keys, which
were never counted in that figure. The ~513 criterion measures the outer axes and the projection,
which now cost little enough that the remaining gap is not worth chasing on its own.

### Steps seven and eight: the last two profile entries worth taking

**`Context.Move` no longer copies through `extend`.** `PLAN.md` flagged this and asked for its own
before/after rather than smuggling it in: `extend` is a jQuery-style deep-extend whose one-source
shallow case reduces to "copy own enumerable keys, skipping `undefined`". `shallowCopy` does exactly
that with none of the branching. It also predicted the win would be small, and it was — about 4%.

**The variant id is a number, not a string.** `VariantIds.of` was building
`boostId + ';' + item + hurt` per branch, 4.0% of the profile in code added one step earlier. Item
ids intern to integers and the three components multiply into one number, so no string is built on
the hot path at all.

| | pre-phase-1 | after step 6 | after step 8 |
| --- | --- | --- | --- |
| Rock Blast | 129 ms | 16 ms | **14 ms** |
| Icicle Spear | 166 ms | 17 ms | **15 ms** |
| Population Bomb | 127 ms | 61 ms | **55 ms** |
| `resolveTurns` Rock Blast ×10 | 270 ms | 76 ms | **75 ms** |

**Rock Blast 9.2× faster than before the refactor, Icicle Spear 11.1×, Population Bomb 2.3×, the
turns case 3.6×.** The full test suite runs in 23 s against 290 s. All 19 phase 0 snapshots have
stayed unchanged across every one of the eight steps.

### What is left

The last structural cost is `withDamage` allocating a `State` and `State.Pokemon` per branch
(`withDamage` 11.1% of the profile, plus its share of GC), which only the dense buffer removes — and
that still carries the duplicate-`withDamage` hazard described above. Everything cheaper than that
has now been taken.

**That cost is also a layering bug, not just a performance one.** `State` is documented as the
outside, serializable API type, yet it is what the internal hit loop threads through every branch —
see *"The `State` / `Context` split does not describe what the code does"* in
[`PIPELINE.md`](PIPELINE.md). `Resolution` is already the engine's working wrapper; it just holds a
`State` where it wants packed fields. Building the dense buffer and fixing the layering are the same
piece of work, which is an argument for doing it properly rather than as another micro-optimisation.

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

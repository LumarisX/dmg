# DraftZone Calculator — Plan

## Purpose

A standalone, self-hosted damage calculator for Pokémon DraftZone, built on the `@pkmn`
packages as its data and mechanics substrate.

The goal is **not** to reimplement `@smogon/calc`. It is to be measurably more precise than
it, by computing a **probability distribution over resulting battle states** rather than a
damage range plus an approximated KO chance.

That single design choice is what everything below serves.

### What "more precise" means concretely

`@smogon/calc` reports a min–max damage range and an approximate KO chance. It collapses
every stochastic factor other than the 16 damage rolls into a boolean toggle (crit on/off,
"is the defender at 50% HP") or ignores it.

This calculator should instead resolve a move into every distinct **resulting state** with
its exact probability, then answer questions against that distribution:

- true nHKO probability accounting for hazards, residual, items and procs
- "chance I survive and KO back"
- **sensitivity** — which inputs actually change the answer

That last one is the motivating example: if a move always kills, and a crit also always
kills, the crit is irrelevant. Both branches produce the identical resulting state
(`defender fainted`), so they **merge into one node at probability 1.0**. You never write a
rule about crits mattering; it falls out of keying nodes by *state* rather than by *path*.

Merging is simultaneously the correctness mechanism and the explosion control. It is the
core of the design.

## Non-goals

Stated up front, because each one is a plausible-looking place to accidentally spend months:

- **Not a battle simulator.** `@pkmn/sim` exists and is the reference, not the target.
- **Not a battle AI.** Opponent action selection is an injected parameter, never solved
  internally (see Phase 1).
- **Not multi-generational *in its test surface*.** Gen 9 ships first. But no generation and
  no dataset is baked into the architecture — see "Extensibility contract" below.
- **Not a replacement for `@pkmn/dmg` upstream.** This is a DraftZone-specific fork.
- **Metronome is not supported, and neither is any other move-calling move.** Decided 2026-09-08.
  Metronome picks uniformly from the whole legal move pool, so a faithful answer is a mixture over
  ~900 sub-distributions — each of which is its own full `resolveMove`, several of which this
  calculator refuses anyway, and the resulting "distribution" answers no question anybody asks. The
  same shape covers **Sleep Talk, Assist, Copycat, Mirror Move, Me First and Nature Power**: the
  move that resolves is chosen at runtime from a pool, so `state.move` is not knowable at build
  time and the whole input model stops applying. These are refused by name, not approximated.
  Nothing about the branch machinery below is intended to grow into them.

## Where it stands today

Honest baseline, as of this document:

| | Status |
| --- | --- |
| Compiles | **No** — `tsc` fails |
| Tests | **No** — 9 of 12 suites fail to load; 7 tests pass total |
| Consumers | None. Server `speedchart.ts` uses `computeStats`/`State` only, never the damage path |
| Ability handlers | 41 real of 246 entries — the rest are stubs with PS source commented out |
| Item handlers | 89 of 220 |
| Move handlers | 43 of 358 |
| `apply` (state transitions) | **1** in the entire mechanics tree |

What is inherited from upstream `@pkmn/dmg` and worth keeping:

- **`State` / `Context` / `Relevancy`** — the outside/inside/provenance split (see below)
- **`Handlers`** — per-id hook tables, swappable, which is what makes mods viable
- **Test infrastructure** — `src/test/helpers/random.ts`, `verifier.ts`, `integration.ts`
  implement differential testing against `@pkmn/sim`. Currently dead. This is the single
  highest-leverage asset in the repo.

What is DraftZone-added:

- `Distribution` / `NumberDistribution` (`src/mechanics/index.ts`) — exact count-weighted
  convolution. The right primitive, but see Phase 2 for why it is not yet generic.
- Multi-hit chaining, stat overrides, tera default, berry-eat-after-hit, `onEffectiveness`
- `pdzCalculateMove` / `pdzCalculateStrength` — a move-*strength heuristic*, unrelated to
  exact damage, currently interleaved with the damage formula. Dead code today.

## Target architecture

Three tiers. The middle one does not exist yet and is the keystone.

| Tier | Signature | Status |
| --- | --- | --- |
| 1 — damage | `calculateDamage(Context) → Distribution<number>` | exists, roughly works |
| 2 — **one move** | `resolveMove(State, action) → Distribution<State>` | **to build** |
| 3 — turns / game | `resolveTurns(State, policy, depth) → Distribution<State>` | later |

**Tier 1 must stay tree-unaware.** The moment tree logic leaks into `calculateDamage`, the
damage formula can no longer be differentially tested against `@pkmn/sim` in isolation, and
that test is the definition of correctness for this project.

**Tier 2 is the node boundary.** A single move is itself a cascade, resolved in mechanic
order:

```
hit / miss  →  crit  →  16 damage rolls  →  secondary effect
            →  HP-conditional procs (Sash, Sturdy, berries)
            →  contact recoil (Rocky Helmet, Rough Skin)
```

~128 raw leaves, typically merging to a few dozen distinct states.

Tier 2 *is* the state transition function, which means it is built on `Appliers`. With one
`apply` implemented today, **`apply` coverage is the real long-tail work of this project** —
not the tree scaffolding.

**Tier 3 is trivial once tier 2 is right**: repeated application, merge, prune.

### The existing layers

| Layer | File | Role |
| --- | --- | --- |
| Outside | `State` | plain, serializable, mutable — what a UI/API binds to |
| Inside | `Context` | `State` reified with handler fns bound onto each ability/item/move |
| Provenance | `Relevancy` | handlers flip flags as they fire, so output can be minimized |
| Mechanics | `Handlers` | per-id hook tables, swappable → mods |
| Pre-compute | `Appliers` | "click Swords Dance" → mutate `State` before calculating |

`Relevancy` is the thing `@smogon/calc` structurally cannot do — it hardcodes a `desc`
string builder.

**Do not use `Relevancy` to derive the merge key.** It records what was read *on this path*;
a field unread here may be read on a future branch. Unsound unless unioned across all
reachable branches. It answers the *sensitivity* question, which is a separate mechanism
from merging.

## Extensibility contract

**Gen 9 is the first target, not an architectural assumption.** The end state is that a user
can hand the calculator any `@pkmn`-compatible dataset or mod — Radical Red, Insurgence, a
National Dex `exists` filter, a future generation — and it works. DraftZone already ships two
such mods server-side (`src/mods/radicalred`, `src/mods/insurgance`), so this is a live
requirement, not a hypothetical.

That splits into three kinds of modding with very different costs:

| Kind | Mechanism | Status | Requirement |
| --- | --- | --- | --- |
| **Data** — new species, moves, items; changed base stats, BP, types | `new Generations(ModdedDex, exists)` | free today | never hardcode data; always read from `gen.*` |
| **Mechanics** — behaviour not expressible as data | the `handlers` param `calculate` already accepts | designed, barely used | no mechanic implemented outside the handler tables |
| **Formula** — constants and formula shape that vary by gen or mod | **nothing** — currently inline `gen.num` branches | **missing** | a resolved `Rules` profile, injected once |

The first two are upstream's design and they are sound. The third is the gap.

### The `Rules` profile

There are **66 `gen.num` branches** in non-test source. Each one is a place a mod cannot
reach. Boost tables (`LEGACY_BOOSTS`), crit ratio ladders (`CRIT_KEY`), the paralysis speed
divisor, screen modifiers — these are *parameters*, currently spelled as control flow.

Resolve them once into a `Rules` object derived from the generation/mod and inject it,
instead of branching on `gen.num` at each use site. Gen support then becomes data, and a mod
overriding a formula constant becomes possible rather than requiring a fork.

**This reconciles the two goals.** What gets deferred is gens 1–7 *support and testing*, not
the *capability*. Concretely:

- Leave the existing gen branches alone; they are not the priority.
- **Add no new inline `gen.num` branch.** New behaviour goes through handlers or `Rules`.
- Migrate branches to `Rules` opportunistically, when touching that code anyway.

### Known violations to fix

Hardcoded names and behaviour sitting in the damage core, where no mod can reach them. Each
should move into a handler table or `Rules`:

- **Weather and terrain are hardcoded by string** in `calculateDamage`
  (`mechanics/index.ts:189-201`) — `=== 'Sun'`, `'Hydro Steam'`, `'Utility Umbrella'`. There
  is already a `// Convert to weather handler` note. `mechanics/conditions.ts` contains
  exactly two entries (`brn`, `par`), so *every* weather and terrain effect is inline today.
- `getFinalModifier` hardcodes `'Dynamax Cannon'`, `'Behemoth Blade'`, `'Behemoth Bash'`
  (`:269`), `'friendguard'` (`:277`) and `'Aurora Veil'` (`:258`).
- `computeModifiedWeight` (`:309-314`) hardcodes `heavymetal`, `lightmetal`, `floatstone`
  rather than dispatching to item/ability handlers.
- `Z_MOVES` and `MAX_MOVES` are hardcoded tables keyed by `TypeName`.
- `conditions.ts` gates each condition on a literal gen number (`sand: ['Sand', 2]`), so a
  mod cannot add or re-scope one.
- `CRIT_KEY` and `situationalMoves` (`:105-106`) are inline constants in the strength
  heuristic.

### Consequences elsewhere

- **`key(State)` cannot be a hardcoded field list.** Mods add volatiles and conditions, and a
  key that omits them will merge genuinely distinct states and report wrong probabilities.
  Derive it from the `State` shape generically.
- **Mods have no oracle.** Differential testing against `@pkmn/sim` validates canonical
  generations only. Modded datasets get golden fixtures plus the invariant tests
  (probabilities sum to 1, merge correctness). "Provably more accurate than `@smogon/calc`"
  is a claim about canonical gens; for mods the claim is "self-consistent and stable."

## The `@pkmn/sim` relationship

**Settled: `@pkmn/sim` is a dev dependency, test-only, never a runtime import, and the
dependency never inverts.**

### Where they overlap

| Shared | sim only | dmg only |
| --- | --- | --- |
| damage formula | turn loop, action queue | `Relevancy` (provenance) |
| stat computation | RNG, seeding | `Distribution` (enumeration) |
| type effectiveness | switching, validation | UI-facing `State` |
| speed computation | protocol / log output | `parse` / `encode` |
| the `onBasePower` / `onModifyAtk` handler shape | faint + EoT handling | `Appliers` |

The first column is genuine overlap, and it still cannot be shared, because **a simulator
selects one outcome and a calculator enumerates all of them**. `Battle.randomizer` picks a
roll; `getDamage` returns a `number`. Sim's architecture is single-path mutation driven by an
RNG, and every effect handler in the engine is written that way.

### Why the dependency never inverts

Practically, `@pkmn/sim` is pkmn's fork of Pokémon Showdown's `sim/`, deliberately mirroring
upstream so it can absorb PS changes; it will not depend on a third-party calculator, and
this is a fork of `dmg` with no path to changing sim's dependencies anyway.

But the decisive reason is logical: **sim is the oracle.** Correctness here is defined as
"differential-tests clean against the reference implementation." If sim's damage came from
dmg, testing dmg against sim would prove nothing. Keeping the oracle independent is the
whole point.

### Enumerate branches, never sample them

**Do not seed-search or run batches of random battles to observe a distribution.** Sampling
approximates what this project defines exactly, and it is slow for no gain.

Sim's stochastic decisions are named, overridable methods:

```js
// sim/battle.js
randomizer(baseDamage) {
  const tr = this.trunc;
  return tr(tr(baseDamage * (100 - this.random(16))) / 100);
}

// sim/battle-actions.js:1612
moveHit.crit = this.battle.randomChance(1, critMult[critRatio]);
```

Three levels of control, cleanest first:

1. **Override `battle.randomizer`** to force roll index `i`. No PRNG knowledge required.
2. **Override `battle.randomChance`** to force crit and secondary branches.
3. **Inject the PRNG** — `BattleOptions` accepts `prng?: PRNG`, `battle.prng` is a public
   mutable field, and `PRNG.rng` is a swappable two-method interface (`getSeed`, `next`).

So the oracle is exhaustive enumeration: 16 runs for the rolls, ×2 for crit, ×2 for a
secondary. Exact agreement or an exact discrepancy — never a p-value.

This removes a limitation already in the tree: `verifier.ts`'s `isSupported()` bails out
whenever `state.move.crit` is set, commented *"Finding the correct PRNG seed to manipulate
the RNG here is too complicated."* That is seed-searching where a method override does the
job.

**Caveat:** `randomChance` is shared — crit uses denominators 24/8/2/1, secondaries use
`(chance, 100)`. Dispatching on the denominator works but is not bulletproof. The robust form
is **record/replay**: wrap the RNG methods to capture the exact call sequence for a scenario,
then replay a scripted sequence. Re-recording absorbs PS call-order changes instead of
silently mis-forcing a branch. Assert the observed call count matches the model's prediction
— a mismatch means sim branched somewhere the calculator does not know about, which is itself
the signal you want.

Random *state generation* stays (`integration.ts` fuzzes N=10000 generated states). That is
fuzzing, a different job from measuring a distribution.

## Runtime budget

The calculator is expected to serve many calculations per request — a draft matchup grid is
plausibly 12 × 12 × 4 moves ≈ 576 in one page load. Budget accordingly:

- **Tiers 1 and 2 must stay cheap.** ~128 raw branches merging to a few dozen states is fine
  at hundreds of calls per request. Keep it that way.
- **Tier 3 is where latency lives.** The pruning horizons are not only about tractability,
  they are the latency control: exact at depth 1–2, merged + pruned at 3–5, nothing deeper
  without an explicit budget.
- **The merge key doubles as a memo key.** Canonical states recur constantly across a grid
  and within a search, so the Phase 2 canonicalizer pays for itself twice.
- **Branch on `State`, reify `Context` lazily.** `Context` binds handler functions onto every
  entity on construction. Node payloads should be plain `State` — cheap to copy and to key —
  with a `Context` built only when a node is actually evaluated. Reifying per branch would
  multiply that cost by the branching factor.

---

# Phase 0 — Restore a green baseline ✅ DONE 2026-09-03

**Result:** `tsc -p . --noEmit` clean (was a wall of `TS2345`); **10 of 12 suites pass, 76
passed / 1 todo / 3 failed** (was 3 suites, 7 tests). Steps 1, 2 and 4 done; **step 3 (version
alignment) deferred** — see below.

Two real bugs surfaced the moment the suites could load, which is exactly what this phase was
for:

- **`Context` constructor ordering.** `Context.Side` copies `context.field` during its own
  construction, but `field` was built *after* `p1`/`p2`. `Side.field` was therefore always
  `undefined`, and every weather-gated ability (`chlorophyll`, `swiftswim`, `sandrush`,
  `slushrush`) silently never fired.
- **PS handler functions leaking into `Context.Move`.** `extend(this, state)` copies the whole
  move data object, so with `@pkmn/sim`'s `Dex` it dragged in Pokémon Showdown's own
  `onBasePower`/`basePowerCallback` — then called them with dmg's `(context)` signature.
  `HANDLER_FNS` (referenced in a stale comment but never written) now exists in `handlers.ts`
  and the constructor strips those keys before `reify` installs dmg's own. This matters
  directly for the extensibility contract: a mod's data can carry functions too.

**The new baseline — 3 genuine mechanics gaps, not build breakage:**

- `mechanics/index.test.ts` — Collision Course / Electro Drift super-effective boost is not
  implemented; Flower Gift / Power Spot / Battery encoding has a spacing bug.
- `parse.test.ts` — `powerspot` is dropped from `p2.active` when parsing allies.

These belong to the mechanics backlog (Phase 3–4), not to un-stitching. `context.test.ts` was
an empty suite — 175 lines of commented-out `Context` tests — now carrying a `test.todo`
pointing at Phase 2.

**Why step 3 was deferred:** the `TS2345` storm came from two copies of `@pkmn/data` in one
type graph, not from the version numbers. Fixing the imports cleared all of it with zero
version churn. The bump is still required before packaging, but it is now an isolated change
that can be made and tested on its own rather than tangled with the un-stitching.

---

## Original plan (kept for reference)

**Nothing else is measurable until this is done.** Every judgment about accuracy is
currently unverifiable.

### Background

The cross-repo stitching into `pokemon-draftzone-server/dmg/` was an emergency measure and
is slated for removal. It landed in exactly one commit — `96881ac` — which *also* did the
legitimate work of splitting `handlers.ts` and `relevancy.ts` out to break circular
dependencies.

**So this is a targeted import rewrite, not a revert.** Keep the file split; restore the
paths. `git show HEAD~1:<file>` is the reference for what each clean version looked like.

Note the breakage is **one-directional**. `pokemon-draftzone-server/dmg/` is self-contained
(its files import only `./state`, `./math`, `./utils`) and `speedchart.ts` works fine
against it. Only `dmg/src` reaching *into* the server is broken. Leave the server copy alone
until the Phase 1 packaging decision.

### Steps

1. **Rewrite the stitched imports.** 24 source + 9 test files point at
   `../../pokemon-draftzone-server/dmg/*`. Restore to local (`../state`, `./math`, …).
   The dangling one to note: `pokemon-draftzone-server/dmg/context` **does not exist** —
   the file is `dmg/src/context.ts`, which already uses clean local imports.

2. **Reconcile the two overwritten files.** `dmg/src/state.ts` and `dmg/src/conditions.ts`
   were overwritten with the prettier-formatted server copies (they import
   `"../../dmg/src/utils"`, a self-referential path). Diff against `HEAD~1` and keep the one
   real change — the `(m: string)` annotation at `state.ts:818`.

3. **Align `@pkmn/*` versions.** dmg pins `@pkmn/data ^0.9.20` and `@pkmn/sim ^0.9.13`; the
   server is on `^0.10.11` for both. Two copies of the types is what produces the `TS2345`
   storms (`megaStone` changed shape between them). Bump dmg to match. Expect real API churn
   to surface — that is the point.

   Add `@pkmn/mods` as a dev dependency at the same version while here. It is what the modded
   paths get tested against, and the server already depends on it.

4. **Confirm `Distribution` survives the move.** It lives in `src/mechanics/index.ts` today;
   leave it there for now. Phase 2 relocates it.

### Exit criteria

- `npx tsc -p . --noEmit` — clean
- `npx jest --runInBand` — 12 of 12 suites pass
- No path in `dmg/src` references `pokemon-draftzone-server`

---

# Phase 1 — Lock the scope decisions ✅ DONE 2026-09-03

These determine every handler signature that follows. Making them after mechanics are
written means rewriting mechanics.

### 1. Generation and dataset scope

**Decided: gen 9 first, no generation or dataset baked in.**

Upstream targets gens 1–8 with heavy legacy branching (`LEGACY_BOOSTS`, `gen <= 2`,
`gen <= 4` throughout). The tempting move is to delete gens 1–7 outright — it would cut a
large fraction of the complexity and test burden. **Do not.** The end state requires any
`@pkmn`-compatible mod or dataset to work, and deleting the gen dimension is exactly the
kind of assumption that is expensive to reverse.

What is deferred is gens 1–7 *support and testing*; the *capability* stays. The operative
rules are in "Extensibility contract" above: add no new inline `gen.num` branch, route new
behaviour through handlers or `Rules`, migrate existing branches opportunistically.

Gen 9 is what gets tested, prioritised and shipped first.

### 2. Packaging and where it runs ✅ SHIPPED 2026-09-04

**Decided: publish as `@pdz/calc`; the server is the only consumer; the client stays
`@pkmn`-free and gets results over HTTP.**

Built and wired. `package.json` is now `@pdz/calc@0.1.0` with dual `build/cjs` + `build/esm`
and an `exports` map, mirroring `@pdz/sets` (same `tsconfig.cjs/esm` split and
`scripts/write-module-type.mjs`). The server depends on it, `speedchart.ts` imports
`{State, computeStats} from '@pdz/calc'`, and **`pokemon-draftzone-server/dmg/` is deleted** —
the emergency stitching from the first session is fully gone. Server typechecks clean and its
121 matchup tests pass.

Dropped along the way, since the package is server-only:

- **microbundle and the UMD bundle** (`bundle.json`, the `unpkg` field, 189 packages). Nothing
  loads this in a browser.
- **The `dmg` CLI `bin` entry.** It needs the optional `@pkmn/smogon` and predates this
  architecture; the script file is still there but is no longer wired up.
- **The `posttest: lint` gate**, so tests no longer fail on the pre-existing lint breakage.
  Lint is now `npm run lint`, deliberately separate.

**The dependency was `file:../dmg` when this was written; it is now a pinned GitHub commit** —
`git+https://github.com/LumarisX/dmg.git#<sha>` — which is the release form this section
anticipated, reached via GitHub rather than `git+file:`.

**The cost of that is a slow loop, and it bites.** Every change here needs commit → push → repin
→ `npm install` → restart before the server sees it, and a stale pin fails silently until it
throws. On 2026-09-05 the server was four commits behind and reported a `Population Bomb` crash
that had been fixed here hours earlier. Worth solving properly: either a local-only `file:`
override for development (it must not reach the deployed `package.json`, since `dmg` does not
exist on the box) or an npm script that rebuilds and installs into the server's `node_modules`.

**Known ESM caveat:** the `build/esm` output keeps extensionless relative specifiers, which
real Node ESM rejects — it is usable by bundlers, not by `node --input-type=module` directly.
`@pdz/sets` has the same shape, and the actual consumer (NestJS) is CommonJS, so this is
inherited rather than new. Fix it with `moduleResolution: nodenext` and explicit `.js`
specifiers if a Node-ESM consumer ever appears.

The client currently has **zero `@pkmn/*` dependencies** — all Pokémon data reaches the
browser through the server. Bundling the calculator client-side would put `@pkmn/dex`
(~4× `@smogon/calc`'s data) into the browser for the first time, and would put tier-3 search
on phones. Not worth it for a calculator that is fundamentally an API.

Follow `@pdz/sets` exactly: dual `build/cjs` + `build/esm` with an `exports` map, consumed as
a `git+file:` dependency pinned to a tag. That is the permanent replacement for the
relative-path stitching.

Consequences, both gated on the package existing:

- `speedchart.ts` switches its `computeStats` / `State` imports to `@pdz/calc`, after which
  **`pokemon-draftzone-server/dmg/` is deleted.**
- Modded golden fixtures and the canonical-gen differential tests live **in this repo** — the
  package owns its own correctness. The server keeps only integration tests of its endpoint.

Revisit only if an interactive calculator page appears where a round-trip per keystroke is
unacceptable.

### 3. Outcome model

**Decision: `Distribution<State>` with an injected canonical key function.** Nodes merge on
resulting state, never on path.

### 4. Probability arithmetic

**Decided: integer numerator + shared denominator, both `number`, GCD-normalised after every
merge, with a safe-integer assertion marking the exact horizon. `number` probabilities at the
public API.**

One move contributes 16 rolls × 24 crit × 100 accuracy ≈ 38,400 — nowhere near `2^53`, so
BigInt would be pure overhead for the common tier-1/tier-2 case that has to stay cheap (see
"Runtime budget"). Depth is what threatens the range, and **GCD normalisation after each
merge is what actually keeps it bounded**, because merging collapses most branches.

Assert `Number.isSafeInteger` on the denominator rather than hoping. If it fires, that is not
a bug — it is the signal that you have left the exactly-representable horizon, which is
precisely where pruning should already have taken over. Since pruning abandons exactness
anyway, float64 past that point costs nothing real.

BigInt numerators remain the documented escape hatch if the assertion turns out to fire
earlier than expected in practice.

### 5. Opponent policy

"Multiple moves per turn" is where this stops being a distribution and becomes game theory.
With both sides choosing, there is no distribution over the opponent's move without an
assumption.

**Decision: `Policy` is an injected interface** — fixed action (what every calc does today),
usage-weighted over their moveset, or a solver later. Baking it in forecloses the upgrade.

Speed order is also a branch, not a given: speed ties are genuinely 50/50 and unknown
investment is a distribution. The server's `speedchart.ts` already models that space and is
the natural input.

### 6. The strength heuristic — deleted ✅

**Done 2026-09-03.** `pdzCalculateMove`, `pdzCalculateStrength`, `pdzEffectivePowerModifier`,
`pdzGetStabModifier`, `CRIT_KEY` and `situationalMoves` are gone from `mechanics/index.ts`,
along with the now-dead `Context.Move.pdzUpdateData` and `effectivePower` getter (~60 lines).

**The feature is not lost.** The server has its own self-contained `pdzCalculateStrength` in
`teambuilder/teambuilder.service.ts`, which imports nothing from dmg and uses its own
`getPowerModifier` from `@modules/data/domain/move-power`. dmg's copy was a stale fork of live
server logic that had drifted — deleting it removed the duplicate, not the capability, and it
is no longer possible to mistake a heuristic for damage logic.

### 7. The `Rules` profile

**Decided in shape, deferred in migration.** A `Rules` object resolved once per
(generation, mod) and injected, holding the constants currently spelled as inline `gen.num`
branches — boost table (`LEGACY_BOOSTS`), crit ratio ladder, paralysis speed divisor, screen
modifiers, and so on.

It rides alongside handlers so a mod can override either:

```ts
calculate(state, {handlers, rules})
```

Migration is opportunistic, per "Extensibility contract" — the standing rule is only that no
*new* inline `gen.num` branch gets added. The first candidates when someone is in that code
anyway are `computeBoostedStat`'s `LEGACY_BOOSTS` branch and `mechanics/conditions.ts`'s
paralysis divisor, both small and self-contained.

### Exit criteria ✅

All seven decisions recorded above with their rationale, and the one with an immediate
action (#6) carried out.

---

# Phase 2 — Rung 1: a single reliable move ✅ DONE 2026-09-03

The first real milestone. **One move, one target, no multi-hit.**

Move class: 100% accuracy, no secondary, no recoil, no contact effects, single target.
Aura Sphere (special) or Pound (physical). The only branching is 16 rolls plus crit.

Small enough to hand-verify, and it forces every hard problem into the open at a debuggable
size.

### Deliverables

1. **`key(State): string`** ✅ **DONE 2026-09-03** — `src/key.ts`, 16 tests in
   `src/test/key.test.ts`. Exposes `stateKey` plus `pokemonKey`/`sideKey`/`fieldKey`/`moveKey`
   and a `stateDistribution()` factory that wires the keyer in so callers cannot forget it.

   Normalisation implemented:
   - **HP clamped at 0** — the highest-value rule; without it overkill never merges.
   - Boosts clamped to ±6 with zeros omitted, so an absent boost and an explicit `0` are the
     same state. Toxic counter capped at 15. Both bounds match the existing `BOUNDS` table in
     `state.ts` rather than inventing new ones.
   - Map-like collections (volatiles, side conditions, pseudo-weather) are **sorted**, so
     insertion order cannot split a state.
   - EV/IV spreads are emitted in a fixed stat order with gen-correct defaults, so `{}` and
     `{hp: 0, ...}` key identically.
   - Entities are identified by `id`, never serialised — `Specie` and `Move` objects are large
     and cyclic.
   - Retained because handlers read them: `hurtThisTurn`, `moveLastTurnResult`, `switching`,
     item and ability identity, `teraType`, `addedType`, `weighthg`, `position`.

   Deliberately **not** done: collapsing a fainted Pokémon's volatiles/boosts/status. It would
   merge more, but Destiny Bond and similar make "a fainted mon's own state is irrelevant"
   less obviously true than it looks, and the Phase 2 move class does not need it — crit and
   non-crit differ only in HP. Revisit with evidence.

   `key.ts` takes mutable `State`, not `DeepReadonly<State>`: `DeepReadonly<unknown>` becomes
   `Readonly<unknown>`, which plain `unknown` is not assignable to, so `moveLastTurnResult` and
   `hurtThisTurn` made every caller fail to typecheck. Keying is read-only by construction, so
   the annotation was buying nothing.

2. **`Distribution<T>` refactor.** ✅ **DONE 2026-09-03** — extracted to `src/distribution.ts`
   (which also breaks one leg of the `mechanics` ↔ `result` import cycle), with 16 tests in
   `src/test/distribution.test.ts`.

   - Merging now goes through an **injected `Keyer<T>`** instead of `Map<T, number>` reference
     equality, so object states merge correctly. `mapped`/`filtered`/`clone` propagate the
     keyer via `derive()` — the old versions silently dropped it.
   - `probabilityOfAtLeast` / `cumulativeProbability` moved down to `NumberDistribution`;
     the generic parent no longer contains `o.data >= value`.
   - `normalize()` divides counts by their GCD; `assertExact(expectedTotal?)` enforces the
     Phase 1 decision — it throws `ProbabilityMassError` if a merge changed the total mass and
     `ExactHorizonError` once the denominator leaves the safe-integer range. `chain` and
     `combine` call both on every step.
   - **`defaultKeyer` now throws on object values.** `String` collapses every object to
     `"[object Object]"`, which would silently merge unrelated states into one bucket and
     corrupt every probability downstream. Failing loudly is the whole point of the key.
     Primitives still work with no keyer.

   Verified: chaining five 16-roll distributions stays inside the exact horizon, `chain` does
   not mutate its inputs, and the overkill collapse works — 16 distinct post-damage states
   with HP clamped at 0 merge to **one outcome at probability 1.0**, while the same 16 without
   clamping stay at 16. That is exit criterion 2, demonstrated at the `Distribution` level
   ahead of the real `key(State)`.

3. **`resolveMove(State) → Distribution<State>`** ✅ **DONE 2026-09-03** — `src/resolve.ts`,
   12 tests in `src/test/resolve.test.ts`.

   Branches over crit and the 16 rolls, weights each branch, applies damage to the defender,
   and merges by `stateKey`. Crit weighting reads the **exact tables sim uses**
   (`battle-actions.js`): gen ≤ 5 `[0,16,8,4,3,2]`, gen 6 `[0,16,8,2,1]`, gen 7+
   `[0,24,8,2,1]`, with `critRatio === 0` meaning no crit roll at all and out-of-range ratios
   clamped rather than read past the end.

   **The outcome state carries the original move, not the crit-flagged branch move.** If the
   crit flag leaked into the outcome, `moveKey` would include it and the crit and non-crit
   branches could never merge — which would silently defeat the entire overkill property.
   A test asserts no outcome carries `move.crit`.

   `resolveMove` **throws `UnsupportedMoveError`, listing reasons, for anything outside the
   Phase 2 class** — multi-hit, secondaries, recoil, drain, crash, OHKO, self-destruct,
   sub-100 accuracy, contact, non-singles. Rejecting loudly is the point: a move with a
   secondary must never quietly resolve as though it had none. Each rung of Phase 3 removes
   one entry from that list.

   Verified: probabilities sum to 1; a healthy target gives `16 × 24 = 384` total weight; the
   crit branch carries exactly weight 16, i.e. 1/24; overkill collapses to **one outcome at
   probability 1.0**; damage sets `hurtThisTurn`; and the input state is not mutated.

4. **A scripted-branch oracle** ✅ **DONE 2026-09-03** — `src/test/helpers/oracle.ts`, 14 tests
   in `src/test/oracle.test.ts`. No seed-searching: `battle.randomizer` is overridden to force
   each roll percent 85–100 and `battle.randomChance` to force the crit branch, so one exact
   run per branch replaces a sampled distribution. Every RNG call is recorded, which is what
   caught the accuracy bug below.

   Three pieces of latent breakage in `verifier.ts` surfaced the moment it was exercised —
   it had clearly never run:

   - **`setSide` read `side.active[0]` before the battle started.** PS leaves active slots
     `null` until *both* players are set, so it threw on the first field it touched. Split into
     `setTeam` (team + `setPlayer`) and `applySide` (post-start mutation).
   - **`gen9customgame` has team preview.** Even with both players set, `requestState` is
     `'teampreview'` and actives stay `null` until a team choice is made. Added `startBattle()`.
   - **`randomChance` is shared, exactly as this document warned.** A blanket override was also
     answering the *accuracy* check, so Meteor Mash (90%) always missed and sim reported zero
     damage. Now dispatched on the denominator: `(n, 100)` is accuracy/secondary and is forced
     to hit, anything else is the crit roll. `critCalls()` filters the log for assertions.

   Note the denominator dispatch is the fragile form this document flagged; a secondary with a
   non-percentage denominator would still be mis-forced. Full record/replay is the robust
   version and remains the right move before Phase 3 rung 4.

### Exit criteria ✅ ALL MET 2026-09-03

- ✅ **Roll distribution matches `@pkmn/sim` exactly.** Verified for non-crit, crit, resisted,
  neutral, STAB, physical, and a forced-accuracy move, plus that `resolveMove`'s outcomes
  cover exactly the damage values sim produces.
- ✅ **Overkill merge.** Verified at three levels: `Distribution` with a synthetic keyer, real
  `State` objects through `stateKey`, and end-to-end through `resolveMove` — 16 rolls × 2 crit
  branches collapse to **one outcome at probability 1.0**. Paired negative tests confirm a
  healthy target stays at 16 outcomes and a spread straddling zero gives exactly 9, so an
  over-aggressive key would fail too.
- ✅ **Probabilities sum to 1.** Enforced structurally by `assertExact` on every `chain`,
  `combine` and `resolveMove` merge, and asserted directly in the distribution, key and
  resolve suites.

**Phase 2 totals:** 133 tests passing across 14 suites, `tsc` clean. The 3 remaining failures
are the pre-existing mechanics gaps from Phase 0, untouched.

---

# Phase 3 — The multi-hit ladder ✅ DONE 2026-09-04

All four rungs landed. **The architecture did the work**: multi-hit is just *iteration of the
single-hit resolver over a distribution*, so per-hit context re-derivation, early termination
and between-hit state all fell out of the existing `resolveMove` loop rather than needing
special cases.

- **Rung 2** — fixed-count multi-hit with per-hit re-derivation. Each hit resolves from its
  own resulting state.
- **Rung 3** — variable hit count (`hitCountBranches`), mirroring sim's tables exactly:
  gen 5+ `sample([2×7, 3×7, 4×3, 5×3])` = 35/35/15/15, gen ≤ 4 = 3/3/1/1, Skill Link and Grip
  Claw pinning to the maximum. Rock Blast's 90% accuracy forced a **whole-move accuracy
  branch** too, reduced by GCD (9/10, not 90/100) to stay inside the exact horizon.
- **Rung 4** — Triple Axel. `move.hit` now threads through `damageRolls` so escalating base
  power works (`tripleaxel`/`triplekick` handlers added), and `multiaccuracy` gives each hit
  its own accuracy roll with **early termination** tracked by a `finished` flag on each step.
  A test asserts the naive convolution cannot produce the zero-damage outcome that
  `resolveMove` does — the concrete demonstration that the node model earns its keep.
- **Rung 5** — between-hit state. **Loaded Dice** (2-5 collapses to an even 4/5 split;
  ten-hit becomes uniform 4-10), **Parental Bond** (2 hits, second quartered post-gen-6, with
  `bondsWith` mirroring sim's qualification rules), and **Stamina** (defender Def +1 per hit,
  which subsequent hits then see).

**Totals: 133 → 176 tests passing across 17 suites.** New suites: `multihit`, `tripleaxel`,
`betweenhits`.

## The bug this phase surfaced

Stamina refused to match sim, which exposed something much larger: **`calculateDamage`
ignored every stat boost on both sides.** `Context.Pokemon` computes stats from spread plus
item modifiers and stores `boosts` separately, but never applied them — so Swords Dance,
Intimidate, Stamina and every other boost had no effect on damage at all. `computeStats` and
`computeModifiedSpeed` both applied boosts correctly; only the damage path did not.

Fixed by applying `computeBoostedStat` at the point the offensive and defensive stats are
read, including sim's crit rule: a critical hit zeroes **negative attacker boosts** and
**positive defender boosts** (and `ignoreOffensive`/`ignoreDefensive`/
`ignoreNegativeOffensive`/`ignorePositiveDefensive` are honoured). Five oracle tests now pin
this against sim, including that a crit correctly punches through the Def boost Stamina just
gained.

---

## Original plan (kept for reference)

Multi-hit is the interesting stress case, but the current path *looks* like it works while
being structurally unable to represent it, so it gives misleading feedback until Phase 2
lands.

Two things to know going in:

- **Hit count is pinned before calculation starts.** `State.createMove`
  (`src/state.ts:511-520`) resolves `hits` to a single number at construction. Rock Blast's
  2/3/4/5 distribution never enters the math.
- **`Result` convolves N identical `HitResult`s built from the same `Context`.** Escalating
  base power, per-hit accuracy, and any between-hit state change are unrepresentable.
  `NumberDistribution.chain` is pure convolution, and convolution assumes every hit happens.

Also: Parental Bond is entirely commented out (`src/mechanics/abilities.ts:1726`), both the
`multihit = 2` and the 0.25× child modifier. Skill Link **is** implemented (`:2380`). No
Loaded Dice.

### The rungs

Each adds exactly one capability and is independently verifiable.

| Rung | Move | New capability |
| --- | --- | --- |
| 2 | Parental Bond, Skill Link Rock Blast | fixed-count multi-hit; per-hit context re-derivation. Convolution is still valid here, so diff old vs. new and expect agreement |
| 3 | Rock Blast | **variable count** — a distribution over hit count, resolved before rolls |
| 4 | Triple Axel | escalating BP **and per-hit accuracy** → early termination. **Convolution dies here**; this is what proves the node model earns its keep |
| 5 | Stamina, Power-Up Punch → hit 2, Loaded Dice | **between-hit state** |

Rung 4 is the real target. A miss on hit 2 of Triple Axel produces a genuinely different
state, not a smaller sum — today it silently returns a plausible-looking wrong number.

---

# Phase 4 — Beyond (largely done 2026-09-04)

**238 tests passing across 21 suites.** New suites: `tera`, `secondaries`, `weather`, `turns`.
New modules: `src/turns.ts`. The public entry point (`src/index.ts`) now exports the whole
node-model API — `resolveMove`, `resolveTurns`, the distributions and the key functions.
(Both were named `resolveTurns` until the 2026-09-05 rename recorded below.)

| Item | Status |
| --- | --- |
| 1. Widen the branch cascade | **secondaries done**; Sash/Sturdy, berry procs and contact recoil still open |
| 2. `apply` coverage | partial — Stamina, secondary status/boosts; still the long tail |
| 3. Tier 3 — turns | ✅ `src/turns.ts` |
| 4. `Result.knockout` | superseded, see below |
| 5. Gen 9 essentials | ✅ Tera; ✅ weather now handler-driven |
| 6. Expose it | not started — needs the `@pdz/calc` package first |

**`Result.knockout` was deliberately not patched.** It belongs to the old convolution path;
KO chance is now computed on the node model instead (`knockoutChances`,
`guaranteedKnockoutTurn`), where hazards and residuals can be added as ordinary state
transitions rather than special cases. The old method stays as-is until that path is retired.

## Tier 3 — turns

`resolveTurns(state, {turns, policy, epsilon, maxOutcomes})` repeatedly applies `resolveMove`,
merging by `stateKey` between turns and treating fainted states as terminal.

**Renamed from `resolveTurns` on 2026-09-05, and the name was actively misleading.** It performs no
search: no exploration of alternatives, no objective, no game tree, and it never chooses — the
`Policy` is injected and it does as told. It propagates a probability distribution forward N
steps, which is a Markov chain evolution, not a search. The old name described the tier-3
sketch's ambition — once `Policy` becomes a solver rather than a fixed action it *would* become
a search — but naming for the aspiration hid how little the thing actually does: one side acts,
a "turn" means one more use of the move, and `startOfTurn` clearing `hurtThisTurn` is the whole
between-turn model. `resolveTurns` sits beside `resolveMove` as the next tier up. Nothing
consumed it yet, so the rename was free; it would not have been later.

- **`Policy` is injected**, as Phase 1 decided. `repeatMove` is the default fixed-action
  policy; a policy can vary the move per turn.
- **Search works in float probabilities, deliberately.** Pruning abandons exactness anyway, so
  per the Phase 1 decision this is exactly where float belongs — and it sidesteps needing a
  common denominator across differently-normalised per-turn distributions.
- **Pruned mass is reported, never silently dropped.** Both `epsilon` and `maxOutcomes` add to
  `prunedMass`, so `Σ outcomes + prunedMass === 1` is an assertable invariant and the caller
  gets an error bound instead of a quietly wrong number.
- `hurtThisTurn` is cleared between turns, which is both correct and improves merging.

**Not modelled yet:** end-of-turn residuals (burn, poison, sand, Leftovers) and hazards. KO
chances from `resolveTurns` are therefore move-damage-only and will understate attrition wins.

### Turns-to-KO is a distribution, not a number

`knockoutByTurn` is the **CDF** of the knockout turn. The question a user actually asks —
*"how many turns does it take?"* — wants the **PMF**, its first difference. Lucario Aura Sphere
into 252/252 Blissey is the worked example:

| turn | faints exactly then | cumulative |
| --- | --- | --- |
| 3 | 0.44% | 0.44% |
| 4 | **88.64%** | 89.08% |
| 5 | 10.92% | 100% |

So "4HKO, 3–5 turns", where `@smogon/calc` would render a single "guaranteed 5HKO" line. The
server exposes this as `ko.exactlyOnTurn` beside `ko.chances`, plus `earliestTurn`,
`likeliestTurn` and a human `summary`.

**Censoring is the trap.** `resolveTurns` runs a fixed horizon, so mass that has not fainted by the
last turn is *not* absent — it is unresolved. A default horizon of 4 silently truncated the
example above. `ko.unresolved` now reports it and the debug chart draws it as a distinct grey
"none" bar. **Never present a turns-to-KO distribution without the residual mass** — it is the
difference between "3–5 turns" and "3–5 turns *or longer*".

### Still wanted: per-turn HP distribution

`resolveTurns` returns only the final distribution plus `knockoutByTurn`. A fan chart of remaining HP
by turn (median with 25/75 and 10/90 bands) needs a per-turn snapshot recorded inside the
existing loop — cheap to add, and the natural companion to the turns-to-KO PMF.

## Secondaries

`secondaryBranches` cross-products each secondary's trigger, GCD-reduced (a 10% burn is 1/10,
not 10/100). Sheer Force and Shield Dust remove the branch entirely; Serene Grace doubles the
chance. Effects applied: `status` (respecting type immunities and an existing status),
`boosts`, `self.boosts` and `volatileStatus`, all skipped when the target has fainted.

Deliberately rejected rather than approximated: secondaries on multi-hit moves (they would
push weights past the exact horizon), status secondaries against abilities that block or
redirect status, and boost secondaries against Contrary/Simple/Clear Body and friends.

## More bugs this phase surfaced

- **Ability `onModifyMove` handlers were never called.** `Context.Move.updateData` ran the
  *move's* `onModifyMove` but not the attacker's ability's — so Sheer Force never set
  `hasSheerForce` and its damage boost never applied. Item `onModifyMove` was missing too.
- **Utility Umbrella was entirely non-functional.** The weather block compared
  `pokemon.item?.id` (an id, `utilityumbrella`) against the display name `'Utility Umbrella'`,
  so the check never matched.
- **Water moves did full damage under Harsh Sunshine** (and Fire under Heavy Rain) instead of
  failing outright. Now handled by `onTryImmunity` on the weather condition.
- **Collision Course / Electro Drift had no handler at all**, which was one of the three
  baseline failures. Added, and that test now passes.
- **The oracle was measuring end-of-turn residual as move damage.** `simulateBranch` read HP
  before and after the whole turn, so a burn inflicted by the move's own secondary added
  `maxhp/16` to every reported figure. It now reads the move's own `-damage` lines from the
  battle log, ignoring anything tagged `[from]`. This was invisible until a move with a status
  secondary was tested — **earlier oracle results were only correct because nothing residual
  was in play.**

---

## Original Phase 4 list (kept for reference)

Sequenced only after the ladder is green. Rough order:

1. **Widen the branch cascade** — secondaries, Sash/Sturdy, berry procs, contact recoil.
2. **`apply` coverage.** The long tail. This is what turns a calculator into what this
   project is actually for, and it is where the months are.
3. **Tier 3 search** — turns and games, with the `Policy` interface and epsilon pruning.
   Plan the horizons explicitly: exact at depth 1–2, merged + pruned at 3–5, sampling beyond.
   Discovering these by hanging the server is the failure mode.
4. **Fix `Result.knockout`** — it ignores its own `KOType` parameter today: no hazards, no
   residual, `exact: true` hardcoded.
5. **Gen 9 essentials** — ✅ **Tera done 2026-09-04** (`src/test/tera.test.ts`, 17 tests).
   Weather and terrain are still hardcoded inline in `calculateDamage` with a
   `// Convert to weather handler` note; `Conditions` still contains exactly two entries,
   `brn` and `par`.

   Tera needed three fixes before the STAB rule could even be written:

   - **`options.teraType` was silently discarded.** `createPokemon` did
     `pokemon.teraType = pokemon.types[0]` unconditionally, so the declared option never
     survived. It now defaults only when nothing was asked for.
   - **There was no way to say "is terastallized".** Added `terastallized` to `State.Pokemon`
     and `Context.Pokemon`, plus `baseTypes` alongside `types` — because terastallizing
     changes *defensive* typing too, `Context.Pokemon.types` becomes `[teraType]` while
     `baseTypes` keeps the originals. `toState` round-trips the base types, not the
     substituted ones, and `stateKey` includes the flag.
   - **`getStabModifier` now mirrors sim exactly**: 1.5× when the move type matches either the
     effective or the base types, and **2× only when terastallized into a type that is also a
     base type**. Adaptability chains to 2× / 2.25× accordingly, and Protean/Libero force STAB.

   Verified against the oracle for tera-into-an-existing-type, tera-into-a-new-type, off-type
   moves after terastallizing, a terastallized *defender* (including teraing into an immunity),
   and both Adaptability cases.

6. **A STAB rounding bug, found by the Adaptability 2.25× case.** STAB was applied as a raw
   `trunc(d * stabMod, 32) / 0x1000` with **no rounding step**, deferring to a later `floor` —
   so it truncated where the cartridge rounds. Sim's `modify()` is exactly dmg's own
   `applyMod` (round-half-down), and the line now uses it. This was off by one on 4 of 16
   rolls at 2.25×; earlier 1.5× tests had passed only because the intermediate values happened
   to be even. **Any other place that applies a modifier by hand rather than via `applyMod` is
   suspect for the same reason.**
6. **Expose it.** Nothing consumes the damage path today. Server endpoint, then client UI.

### State-space budget

Merged state space is bounded by `hp1 × hp2 × boosts × status × volatiles` rather than
growing exponentially — but `hp1 × hp2` alone is ~160k. Merging makes depth *tractable*, not
free. Pruning is mandatory past depth ~3.

---

## Open decisions

Tracked here until resolved; move each into Phase 1 with its rationale once decided.

All Phase 1 decisions are closed (2026-09-03):

- [x] Generation scope — **gen 9 first, nothing baked in**
- [x] Package name and publishing mechanism — **`@pdz/calc`, dual cjs/esm, `git+file:` tag**
- [x] Where the calculator runs — **server-only; client stays `@pkmn`-free**
- [x] Probability representation — **`number` numerator/denominator, GCD-normalised,
      safe-integer assertion as the exact horizon**
- [x] Fate of `pdzCalculateStrength` — **deleted** (server keeps its own copy)
- [x] Shape of the `Rules` profile — **decided; migration opportunistic**
- [x] Golden fixtures — **in this repo, not the server**
- [x] `pokemon-draftzone-server/dmg/` — **deleted once `speedchart.ts` imports `@pdz/calc`**

Carried forward as implementation work rather than decisions:

- [x] **Phase 0 step 3 — `@pkmn/*` aligned on 0.10.11** (2026-09-04). `@pkmn/data`, `@pkmn/sim`,
      `@pkmn/dex` and `@pkmn/mods` all on the latest, matching the server. Four type errors,
      all in `Context.Move`: 0.10 **removed** `null` from `secondaries`/`secondary`/`self`/
      `heal` and made `secondaries` required, so dmg's wider declarations no longer matched the
      base. Every oracle test still passes against sim 0.10.11.
- [x] **`@pdz/calc` built and wired** (2026-09-04) — see below.

### From the architecture review (2026-09-04)

API ergonomics and cleanup surfaced while reviewing the tier/layer design against the goal of
chainable composition. Not decisions yet — flagged for follow-up, not agreed to be built:

- [x] **`Distribution<T>.flatMap`** ✅ **DONE 2026-09-05** — `distribution.ts`, same-type
      (`(T) => Distribution<T>`) so it reuses the instance's own `Keyer`, with 5 tests in
      `distribution.test.ts`. Sub-distributions of differing width are put on a common denominator via
      `leastCommonMultiple` before merging, so exactness holds across heterogeneous branches; verified
      that a 2-way and a 3-way branch from equally-weighted inputs land at 1/4 and 1/6, and that five
      chained binary splits stay inside the exact horizon. **Call-site migration is still open** —
      `turns.ts`'s turn loop and `advance()` still hand-roll their own merge loops. Migrate them when
      building the turn tier, which is where it pays; `resolveTurns` needs the float+pruning variant, not
      this one.
      The standing rule it encodes: **mechanic functions stay `State → Distribution<State>`** — do not
      reshape `resolveMove`/`resolveTurns` to take `Distribution<State>` as input. The single-state-in
      signature is what makes oracle differential-testing a clean one-to-one comparison, and keeps the
      per-call branching-factor budget (~128 raw branches) auditable regardless of caller-supplied
      ensemble size. `flatMap` gets the chainability by lifting `State → Distribution<State>`
      generically, which only works in that direction.
- [ ] **`Applier.apply` should be pure.** Currently `(side, state, guaranteed?) => void`, mutating —
      the one place left in tier 2 that isn't `(State) => State`, predating the pure style
      `withDamage`/`applySecondaries`/`startOfTurn` settled into during Phases 2–4.
- [ ] **Delete the dead `Moves` branch in `Appliers.apply`** (`mechanics/index.ts`, the
      `// TODO apply secondary!` stub that loops secondaries and does nothing). It's reaching for the
      branch-then-apply pattern `resolve.ts`'s `secondaryBranches`/`applySecondaries` already
      implements correctly. Keep `Applier` scoped strictly to deterministic, non-branching
      preconditions ("the user asserts Swords Dance already happened") — anything with a probability
      attached belongs in a branch+apply pair, not in `Applier`.

### From the tier granularity review (2026-09-04)

Auditing which mechanics fire at which granularity (per hit / per move / per turn / on a damage
threshold) surfaced gaps at specific, identifiable seams — not a missing tier. Not decisions yet:

- [ ] **Per-hit damage-triggered procs are one hardcoded special case, not a mechanism.** Stamina's
      Def+1 is a literal `defender.ability === 'stamina'` check inside `withDamage()`
      (`resolve.ts`). Rough Skin, Rocky Helmet, Sticky Barb are recognized only well enough to make
      `assertSupported` reject the move (`CONTACT_PUNISHING_ITEMS`/`_ABILITIES`) — their handler
      table entries (`abilities.ts:2138`, `items.ts`) are empty stubs. Needs a real branch-then-apply
      step inside `advance()`, right after `withDamage()`, using the same pattern as
      `secondaryBranches`/`applySecondaries` but scoped to one hit instead of the whole move.
- [ ] **Per-hit secondaries on multi-hit moves are explicitly rejected**, not silently wrong — correct
      given the current site (secondaries currently only fire once, after the whole hit loop, not
      per hit) but the actual fix is relocating the existing secondary mechanism to fire inside the
      hit loop, not building a new one.
- [x] **Sturdy / Focus Sash silently resolved wrong** ✅ **FIXED 2026-09-05** — implemented rather
      than rejected, since rejecting would have refused every calc against a full-HP Sturdy target
      (Shuckle, Donphan) even when the move does 5% damage. `endures()` in `resolve.ts` survives at
      1 HP when the defender is at full HP and the hit would otherwise faint it; Focus Sash is
      consumed (`item` cleared on the outcome state), Sturdy is not, and Mold Breaker / Teravolt /
      Turboblaze / `move.ignoreAbility` punch through. Multi-hit falls out correctly with no special
      case — after hit 1 the target is no longer at full HP, so hit 2 lands normally. 6 tests in
      `resolve.test.ts`. **Focus Band is now rejected** in `unsupportedReasons` instead: its 10%
      survive is a genuine branch, not a deterministic clamp, and modelling it needs a branch+apply
      pair rather than a `withDamage` clause.

      Note this **added a second hardcoded per-hit ability check next to Stamina**, which is exactly
      the pattern the item above says to generalise. Deliberate: two hardcoded cases with a recorded
      TODO beats a calculator that lies. Fold both into the per-hit proc mechanism when it is built.
- [ ] **`onResidual` is a hook declared on both ends and wired to neither.** `Handler.onResidual`
      (`handlers.ts:23`) is threaded through `Context.Move`'s type, but every occurrence across
      `abilities.ts`/`items.ts`/`moves.ts` is commented-out PS source (zero real bodies), and there is
      no call site anywhere in `resolve.ts`, `turns.ts`, or `mechanics/index.ts`. End-of-turn
      residual (burn/poison/sand tick, Leftovers, weather/screen decay, Leech Seed) needs a new
      Kleisli arrow of the same shape as `resolveMove` — `endOfTurn(State) → Distribution<State>` —
      that `resolveTurns()` flatMaps in between resolving the move and advancing to the next turn, using the
      same composition primitive as the `Distribution.flatMap` item above.
- [ ] **Switching is not modeled as an event at all — scope question, not yet decided.** A faint is
      currently a terminal state in `resolveTurns()`; there is no representation of a new Pokémon coming in
      afterward. Hazards, Intimidate, and other entry abilities have no trigger point without it.
      Needs an explicit scope decision — is multi-Pokémon/switch modeling in scope for this project,
      or is 1v1-until-faint the intended horizon — before anything gets built toward it.
      **Answered 2026-09-05 — see "Scope: the full-game target" below.**

---

# Scope: the full-game target (decided 2026-09-05)

**The end goal is full game scenarios**: many teams, `p` Pokémon each, `s` sides, a field with its
own state. The engine must degrade gracefully — sometimes it is Lucario vs. Blissey with only
Lucario attacking, sometimes both attack, sometimes it is a whole battle. Flexibility across that
range is the requirement, not a stretch goal.

**Latitude — large changes are encouraged right now (2026-09-05).** The project is early enough that
breaking changes to `State`, the tier boundaries, or the public API are cheap and explicitly welcome.
Nothing here needs to preserve compatibility with the current shape and no consumer depends on it.
The operative implication: prefer making the structural change correctly over layering a compatible
shim on top of a shape that is known to be wrong. This window closes as the mechanics long tail
fills in — the same change costs progressively more with every handler written against the old shape.

## What this does and does not invalidate

Scope-independent, survives untouched: the damage formula and cartridge math, `Context`/`Handler`
reification, `Distribution` and its GCD/exactness machinery, `stateKey`'s normalisation rules, and
the enumerate-don't-sample oracle methodology. The `State → Distribution<State>` shape is likewise
orthogonal to how large the state is — that is how Markov chains are formalised at any size.

**What does not survive is `State` itself.** It is a *calculation input*, not a battle state, and the
asymmetry is structural rather than cosmetic:

- `p1`/`p2` are two named fields, not a collection.
- `Side.pokemon` is a single Pokémon. `active?` carries only `{ability, position, fainted}` (for
  Plus/Minus, Fairy Aura, Friend Guard) and `team?` only `{species: {baseStats: {atk}}, status,
  fainted, position}` (for Beat Up). A benched Pokémon's HP, item or boosts are **unrepresentable**.
- `State.move` is singular and top-level, so a second actor's action has nowhere to go.
- Consumers bake it in too: `withDamage()` only damages `p2.pokemon`; `resolveTurns()`'s `knockedOutMass`
  and `startOfTurn` only inspect `p2`; `Context` exposes `get attacker()`/`get target()` as `p1`/`p2`;
  tier 1's `offensiveBoost`/`defensiveBoost` read `p1`/`p2` directly.

## The missing tier is the turn

This supersedes the "no missing tiers, only missing composition seams" reading from the granularity
review — that was correct only for a 1v1, one-attacker scope.

| Tier | Job | Status |
| --- | --- | --- |
| 1 — damage | the formula, 16 rolls | exists |
| 2 — one **action** | roughly today's `resolveMove` | exists |
| **2.5 — one turn** | speed-order branch → actions in order with cancellation → end-of-turn residuals | **missing** |
| 3 — many turns | policy, pruning, switching on faint | partial (`resolveTurns`) |

`resolveTurns()`'s "turn" is currently just "p1 uses one move," which is precisely why residuals, opponent
actions and speed order have nowhere to live. Two things make tier 2.5 cheaper than it looks:
`advance()`'s `finished` flag is already turn-order cancellation in miniature (an actor that fainted
before acting is the same shape as a multi-hit step that missed and stopped), and speed order is just
another branch function in the mould of `critBranches`/`hitCountBranches` — ties are genuinely 50/50
and unknown investment is a distribution.

Once actions are first-class, `Applier` shrinks further still: "click Swords Dance" becomes an
ordinary action, and `Applier` is left asserting only user-declared *initial* conditions.

## Three kinds of uncertainty — only one is solved

- **Stochastic outcomes** (rolls, crit, secondary chance) — enumerated exactly. Solved.
- **Simultaneous choice** (both sides choose blind) — game theory; handled by the injected `Policy`.
- **Hidden information** (unknown spreads, items, sets) — a belief over states, not a distribution
  over outcomes. A battle against an unknown team is a POMDP, not a Markov chain, and no amount of
  `Distribution<State>` machinery models it.

DraftZone is unusually well placed here: draft picks are public, so species are known and only
spreads/items are uncertain. Keep that an explicit boundary rather than discovering it later.

## Proposed staging — not yet agreed

The asymmetry removal is cheapest now and gets more expensive with every mechanic added, and the
mechanics long tail (`apply` coverage, per-hit procs, residuals) is explicitly the multi-month work.
Doing this with ~4 consumer sites to update beats doing it with 50. **Do not build the full model
speculatively** — make the minimal change that removes the asymmetry and let the rest grow.

### Reshape decomposition (2026-09-05)

Sizing first: `p1`/`p2` appears **~264 times in source and ~241 in tests**, across 30+ files —
including `result.ts` (48, the legacy convolution path), `parse.ts`/`encode.ts` (70, where `p1`/`p2`
is *user-facing* text-format vocabulary), and `conditions.ts` (45, which exports a `Player` type).
`Relevancy` mirrors `State`'s shape exactly and `Relevancy.simplify` rebuilds a `State` from it, so
it must move in lockstep. Too large for one safe pass, so it splits along the classic
**rename-then-restructure** line:

- [x] **Slice A — behaviour-preserving rename** ✅ **DONE 2026-09-05.** `Context` gained
      `attackerSide` / `targetSide` / `relevantAttacker` / `relevantTarget` accessors alongside the
      existing `attacker` / `target`, and every `Context` consumer in `mechanics/index.ts`,
      `context.ts` and `result.ts` moved off `context.p1` / `context.p2` onto them. No shape change,
      no behaviour change — 251 tests still pass with the same two baseline failures, `tsc` clean.

      This matters because those consumers were never really asking for "p1", they were asking for
      "whoever is acting in this action" — the asymmetry was in the *naming*, not the logic. Slice B
      now only has to change what those four accessors resolve to, instead of ~79 scattered call
      sites. The five `relevant.p1.pokemon.X = true` writes in `result.ts` (which use a *passed-in*
      `Relevancy`, not the context's) are deliberately funnelled through one private
      `relevantAttacker()` seam at `result.ts:131` — a single line for Slice B to change.

- [x] **Slice B — the structural change** ✅ **DONE 2026-09-05.** `tsc` clean; 251 passed / 1 todo /
      2 failed — identical to the pre-reshape baseline, and the two failures are the same documented
      mechanics gaps.

      Landed: `State.sides: State.Side[]` and `Side.active: Pokemon[]` (the partial-ally array was
      renamed to `Side.allies` first to free the name); `State.action` with `actor`/`target` `Slot`s
      replacing the ownerless top-level `move`; `Relevancy` mirroring it as `sides[]` with
      `side(i)`/`pokemon(slot)` accessors; `Context` addressing `attackerSide`/`targetSide` via the
      action and holding the source `State` so `toState()` preserves non-participating sides;
      slot-addressed writes via `State.withPokemonAt` / `withSideAt` / `withMove`; `key.ts` keying a
      list of sides plus an `actionKey`; and `parse.ts`/`encode.ts` mapping the text format's `p1`/`p2`
      vocabulary onto side indices — **the text format itself did not change.**

      `State.oneOnOne(gen, attacker, defender, move, field?, gameType?)` keeps the common case one
      call, and is what every existing test now uses. `state.attacker` / `state.target` /
      `state.attackerSide` / `state.targetSide` / `state.move` are getters resolved through the
      action, so mechanics code reads the same as before while no longer assuming p1 attacks p2.

      **One behaviour change rode along, deliberately:** `Context.Side`'s constructor read
      `this.allies = this.allies?.map(...)` — reading a field it had never assigned, so
      `context.targetSide.allies` was *always* `undefined` and Friend Guard could never fire. It now
      reads `side.allies`. No test moved as a result, but this is a real fix hiding inside a refactor.

      Test-diff note: the only non-mechanical test change was `state.test.ts`'s `createSide` shape
      assertion (`{sideConditions, pokemon}` → `{sideConditions, active: [pokemon]}`) and collapsing
      `assert.deepStrictEqual(a.p1/b.p1, a.p2/b.p2)` into one `a.sides`/`b.sides` comparison. No
      assertion was weakened or deleted.

- [ ] **Slice B leftovers.** What was deliberately *not* done: `State.sides: Side[]` /
      `Side.active: Pokemon[]` (the existing partial-ally `Side.active` needs renaming to `allies`
      first to free the name), `State.action` with `actor`/`target` slots replacing the ownerless
      top-level `move`, `Relevancy` mirroring all of it, slot-addressed writes in `resolve.ts`,
      `key.ts` keying a list, `Context.toState()`, and `parse.ts`/`encode.ts` mapping the text
      format's `p1`/`p2` vocabulary onto `sides[0]`/`sides[1]` (the text format does **not** have to
      change — it can keep its user-facing names).

- [ ] **`State` holds `sides: Side[]` with `active: Pokemon[]`** rather than `p1`/`p2` with a singular
      `pokemon`. A list keeps N sides open without paying for it, and 2 sides × N active already covers
      doubles/VGC — the 99% case. True free-for-all must not drive the design.
- [ ] **Actions become explicit and addressable** (actor slot + move) instead of one top-level
      `state.move`. This is what unblocks "both attack" and the turn tier.
- [ ] **Damage targets a slot, not `p2`.** Same for the KO checks in `resolveTurns`.
- [ ] **Build tier 2.5 (the turn)** — it buys both "both attack" and end-of-turn residuals at once.
- [ ] **Keep the simple case one line** via a `State.oneOnOne(...)`-style constructor. Generality of
      the model must not become verbosity at the API.
- [x] **Fix per-branch `Context` reification first.** ✅ **DONE 2026-09-05.** `tsc` clean; 257 passed /
      1 todo / 2 failed — the 6 new tests on top of the same baseline, same two documented failures.

      `damageRolls` no longer builds a `State` and a `Context` per branch. `resolve.ts` threads one
      `Reification` (`context.ts`) through the branch tree, which hands out a `Context` per *distinct
      state* and reuses every sub-context whose source `State` fragment is unchanged **by reference** —
      which works precisely because `withPokemonAt` / `withMove` share everything they don't touch.
      Reused today: `Context.Field`, and each side's `sideConditions` / `allies` / `team`.

      Two things fall out of the design that are worth stating:

      - **Reuse is gated on the `Relevancy` being the same object.** A reified handler closes over the
        `Relevancy` fragment it was built against, so sharing a sub-context across two different
        `Relevancy` objects would silently record provenance into the wrong one. `Reification` threads
        one `Relevancy`, and the constructor refuses to consult `previous` unless it matches. The
        effect is that a derived `Context`'s relevancy is the **union across the branches evaluated**,
        which is the sound form this document already asks for.
      - **`Context.Pokemon` is deliberately *not* reused.** It holds `side` and `move` back-pointers
        (`sniper` reads `pokemon.move.crit`, the weather abilities read `pokemon.side.field.weather`),
        so sharing one across contexts would need those rewired on every hand-out and would alias the
        parent context's Pokemon. Removing the back-pointers means passing `Context` to ability and
        item handlers instead of the bare Pokemon — a real change to ~130 live handler signatures, not
        worth spending here.

      **Crit is now applied after `updateData`, not before.** `damageRolls` sets `context.move.crit`
      on an already-built context rather than baking the flag into a `State.Move` first. That is how
      the cartridge orders it — crit is rolled after the move's data is resolved — and no live handler
      reads `crit` during `updateData` (only `sniper`, at damage time, via `getFinalModifier`).
      `context.test.ts` pins the invariant so a future crit-reading `basePowerCallback` fails loudly
      instead of silently changing a branch.

- [ ] **`stateKey` is the actual bottleneck — `Context` reification never was.** Measured while doing
      the item above, and it inverts its premise. Profiling one `resolveMove` of Rock Blast
      (Cloyster → Blissey):

      | | calls | time | share |
      | --- | --- | --- | --- |
      | `stateKey` | 40,050 | 239.5ms | **79.6%** |
      | `calculateDamage` | 2,450 | 5.3ms | 1.8% |
      | everything else (incl. all `Context` construction) | | ~56ms | ~19% |

      So the fix above bought ~3.3× on the per-branch path (14.3µs → ~4.3µs: move spread 5.06 → 0.05µs,
      `Context.fromState` 7.93 → 6.20µs and now amortised across crit branches, `calculateDamage`
      1.19 → 1.11µs) and moved the end-to-end number very little, because the per-branch path was never
      where the time was.

      The prediction that it *"will not hide at 12"* was right about the symptom and wrong about the
      mechanism: adding 5 allies + 6 team members per side took Rock Blast from 247ms to 501ms, but
      that is `stateKey` serialising allies and team on every branch, not `Context` copying them. That
      case is now 279ms.

      **The fix is the same reference-identity trick, one layer up:** memoise `pokemonKey` / `sideKey`
      on object identity in a `WeakMap`, because the attacker's side is keyed once instead of 40,050
      times. Measured on the real branch shape against the full keyer, with output asserted identical
      to the current one:

      | | per call | vs today |
      | --- | --- | --- |
      | `stateKey` today | 5.45µs | — |
      | + `WeakMap` memo on `sideKey` | 0.834µs | 6.5× |
      | + building the key by concatenation instead of `map`/`join`/`sort` | 0.370µs | **14.7×** |

      **The concatenation half shipped 2026-09-05** — a local rewrite of `key.ts` with no assumptions
      attached, output format unchanged. It beat its own estimate:

      | | before | after |
      | --- | --- | --- |
      | `stateKey` | 5.45µs | **1.63µs** (3.3×) |
      | Aura Sphere resolve | 0.97ms | **0.49ms** |
      | Rock Blast resolve | 233ms | **129ms** |
      | Icicle Spear resolve | ~300ms | **166ms** |
      | Rock Blast + 5 allies + 6 team | 279ms | **184ms** |
      | `resolveTurns(Aura Sphere, 4 turns)` | 89ms | **57ms** |
      | **576-calc matchup grid** | ~560ms | **136ms** |

      **The memo half also shipped 2026-09-05, but only on `sideKey` — and the reason matters.**
      Memoising `pokemonKey` as well made `resolveMove` *slower* (Rock Blast 129ms → 149ms), because
      the benchmark that justified it re-keys the same states while a real resolve keys each state
      exactly once: every fresh target Pokémon paid a `WeakMap.set` that was never read again. A
      memo-hit `sideKey` short-circuits before it ever calls `pokemonKey`, so the per-Pokémon memo
      earned nothing on the attacker either. Side-only is free where it cannot help and worth 1.6× on
      the grid where it can:

      | | concat only | + per-Pokémon memo | + side-only memo |
      | --- | --- | --- | --- |
      | Rock Blast resolve | 129ms | 149ms | **129ms** |
      | 576-calc grid | 136ms | 94ms | **85ms** |
      | `resolveTurns(Aura Sphere, 4 turns)` | 57ms | 45ms | **41ms** |

      **The lesson generalises: memoise the fragment that *repeats*, not the one that changes.** In a
      resolve the target mutates every branch and the attacker never does.

      **The soundness contract this now rests on**: a `State.Side` must not be mutated after it has
      been keyed. Construction-time mutation is fine — the memo only sees objects once keying starts.
      The one place that could violate it is `Appliers.apply`, which mutates a `State` in place; there
      is exactly one real `apply` in the mechanics tree today, which is why settling this now was
      cheap. Any new `apply` must return a new `State` rather than mutate a keyed one.

      **The memo is blocked on one decision, deliberately not taken here:** memoising on object identity is
      only sound if a `State.Pokemon` is never mutated after it has been keyed — which is exactly the
      *"Builder outputs are immutable values"* decision still open under "The end-user API" below, and
      the live inconsistency it names (`State.Pokemon` is documented mutable and `Applier` mutates it,
      while `resolve.ts` spreads everywhere and treats states as immutable). Settle that first; a stale
      key silently merges distinct states and corrupts every probability downstream, which is the one
      failure mode this project cannot absorb.

      For scale, the same profiling found `resolveTurns(Rock Blast, 2 turns)` takes **52.7 seconds**. Tier 3
      over a multi-hit move is not usable until the keyer is fixed.

- [x] **Population Bomb could not be resolved at all.** ✅ **FIXED 2026-09-05** — it now resolves in
      127ms with mass conserved to 12 decimal places, as does the Loaded Dice variant. Found by
      walking up the multi-hit ladder; it was not a speed problem but a hard failure on a legal gen 9
      move:

      | | outcomes | denominator | |
      | --- | --- | --- | --- |
      | Rock Blast | 513 | 6.18e13 | ok, ~145× under the horizon |
      | Icicle Spear + Loaded Dice | 158 | 1.67e13 | ok |
      | Population Bomb | — | 6.97e35 | **throws** |
      | Population Bomb + Loaded Dice | — | 4.88e36 | **throws** |

      `resolveMove` puts every branch on the common denominator `expansion ** maxHits`, where
      `expansion` is `totalWeight(hitAccuracy) * critExpansion` — 384 for an ordinary crit ratio, and
      3,840 once a 90%-accuracy `multiaccuracy` move multiplies it. At 10 hits that is `3840^10`, some
      20 orders of magnitude past `2^53`, so the counts stop being exact integers and the totals no
      longer agree.

      **The error blames the wrong thing.** It surfaces as `ProbabilityMassError` ("probability mass
      changed during merge"), which reads as a merge bug. The mass did not change; the *counts* left
      the safe-integer range. `assertExact` checks mass before it checks the horizon, so
      `ExactHorizonError` — the diagnosis that would actually point here — never fires. Fix the
      ordering regardless of what else is done, or the next person debugs a phantom merge bug.

      **GCD normalisation cannot fix this — measured, not assumed.** The obvious move is to normalise
      the step map after each `advance` pass instead of only at the end. It buys exactly nothing: the
      counts are coprime at every single pass, because hit 1 already produces counts of 23 (non-crit)
      and 1 (crit) and a 1 never leaves the set.

      | after hit | states | denominator | gcd |
      | --- | --- | --- | --- |
      | 1 | 32 | 3.84e2 | 1 |
      | 2 | 125 | 1.47e5 | 1 |
      | 3 | 215 | 5.66e7 | 1 |
      | 4 | 287 | 2.17e10 | 1 |
      | 5 | 250 | 8.35e12 | 1 |
      | 6 | 158 | 3.21e15 | 1 |
      | 7 | 65 | 1.23e18 | 1 — **past 2^53** |

      So **any move of 7+ hits is exactly unrepresentable in float64 integers**, independent of which
      move it is. Note the shape of that table: the state count peaks at hit 4 and then *falls* as the
      target dies. The distribution being computed is small and getting smaller — it is only the
      bookkeeping that explodes. Paying 18 digits of denominator to describe 65 states is the tell.

      **Resolved in favour of float past the horizon** (Phase 1 decision #4 settled by use, 2026-09-05).
      The key realisation is that **the arithmetic never needed changing** — JS numbers are already
      float64, and summing positive counts has no cancellation, so past `2^53` the sums stay correct
      to ~1e-16 *relative*. Only the assertion was broken. So:

      - `Distribution.assertMassConserved(expected?)` is the new check: exact equality while both
        totals are safe integers, relative tolerance (`1e-9`) once they are not. `resolveMove`,
        `flatMap`, `combine` and `chain` all use it, so **any hit count works**.
      - `assertExact` keeps its original strict meaning and still throws `ExactHorizonError`, for
        callers that genuinely require exactness.
      - `Distribution.exact` reports which régime a result is in. `normalize()` skips its GCD reduction
        when inexact, since a "GCD" of non-integers is meaningless.

      Nothing underflows, which was the other worry: the smallest probability in a ten-hit enumeration
      is ~1e-36 against float64's ~1e-308 floor, so no branch needs discarding for representability.
      Pruning tiny branches remains a separate, deliberate choice.

      **Still unverified: the mechanics, not the arithmetic.** The `@pkmn/sim` oracle does not cover
      7+ hit moves, so Population Bomb's numbers are self-consistent and mass-conserving but have never
      been differentially tested. Extending `oracle.ts` up the ladder is the follow-up.

- [x] **`assertExact` blamed the wrong thing.** ✅ **FIXED 2026-09-05.** It checked `total !==
      expectedTotal` before `Number.isSafeInteger(total)`, so once past the horizon both numbers were
      float-rounded differently and it raised `ProbabilityMassError` ("mass changed during merge") —
      a phantom merge bug — instead of `ExactHorizonError`, which names the actual condition. The
      horizon is now checked first, on both totals.

- [ ] **Tier 3 is unbounded, and `maxOutcomes` is the wrong tool to bound it.** `resolveTurns` costs
      (states carried into a turn) × `resolveMove`, so a multi-hit move is brutal:
      `resolveTurns(Rock Blast, 4 turns)` is **90s**, against 57ms for Aura Sphere. Depth is not the
      driver; state count is.

      "Runtime budget" above asks for *"exact at depth 1–2, **merged** + pruned at 3–5"*, and only the
      pruning half exists. **Turning it on by default was tried on 2026-09-05 and reverted, because it
      makes the answer wrong**, not merely approximate. `capOutcomes` keeps the top N outcomes by
      probability, which suits a peaked distribution; an HP distribution is smooth, so 500 states each
      carry ~0.002 and keeping N keeps roughly N/total of the *mass*:

      | cap | time | pruned mass | KO by turn 4 |
      | --- | --- | --- | --- |
      | 500 | 93s | 0.049 | 0.896 |
      | 200 | 42s | 0.311 | 0.663 |
      | 100 | 18s | 0.525 | 0.465 |
      | 50 | 12s | 0.768 | 0.227 |
      | 25 | 6s | 0.899 | 0.099 |

      Half the probability mass discarded at cap=100. `prunedMass` does report it, so it is not
      *silent* — but `knockoutByTurn` becomes a severe underestimate with nothing in that number
      saying so. **Do not ship a default `maxOutcomes`.**

      The missing half is *merging*: bin nearby HP values into one representative instead of dropping
      the tail, which conserves mass. That is a real departure from decision #3 (*"nodes merge on
      resulting state, never on path"*) — binning merges states that are genuinely distinct — so it
      needs deciding rather than sliding in.

      **Interim, shipped 2026-09-05: `TurnsOptions.maxResolves`.** A `resolveMove` budget. When it is
      exhausted, remaining states are carried forward *unadvanced* rather than dropped, so mass is
      conserved exactly and knockout chances become an honest **lower bound** instead of a distorted
      one. `TurnsResult` gained `unexpandedMass` (frozen mass at the horizon, reset per turn) and
      `resolves` (what it actually spent). Default is unlimited, so library behaviour is unchanged;
      the `/calc` endpoint sets one.

      **The budget was the wrong answer, and shipping it proved the point.** Turn 2 of a multi-hit
      move needs one `resolveMove` per turn-1 outcome — 500+ at 130ms each — so any budget small
      enough to be fast reported a floor far below the truth: **12 resolves gave a 1.7% two-turn KO
      where the real figure is 41.4%.** A lower bound that loose is not conservative, it is wrong, and
      it contradicted the survival-function chart on the same page.

- [x] **Project the target's HP marginal instead.** ✅ **DONE 2026-09-05.** The insight the budget
      work surfaced: when the only thing varying across a turn's outcomes is the target's HP, every
      turn shares the *same* damage distribution, so the whole state-space projection is wasted work.
      One `resolveMove` plus an HP-marginal iteration gives the identical answer.

      Verified rather than assumed — `turns.test.ts` runs both paths and requires agreement to nine
      decimals (an earlier 1e-5 gap turned out to be the full path's epsilon pruning, not a modelling
      difference):

      | | before | after |
      | --- | --- | --- |
      | Aura Sphere, 10 turns | 60ms | **6ms**, full |
      | Rock Blast, 10 turns | 1141ms, turn 1 only | **270ms**, full — 5HKO |
      | Population Bomb, 10 turns | unanswerable | **606ms**, full — 2HKO, 41.4% on turn 2 |

      **The gate is the whole risk.** `damageIgnoresTargetHp` requires that every outcome keys
      identically to the input once its HP is restored — generic, via `stateKey`, so it catches
      status, boosts, item loss and volatiles without a hardcoded field list — *and* that the target's
      ability and item and the move are outside the sets that actually read target HP (`multiscale`,
      `shadowshield`, `sturdy`, `figyberry`, `sitrusberry`, `focussash`, `brine`, `crushgrip`,
      `naturesmadness`, `superfang`, `wringout`). Those were derived by grepping the handler tables
      for live reads of `target.hp`, which is a snapshot, not an invariant: **a new handler that reads
      HP without being added to those sets makes the fast path silently wrong.** That is the one place
      this design can rot, and it is why the equivalence test matters more than the speed.

      This is the *merging* half that "Runtime budget" asked for, in its lossless special case: HP is
      not being binned, it is being recognised as the only dimension that varies. Genuine binning —
      collapsing nearby HP values when other dimensions vary too — remains open, and is what the
      Multiscale/Sturdy/berry cases still fall back to the budgeted full projection for.

- [x] **Moves whose own data branches randomly now enumerate those branches.** ✅ **DONE 2026-09-08.**
      Found while looking at Fickle Beam, which `resolveMove` answered as a flat 80 BP — the 30%
      double appeared nowhere in the distribution, and nothing refused the move, because
      `mechanics/moves.ts` simply had no entry for it. The same failure class `present` had just been
      quarantined for, except Fickle Beam was not on the quarantine list.

      The gen 9 census is small: **Fickle Beam** (30% ×2 BP), **Present** (20% heal / 40% 40 BP /
      30% 80 BP / 10% 120 BP), **Shell Side Arm** (50/50 category, but only on an exact damage tie),
      and Acupressure / Conversion 2 / Metronome / Sleep Talk, which are not damage branches.

      `Moves.<id>.branches` declares `{label, weight, move?}` and `resolveMove` runs once per branch —
      a fifth axis beside accuracy, hit count, crit and secondaries. Unbranched moves get one
      synthetic branch of weight 1, so their arithmetic is unchanged bit for bit; the branch weights
      join the common denominator by LCM rather than by assuming every branch expands identically.

      **Move data is the mechanism; `label` is telemetry and nothing reads it.** The first cut had
      Fickle Beam's `onBasePower` test `context.move.branch === 'allOut'`, which tied a damage
      calculation to a reporting name — rename the label in the report and the number changes. A
      branch now sets real move data and handlers read that. This was possible because
      `Reification.of` builds a fresh `Context` every call and reuses fragments only by reference
      identity, so nothing ever needed the branch in `moveKey` to keep two branches' contexts apart.

      **`State.Move.flags` became an open bag rather than a declared field per mechanic.** Fickle
      Beam sets `flags: {allOut: true}`; the alternative, a `State.Move.allOut?: boolean` on the same
      shelf as `crit`/`magnitude`/`consecutive`, would have meant every move declaring a field only
      one move uses, and every future branched move patching `State.Move` again. The bag holds
      `1 | 0 | boolean | undefined` because `@pkmn/data`'s `MoveFlags` stores `1 | 0`; widening the
      value type and pointing `Context.Move.flags` at `State.Move['flags']` reconciled both without
      a cast at any boundary.

      Two consequences worth knowing. `flags` now **mixes static cartridge properties with transient
      per-resolution ones**, so anything iterating flags sees `allOut` next to `contact`. And
      `MoveDataBranch.flags` has to be a separate field from `.move`, merged rather than spread — a
      `.move` overlay carrying `flags` replaces the whole bag and silently drops `contact`, and
      mutating the bag in place leaks the flag into every other branch. `withBranch` copies it.

      A literal `Pokemon.volatiles` entry was considered and rejected: `setConditions` validates
      volatiles against `Conditions.get(gen, id)` so a made-up `allout` cannot be constructed at all,
      and `resolveTurns` carries states between turns, so an attacker volatile that is not explicitly
      stripped would double every subsequent Fickle Beam.

      **The branch's data has to be stripped from the resulting states, and the reason differs by
      where it lives.** For Present, `basePower` is in `moveKey`, so an unstripped branch keeps two
      outcomes apart that both leave the target on the same HP. For Fickle Beam the failure is
      quieter and worse: `flags` is not keyed at all, so an unstripped `allOut` still merges — it
      just contaminates whichever state won the merge, and `resolveTurns` then carries a move with
      `allOut` permanently set into every later turn. `resolveMove` restores the original move before
      accumulating, and `movedata.test` pins that every outcome's move is the original.

      With that in place the merge does its job: against a target both branches kill, the answer is
      **one outcome at probability 1**, still labelled 70/30. That is the sensitivity thesis paying
      off on the move that most invites the question "does the 30% matter here?".

      `Outcome.crits` generalised to `Outcome.labels`, an axis → value → weight map, so crits and
      move-data branches share one mechanism instead of the second label repeating the argument.
      Each axis is asserted to sum to its outcome's own count. **Decide before REFACTOR phase 2
      whether a branch label is a bucket dimension or part of `variantId`** — the bucket tuple there
      is `(hp, hits, crits, variantId)` and this adds a fourth thing wanting a place.

- [ ] **Present still cannot be resolved — but for an honest reason now.** Its heal branch sets
      `heal: [1,4]` on a `basePower: 0` move, which heals the *target* a quarter of its max HP and
      fails outright if the target is already full. That is target healing, a mechanic the engine
      does not model at all, so `resolveMove` refuses on `'target healing'` rather than on a bespoke
      `UNENUMERATED_MOVES` set (now deleted). Three of the four branches are declared and correct;
      the fourth needs the mechanic. Shell Side Arm stays refused as unenumerated.

- [ ] **Refuse-rather-than-guess covers moves only. Abilities and items silently no-op.**
      Swept 2026-09-08 and this is the structural finding of the sweep, not a coverage list.
      `unsupportedReasons` guards move properties thoroughly, but the only ability checks are
      `UNMODELLED_STATUS_ABILITIES` / `UNMODELLED_BOOST_ABILITIES`, both narrow and both about
      secondaries. **An ability or item that is absent from `mechanics/abilities.ts` /
      `mechanics/items.ts` produces no error, no flag and a plausible wrong number** — the same root
      cause as Fickle Beam, one level up.

      Gen 9 coverage, **corrected 2026-09-08 — an earlier count of "243 of 310 abilities" was
      wrong** because it counted a table entry as covered when most entries are present but
      completely commented out. Counting only entries that actually define a function, and only
      effects the sim gives damage-relevant hooks:

      | | implemented in the table | handled elsewhere in `src` | **unimplemented and silent** |
      | --- | --- | --- | --- |
      | abilities | 39 | 14 | **68** |
      | items | 73 | — | 16 |

      The 14 are real: Serene Grace, Mold Breaker, Sturdy, Water Bubble, Magic Guard, Rock Head,
      Infiltrator and friends are handled directly in `resolve.ts` rather than the handler table, so
      a table-only count understates coverage too. Items are in decent shape at 73 of 89; **abilities
      are at 53 of 121.**

      The silent 68 are not obscure. They include **Thick Fat, Analytic, Neuroforce, Stakeout,
      Rivalry, Fur Coat, Marvel Scale, Solar Power, Steelworker, Steely Spirit, Gorilla Tactics**,
      the whole type-changing family (**Aerilate, Pixilate, Refrigerate, Galvanize, Normalize**), and
      — worst — thirteen absorb/immunity abilities (**Flash Fire, Water Absorb, Volt Absorb, Sap
      Sipper, Storm Drain, Lightning Rod, Motor Drive, Earth Eater, Well-Baked Body, Wind Rider,
      Bulletproof, Soundproof, Wonder Guard**) that each make the calculator report full damage where
      the true answer is zero.

      Spot-checked against the oracle:

      | | dmg | sim | |
      | --- | --- | --- | --- |
      | Sharpness (Psycho Cut) | 220-261 | 331-390 | 1.5× missing |
      | Dragon's Maw (Dragon Pulse) | 75-88 | 111-132 | 1.5× |
      | Rocky Payload (Power Gem) | 45-54 | 67-79 | 1.5× |
      | Transistor (Thunderbolt) | 79-94 | 102-121 | 1.3× |
      | Sword of Ruin (Body Slam) | 174-205 | 232-273 | Def reduction |
      | Purifying Salt (Shadow Ball) | 76-90 | 39-46 | ~2× too high |
      | **Well-Baked Body** (Flamethrower) | 92-109 | **0** | immunity ignored |
      | **Earth Eater** (Earthquake) | 102-120 | **0** | immunity ignored |
      | **Wind Rider** (Bleakwind Storm) | 222-262 | **0** | immunity ignored |
      | Punching Glove (Mach Punch) | 234-276 | 254-302 | 1.1× |
      | Fairy Feather (Moonblast) | 88-105 | 106-126 | 1.2× |
      | Adamant Crystal / Lustrous Globe | 117-138 | 139-165 | 1.2× |

      The immunity three are the worst class: substantial damage reported where the true answer is
      zero, on abilities whose entire purpose is making that matchup safe. They are three of
      thirteen.

      **Both structural holes are now closed (2026-09-08), and 21 abilities went in with them.**
      The immunity hook plus the thirteen absorbs (Flash Fire, Water Absorb, Volt Absorb, Sap Sipper,
      Storm Drain, Lightning Rod, Motor Drive, Earth Eater, Well-Baked Body, Wind Rider, Bulletproof,
      Soundproof, Wonder Guard); the ability stat-modifier stage plus `onSource*` hooks, which fixed
      Heatproof, Thick Fat, Water Bubble and Purifying Salt; and the four attacker-side multipliers
      the sweep had measured wrong — Dragon's Maw, Rocky Payload, Transistor, Sharpness. All verified
      against the oracle, Mold Breaker suppression included, with controls for the types each ability
      should *not* touch. Full suite unchanged at the 2-failure baseline.

      **A third comparator trap for the list: the sim caps reported damage at the target's remaining
      HP.** Sharpness on a non-slicing Close Combat read as dmg=890 sim=714 — 714 being Blissey's max
      HP, not a 1.5× error.

      What follows is the state of things *before* that work, kept because it is the reasoning:

      **`calculateDamage` had no hook for a defender-ability immunity at all.** `mechanics/index.ts`
      consults `onTryImmunity` on `context.move` and `context.field.weather` only — never on the
      target's ability or item. So the absorb cluster cannot be fixed by adding table entries; the
      damage path needs to consult the target's ability and item too (Air Balloon wants the same
      hook). Small and well-scoped, but it is an architecture change, not a data one, which is why
      it belongs before the refactor rather than after.

      Related architecture gap: **there are no `onSourceModify*` hooks.** `HANDLER_FN_KEYS` has
      `onModifyAtk`/`SpA`/`Def`/`SpD` but no source-side variants, so a defender weakening the
      attacker's stat (Thick Fat, Water Bubble, Purifying Salt) cannot be expressed directly.
      `heatproof` works around it by halving base power in `onBasePower` instead of halving Atk —
      the same answer only when the rounding happens to agree.

      **Decided 2026-09-08: warn, do not refuse — and extend the same mechanism to moves.** Refusing
      would take a working Sharpness Gallade calculation away entirely; a warning lets the answer
      through while saying it is incomplete. The set needs no hand-maintained list: it is derivable
      by asking whether the sim has damage-relevant hooks for an effect that our table lacks, which
      is the same principle `REFACTOR.md` already argues for with `TARGET_HP_SENSITIVE_*` — derive
      from the handlers, not from a central list. `Relevancy` is the natural carrier.

      **This is shape-relevant, which is why it blocks the refactor rather than following it.** The
      warning changes what `resolveMove` reports, and the phase 0 corpus is the baseline phases 1-3
      must prove identical against. Characterizing a baseline that silently contains a dozen wrong
      answers pins them as "correct" for three phases.

- [ ] **Move-level sweep, 2026-09-08: 354 of ~440 damaging gen 9 moves match the sim exactly.**
      Method: for every non-status, non-Z, non-Max gen 9 move, Miraidon (252 Atk/SpA) into Dondozo
      (252 HP/Def/SpD, pure Water so no type immunities), `resolveMove`'s maximum damage against
      `simulateBranch(state, 100, true)`. Results: **354 match, 66 refused, 21 mismatched, 29 where
      the sim did nothing, 1 errored** (Belch, "Not all choices done").

      **Genuinely wrong damage — nine moves, none of which refuse:**

      | move | dmg | sim | cause |
      | --- | --- | --- | --- |
      | Electro Ball | 8 | 494 | speed-ratio base power not implemented |
      | Revelation Dance | 184 | 504 | move type should follow the user's primary type |
      | Freeze-Dry | 72 | 288 | Ice hitting Water super-effectively not implemented |
      | Ruination | 100 | 252 | halves the target's current HP |
      | Endeavor | 3 | 163 | sets target HP to the attacker's |
      | Hard Press | 1 | 52 | base power scales with the target's remaining HP |
      | Gyro Ball | 1 | 6 | speed-based base power |
      | Foul Play | 100 | 88 | uses the target's Atk; ours over-computes |
      | Beat Up | 3 | 15 | one hit per healthy party member |

      **Not bugs — comparator artifacts, recorded so the sweep is not re-run naively.** Eleven
      multi-hit moves (Arm Thrust, Bone Rush, Bullet Seed, Fury Attack, Fury Swipes, Icicle Spear,
      Pin Missile, Rock Blast, Scale Shot, Tail Slap, Water Shuriken) mismatch because our maximum is
      every hit landing and critting while the sim rolls its own hit count from the seed; forcing the
      count is required to compare them. Fickle Beam mismatches because the oracle's `dataBranch`
      defaults to the non-doubled branch. An earlier pass also flagged Vessel of Ruin, Beads of Ruin,
      Good as Gold and Griseous Core, all of which are correct — those were Ghost-vs-Normal immunity
      cases where `calculateDamage` returns scalar `0` against the sim's sixteen zeros.

      **The 29 "sim did nothing" moves are a semantic difference, not a defect list.** Charge moves
      (Solar Beam, Solar Blade, Fly, Dig, Dive, Bounce, Phantom Force, Shadow Force, Sky Attack,
      Meteor Beam, Electro Shot, Freeze Shock, Ice Burn), delayed moves (Future Sight, Doom Desire),
      counter moves (Counter, Mirror Coat, Metal Burst, Comeuppance) and condition moves (Sucker
      Punch, Thunderclap, Upper Hand, Snore, Last Resort, Fling, Spit Up, Steel Roller, Poltergeist,
      Aura Wheel) all do nothing on the sim's turn 1. A calculator answering "what does Solar Beam do
      when it lands" is right to return a number. But the *precondition* is unmodelled and
      unreported, which is the same warning the ability/item guard should carry.

- [ ] **The rest of the random-branch census, swept 2026-09-08.** Every move in gens 1-9 whose
      handler code calls `randomChance` / `random` / `sample`, at any nesting depth, is 28 moves. Most
      are status moves. Sorted by which machinery they actually need:

      **The `branches` axis as built — four citizens, two live.**

      | move | shape | state |
      | --- | --- | --- |
      | Fickle Beam | 30% ×2 BP | done |
      | Present | 20% heal / 40% 40 BP / 30% 80 BP / 10% 120 BP | declared, blocked on target healing |
      | Magnitude | `random(100)` → 7 BP branches, weights 5/10/20/30/20/10/5 | refused, see below |
      | Shell Side Arm | 50/50 category, **only on an exact damage tie** | refused as unenumerated |

      **Magnitude and Shell Side Arm both need conditional branches, which `branches` cannot express.**
      It is a static array today. Magnitude should branch only when the caller has *not* pinned a
      magnitude — `State.Move.magnitude`, `MoveOptions.magnitude` and the `MOVE_SUGAR` `"Magnitude 7"`
      form all exist, and `createMove` currently *requires* one ("The move Magnitude must have a
      magnitude specified"), so it is refused rather than wrong. Shell Side Arm is deterministic
      except on an exact tie between physical and special damage, so its branch list depends on the
      participants. Both want `branches` to become a function of the move and attacker, the way
      `hitCountBranches` already is. Magnitude is also the first place the "unknown input is a
      distribution" idea from Phase 1 would pay off concretely.

      **Catalogued rather than implemented, decided 2026-09-08** — together with the three moves
      below. Shell Side Arm is further out than the others and may never be worth it: its
      random half fires only on an exact damage tie, and the deterministic 99% of the move (compare
      the attacker's Atk/SpA against the target's Def/SpD) is not implemented at all, so it is mostly
      an ordinary mechanics job wearing a branching hat.

- [ ] **Three moves the census found are silently wrong right now — the Fickle Beam failure class,
      but in two other layers.** None of them is a move-data branch, so `branches` does not fix any
      of them and `RANDOM_DATA_MOVES` does not guard them.

      - **Psywave** — `damageCallback(pokemon) { return (this.random(50, 151) * pokemon.level) / 100; }`,
        so 101 equally likely damage values at level 100. dmg has no `damageCallback` for it and the
        dex lists `basePower: 1`, so it computes **1-4 damage** against a Blissey where the truth is
        50-150. This is random *damage*, not random data: it belongs beside `damageRolls`, as a move
        whose damage is its own distribution independent of the 16 rolls.
      - **Tri Attack** and **Dire Claw** — the status is chosen by `this.sample(['brn','par','frz'])`
        / `sample(['psn','par','slp'])` inside the secondary's `onHit`. The dex secondary is literally
        `{chance: 20}` with **no `status` field**, so `secondaryBranches` produces a correct 20/80
        trigger split and then applies an empty effect: the triggered branch is identical to the
        untriggered one and merges back. Damage is right, **every status is silently dropped**, and
        nothing complains. This is a random *secondary selection* and belongs as a sub-axis inside
        `secondaryBranches`, not in `branches`.

      **Not implemented yet, and not refused either — decided 2026-09-08.** All three, plus
      Magnitude, stay as they are for now: Psywave and the two status samplers keep returning what
      they return. They are catalogued rather than fixed because the **refactor is what waits on
      this census, not the other way round** — the point of writing them down is that the base
      implementation is designed flexibly enough to absorb them, and `REFACTOR.md` carries the two
      assumptions that must survive them: a damage kernel is not always 16 rolls (Psywave is 101),
      and `branches` will become a function rather than a static array (Magnitude, Shell Side Arm).

      They will be reported by the unmodelled-effects warning above rather than silently returning a
      wrong number, which is the minimum that has to be true before phase 0 freezes a baseline.

      Not damage-relevant, listed so the census is not re-run: Acupressure, Ally Switch, Assist,
      Attract, Conversion, Conversion 2, Disable, Encore, Metronome, Mimic, Sleep Talk, Spite,
      Substitute, Taunt (status moves); Bide and Uproar (random *duration*); Pursuit (a speed-tie
      coin flip on switch-out); the four G-Max moves (Dynamax is out of scope).

- [ ] **The branch is chosen once per move, and the sim chooses it once per hit.** `onBasePower` runs
      inside `getDamage`, so a multi-hit move with random data rolls it per hit. Every current
      citizen is single-hit, so whole-move placement is exact for all of them and keeps the hit loop
      untouched — which matters with REFACTOR next. The gap is guarded, not ignored: a branched move
      with more than one hit is refused, **including Fickle Beam under Parental Bond**. Move the axis
      into `advance` when a multi-hit citizen actually appears, and note it multiplies `expansion` per
      hit when it does.

- [ ] **`Result.toString()` is broken for every state — a Slice B regression hiding behind a red
      test.** Found while establishing the baseline for the work above. `Result.text()` does
      `extend({}, relevant ?? this.relevant)` (`result.ts:315`, and again at `:107`), which flattens
      the `Relevancy` into a plain object literal. That was safe when `Relevancy` was pure data; Slice
      B gave it `side()` and `pokemon()` **methods**, which live on the prototype and do not survive
      the flatten, so `Relevancy.simplify` then throws `TypeError: relevant.side is not a function`.

      The failure is recorded in `CLAUDE.md` as *"Flower Gift / Power Spot / Battery encoding has a
      spacing bug"* — it is not that any more, and because `mechanics/index.test.ts` was the only test
      touching `toString()` and was already red, nothing flagged it. Verified independently: a plain
      Lucario → Blissey Aura Sphere `calculate(...).toString()` throws.

      Not fixed here — it is a different subsystem (`Result`, the legacy convolution path) and the fix
      is a real choice, not a typo: either stop flattening `Relevancy` through `extend`, or take the
      methods back off it and make `side`/`pokemon` free functions over plain data. The second reads
      better against `simplify`/`combine`, which are already free functions.

- [ ] **`extend` returns dictionary-mode objects, and anything hot that copies them pays ~90×.**
      Found while profiling the above. `extend` grows its target through a megamorphic keyed store, so
      V8 normalises the result to dictionary mode; `State.createMove`'s output was one, and every
      `{...state.move}` on the branch path cost **5.06µs instead of 0.05µs** for the same 45 keys.
      `createMove` now returns `fastProperties(move)` (`utils.ts`) — a one-time re-copy at construction.
      `createPokemon` builds its object literally and was never affected.

      `Context.Move` is still built by `extend(this, state)` and is still dictionary-mode. It measured
      3.2µs to construct against 1.4µs for the same copy onto a clean object, so there is a little more
      here — but it is small next to `stateKey`, and it is the object `calculateDamage` reads ~30 fields
      off, so the change wants its own before/after rather than being smuggled in.

Deferred until there is a concrete need: full benches carrying real Pokémon data, switching, and
anything touching hidden information.

## The end-user API — progressive disclosure (direction set 2026-09-05)

The target ergonomics span the same range as the model: the simplest useful input is roughly

```
new Pokemon('Lucario', {move: 'Aura Sphere', ability: 'Inner Focus', evs: {atk: 252}})
new Pokemon('Blissey')
```

with level, stats, side and field all implied — through to a fully explicit form that builds every
side, every active Pokémon and the field by hand. (Sketch, not a literal signature.)

**Most of this already exists.** `State.createPokemon` is ~200 lines of exactly this defaulting —
level 100, ability from `species.abilities[0]`, EVs 0 (252 pre-gen-3), IVs 31, `maxhp` from the
spread, `teraType` from the primary type, HP full — with `createSide`/`createField`/`createMove`
alongside. The blocker on the *explicit* end is not ergonomics, it is that `p1`/`p2` cannot hold a
constructed `Side` and there is no home for a second action. The asymmetry fix above unblocks both.

### Principles

- **One canonical `State`; every entry point is a builder that produces it.** No "simple mode" vs
  "full mode" branch anywhere below the constructors — the one-liner desugars to a complete state
  with one active per side and defaults everywhere. Less typing, not a different code path.
- **The builder layer is the validation boundary.** `createPokemon` already validates HP range, EV/IV
  bounds, DV↔IV consistency, Hidden Power legality, gender against the species ratio, and
  `validateStats` recomputes every stat to catch a caller-supplied stat block that disagrees with the
  spread. Keep all of it at construction so the hot path (`advance`, `damageRolls`) can trust the
  state and stay fast.
- **Shorthand entry points stay narrow and total.** A `calc(attacker, defender, move)` form that means
  exactly one thing, rather than a variadic that guesses at intent from argument count.

### Decisions to make deliberately

- [ ] **`move` on a Pokémon desugars to moveset + action.** `{move: 'Aura Sphere'}` reads correctly for
      a user, but a move is an action taken on a turn, not an attribute. Model a Pokémon as carrying a
      **moveset** (genuinely its property) with an **action** that references one; the one-liner means
      "moveset is `[Aura Sphere]`, default action uses it." Strictly better than today's ownerless
      top-level `state.move`, and it is what a `Policy` selects from in a full battle.
- [ ] **Builder outputs are immutable values.** Build twelve Pokémon once, reuse across all ~576 calcs
      of a matchup grid. This also settles a live inconsistency: `State.Pokemon` is documented mutable
      and `Applier` mutates it, while `resolve.ts` spreads everywhere and treats states as immutable.
      Resolve it in the direction the engine already leans.
- [ ] **Naming — the root container is not `Field`.** `State.Field` already means weather / terrain /
      pseudo-weather. The outer container is the battle state, with field as one member.
- [ ] **Keep the door open for defaults-as-distributions.** Every default is a guess about an unknown,
      and this project's whole thesis is that unknowns are distributions, not point estimates — PLAN
      already says so for speed (*"unknown investment is a distribution"*). The end state is a builder
      that can return `Distribution<State>` ("usage-weighted Blissey spreads") which callers `flatMap
      resolveMove` over. **This is where ensemble-shaped input actually belongs — at the construction
      boundary, not in the mechanic function signatures** (see the `Distribution.flatMap` item above:
      per-state functions are what keep oracle testing a clean one-to-one comparison). Do not build it
      now; just avoid hardwiring "a builder returns exactly one `State`" into every signature.

### Entry-point defaulting — checked 2026-09-05, no drift risk

`parse.ts` is a **pure string→options translator**. `build()` reconciles phrase-vs-flag input and then
hands plain option bags to `State.createField`, `State.createPokemon`, `State.createSide` and
`State.createMove`; every domain default (level 100, ability from the species, EV/IV defaults,
`maxhp`, HP full) comes from the factories, and validation is deliberately deferred to them —
`parse.ts:784`: *"If the nature is invalid State.createPokemon will throw an error anyway."*

**This is the precedent the constructor API must follow**: thin sugar over the same `State.create*`
factories, never a second defaulting implementation. The one layer `parse.ts` genuinely owns —
`checks.conflict` / `checks.number` — is text-specific, reconciling redundant input
(`252+ Atk Lucario` alongside `--atkevs=252`); a constructor API cannot express that ambiguity.

Found while checking:

- [x] **The text path could not express gen 9** ✅ **FIXED 2026-09-05** — `BOUNDS.gen` is now
      `[1, 9]`, so `[Gen 9]` / `--gen=9` no longer raise a `ParseError` from `bounded('gen', n)`.
      `parseGen`'s no-gen fallback is still `gens.get(g || 8)`; harmless when a `Generation` object is
      passed (the common path) but worth revisiting when the gen default is next touched.
- [ ] **`parse()` bypasses the `State` constructor.** `build()` returns a plain object literal
      (`parse.ts:685`) rather than `new State(...)`, so the constructor's `'pokemon' in attacker`
      normalisation and `gameType` default are duplicated in `build()` instead of reused. Harmless
      today; reconcile when `State` takes its new shape.
- [ ] **Pokémon ↔ Move is genuinely bidirectional, and `parse.ts` already solves it.** The move needs
      the Pokémon (Skill Link / Grip Claw hit-count defaults) and the Pokémon needs the move (Hidden
      Power IVs). `build()` resolves it by ordering: move *name* → `p1.pokemon` → move object
      (`parse.ts:681-683`). `new Pokemon('Lucario', {move: 'Aura Sphere'})` hits the identical knot —
      the moveset/action split above must preserve that ordering discipline.

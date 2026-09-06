# DraftZone Calculator (`dmg`)

A fork of [`@pkmn/dmg`](https://github.com/pkmn/dmg) — pkmn's own abandoned from-scratch
rewrite of `@smogon/calc` — being turned into DraftZone's standalone damage calculator.

Sibling repos: `pokemon-draftzone-client`, `pokemon-draftzone-server`, `pdz-sets`.

**Read [`docs/PLAN.md`](docs/PLAN.md) before starting work.** It holds the goal, the phased
roadmap, and the open decisions. This file holds only the conventions and traps.

## Current status

**Phases 0-3 complete, Phase 4 largely complete (2026-09-04).** `npx tsc -p . --noEmit` is
clean, and 22 of 24 Jest suites pass — 266 passed, 1 todo, 2 failed (2026-09-05).

`resolveTurns()` (`src/turns.ts`) is the tier-3 layer: repeated `resolveMove` with merging, an
injected `Policy`, epsilon/outcome pruning, and per-turn KO chances. It works in **float**
probabilities on purpose — pruning abandons exactness anyway — and always reports `prunedMass`
so `Σ outcomes + prunedMass === 1` holds. End-of-turn residuals and hazards are **not** modelled
yet, so its KO chances understate attrition.

**It was called `search` until 2026-09-05 and the rename was the point.** It does not search:
there is no exploration, no objective, no game tree, and it never chooses anything — the
`Policy` is injected and it does as told (`repeatMove`, the only implementation, returns the
same move forever). It pushes a probability distribution forward N steps, which is a Markov
chain evolution. The old name described what tier 3 might grow into once `Policy` becomes a
solver. Only one side acts, a "turn" means "one more use of this move", and `startOfTurn`
clearing `hurtThisTurn` is the entire between-turn model.

`resolveMove` (`src/resolve.ts`) turns one move into a merged `Distribution<State>` and is
verified against `@pkmn/sim` branch-by-branch. It **rejects anything outside its supported move
class** with `UnsupportedMoveError` rather than guessing — Phase 3 removes one restriction per
rung. See `docs/PLAN.md`.

The 2 remaining failures are the baseline, not a regression you introduced:

- `parse.test.ts` — `powerspot` is dropped from `sides[1].allies` when parsing allies. A genuine
  mechanics gap.
- `mechanics/index.test.ts` — **no longer the spacing bug it is named after.** It now fails with
  `TypeError: relevant.side is not a function`, and that is a live regression from the Slice B
  reshape, not a mechanics gap: `Result.text()` does `extend({}, relevant)` (`result.ts:315`, and
  again at `:107`), which flattens the `Relevancy` into a plain object and drops the `side()` /
  `pokemon()` **methods** the reshape added. `Relevancy` used to be pure data, so flattening it was
  safe; it is not any more. **`Result.toString()` therefore throws for every state**, not just this
  test's — the whole human-facing output path of `calculate()` is down, and an already-red test is
  hiding it. See `docs/PLAN.md`.

Nothing consumes the damage path yet. The only live consumer of anything in this repo is the
server's `speedchart.ts`, which uses `computeStats` and `State` only.

## Commands

| Task | Command |
| --- | --- |
| Typecheck | `npx tsc -p . --noEmit` |
| Compile | `npm run compile` |
| Build (compile + UMD bundle) | `npm run build` |
| Lint | `npm run lint` |
| Lint + autofix | `npm run fix` |

### Testing

Consistent with the other DraftZone repos: **never run bare `jest` or `npm test`.**

```
npx jest --runInBand                    # whole suite (12 files, small)
npx jest --runInBand src/test/state     # targeted, preferred
```

Note `npm test` here has a `pretest` hook that runs a full `build` and a `posttest` that runs
`lint`, so it fails on the compile errors before any test executes.

## The goal, in one paragraph

Not to reimplement `@smogon/calc`, but to be measurably more precise than it: compute a
**probability distribution over resulting battle states** instead of a damage range plus an
approximated KO chance. Branches that lead to the same resulting state **merge**, and their
probabilities add — so if a move always kills and a crit also always kills, both collapse to
one node at probability 1.0 and the crit is provably irrelevant. Merging is both the
correctness mechanism and the explosion control.

## Layout

```
src/
  state.ts        outside layer — plain, serializable, what a UI/API binds to
  context.ts      inside layer — State reified with handler fns bound on
  relevancy.ts    provenance — handlers flip flags as they fire
  handlers.ts     the Handler/Applier interfaces + HANDLERS registry
  result.ts       Result / HitResult
  mechanics/      abilities.ts, items.ts, moves.ts, conditions.ts, index.ts
  conditions.ts   weather/terrain/side/volatile name tables and aliases
  parse.ts        text → State
  encode.ts       State → text
  math.ts         cartridge integer math (trunc, chainMod, roundDown)
  gens.ts         inGen / inGens scoping helpers
  distribution.ts Distribution<T> / NumberDistribution — counts, merging, exactness
  key.ts          stateKey — the canonical merge key that makes branches collapse
  resolve.ts      tier 2 — resolveMove, one move to a Distribution<State>
  turns.ts        tier 3 — resolveTurns, resolveMove iterated over N turns
  test/helpers/   differential test infra against @pkmn/sim — currently dead
docs/             PLAN.md, CONTRIBUTING.md, PARSING.md, TESTING.md
wip/              dead prototype code, predates everything. Ignore it.
```

## Architecture

Three tiers. The middle one does not exist yet and is the keystone.

| Tier | File | Signature | Status |
| --- | --- | --- | --- |
| 1 — damage | `mechanics/index.ts` | `calculateDamage(Context) → number[]` | exists |
| 2 — one move | `resolve.ts` | `resolveMove(State) → Distribution<State>` | exists |
| 3 — turns | `turns.ts` | `resolveTurns(State, TurnsOptions) → TurnsResult` | exists, one-sided |

`Relevancy` is what `@smogon/calc` structurally cannot do — it hardcodes a `desc` builder.
Keep it.

## Where this ships

This repo **is** the `@pdz/calc` package (`package.json` name; the folder is still `dmg/`).
Dual `build/cjs` + `build/esm` with an `exports` map, mirroring `@pdz/sets`.

**The server is the only consumer.** The client has zero `@pkmn/*` dependencies and keeps it
that way — calculator results reach the browser over HTTP. Do not add `@pkmn/dex` to the client
bundle without revisiting that decision in `docs/PLAN.md`.

`pokemon-draftzone-server` depends on it as a **pinned GitHub commit**, not `file:../dmg`:
`"@pdz/calc": "git+https://github.com/LumarisX/dmg.git#<sha>"`. `speedchart.ts` and the `/calc`
endpoint import from `@pdz/calc`. **`pokemon-draftzone-server/dmg/` no longer exists** — do not
recreate it.

**This means editing this repo changes nothing the server runs.** Getting a change over there is
commit → push → repin the sha in the server's `package.json` → `npm install` → restart. A stale
pin is invisible until it throws: on 2026-09-05 the server was still on `656b5c5`, four commits
back, and reported a `Population Bomb` crash that had already been fixed here. **When a server
stack trace disagrees with this repo's source, check the pinned sha before debugging anything.**

`npm run build` runs both tsc passes; `prepare` runs it on install, so a type error in `src`
breaks `npm install` in both repos. There is **no UMD/browser bundle** — microbundle was
removed deliberately.

## Hard rules

- **No explanatory code comments.** Repo-wide across all DraftZone projects, `/** */`
  included. Write code that reads without them. Plenty of older files carry commented-out
  Pokémon Showdown source — leave those alone unless you are rewriting the block.
- **Tier 1 stays tree-unaware.** The moment tree/search logic leaks into `calculateDamage`,
  the damage formula can no longer be differentially tested against `@pkmn/sim` in isolation
  — and that test is the project's definition of correctness.
- **`@smogon/calc` and `@pkmn/sim` are dev dependencies only.** Never runtime imports. Sim is
  the *oracle* — correctness is defined as differential-testing clean against it — so the
  dependency must never invert or the check becomes circular.
- **Enumerate sim's branches; never sample them.** Do not seed-search or run batches of
  random battles to observe a distribution. `battle.randomizer` and `battle.randomChance` are
  overridable methods, and `BattleOptions` accepts a `prng` — force each branch and compare
  exactly. 16 runs, not 10,000. Sampling approximates what this project defines exactly, and
  no sim ever runs at calc time.
- **Nothing is hardcoded that a mod should be able to change.** Gen 9 is the first target,
  not an architectural assumption — the end state is that any `@pkmn`-compatible dataset or
  mod works (DraftZone already ships `radicalred` and `insurgance` server-side). So: read
  data from `gen.*`, implement mechanics in the handler tables, and **add no new inline
  `gen.num` branch** — there are already 66 in non-test source, and each is a place a mod
  cannot reach. Gen- and mod-varying constants belong in the injected `Rules` profile. See
  "Extensibility contract" in `docs/PLAN.md`, which lists the known violations still sitting
  in the damage core.
- **Do not use `Relevancy` to derive the node merge key.** It records what was read *on this
  path*; a field unread here may be read on a future branch. Unsound. It answers the
  separate *sensitivity* question.
- **Do not edit `pokemon-draftzone-server/dmg/`** to fix things here. That copy is
  self-contained and `speedchart.ts` works against it. The breakage is one-directional —
  only `dmg/src` reaching into the server is broken.

## Gotchas

These will each cost you an afternoon if you trust appearances.

- **Never invoke a handler function you did not install.** `Context.Move`'s constructor does
  `extend(this, state)`, which copies the *entire* move data object. When the `Dex` is
  `@pkmn/sim`'s (or a mod carrying `scripts.ts`/`moves.ts` handlers), that drags in Pokémon
  Showdown's own `onBasePower`/`basePowerCallback`, which expect PS's
  `(basePower, pokemon, target, move)` signature bound to a `Battle` — calling them with
  dmg's `(context)` blows up on `runEffectiveness`/`beingCalledBack`. The constructor now
  strips every key in `HANDLER_FNS` (`handlers.ts`) before `reify` installs dmg's own.
  **Any new `Context` entity built with `extend` must do the same.** `HANDLER_FN_KEYS` is a
  mapped type over `keyof Handler<unknown>`, so adding a hook to the `Handler` interface
  without listing it is a compile error.

- **Run ability and item hooks explicitly — nothing dispatches them for you.**
  `Context.Move.updateData` has to call the attacker's ability/item `onModifyMove` by hand; it
  didn't, so Sheer Force silently never applied. If you add a handler hook, grep for whether
  anything actually invokes it before assuming it works.

- **Compare ids to ids.** `pokemon.item?.id` is `utilityumbrella`, not `'Utility Umbrella'`.
  A whole item was dead because of that mismatch, and TypeScript cannot catch it since both
  sides are strings.

- **The oracle measures the move, not the turn.** `simulateBranch` reads the move's own
  `-damage` lines from `battle.log` and skips anything tagged `[from]`. Reading HP before and
  after `makeChoices` instead would fold end-of-turn residuals (burn, sand, Leftovers) into the
  reported damage — which it used to, invisibly, until a status secondary was tested.

- **Multi-hit is iteration, not convolution.** `resolveMove` runs the single-hit resolver over
  a distribution once per hit, so per-hit re-derivation, early termination and between-hit
  state need no special cases. `NumberDistribution.chain` (pure convolution) **cannot** express
  a move that stops early — never reach for it to model multi-hit.

- **Stat boosts were ignored by the damage formula until 2026-09-04.** `Context.Pokemon` stores
  `boosts` but computes `stats` without them; `calculateDamage` now applies
  `computeBoostedStat` when reading the offensive/defensive stat. Crits zero *negative*
  attacker boosts and *positive* defender boosts, per sim. If you add another stat read to the
  damage path, boost it the same way.

- **Building a sim `Battle` takes three steps, not one.** `setTeam` for *both* players, then
  `startBattle`, then `applySide`. PS leaves `side.active[0]` as `null` until both players are
  set **and** the team-preview request is answered — `gen9customgame` has team preview. Touching
  actives earlier throws. `src/test/helpers/verifier.ts` had both bugs and had clearly never run.

- **`battle.randomChance` is shared across accuracy, crit and secondaries.** A blanket override
  answers all of them — that is how a 90%-accuracy move ends up always missing and the oracle
  reports zero damage. `oracle.ts` dispatches on the denominator (`(n, 100)` is a percentage
  roll and is forced to hit; anything else is the crit roll) and records every call. That is
  the fragile form; full record/replay is the robust one and is wanted before Phase 3 rung 4.

- **`teraType` is a declaration; `terastallized` is the state.** `createPokemon` still defaults
  `teraType` to the primary type, so a non-empty `teraType` never means "is terastallized" —
  check the `terastallized` flag. When it is set, `Context.Pokemon.types` becomes `[teraType]`
  (terastallizing changes *defensive* typing too) while `baseTypes` keeps the originals; STAB
  needs both, and `toState` must round-trip `baseTypes`, never `types`.

- **Apply modifiers with `applyMod`, never by hand.** `applyMod` reproduces the cartridge's
  round-half-down, which is exactly what sim's `modify()` does. STAB was doing a raw
  `trunc(d * mod, 32) / 0x1000` and deferring to a later `floor`, which truncated instead of
  rounding — off by one on 4 of 16 rolls at 2.25× STAB, and invisible at 1.5× whenever the
  intermediate value happened to be even.

- **`extend` returns dictionary-mode objects.** It grows its target through a megamorphic keyed
  store, which V8 answers by normalising the result to slow properties — after which every copy of
  that object costs roughly **90×** more (`{...state.move}` measured 5.06µs against 0.05µs for the
  same 45 keys). `State.createMove` now passes its result through `fastProperties` (`utils.ts`) for
  exactly this reason, and a `{...obj}` that looks like a no-op is load-bearing. If you build
  something with `extend` that then gets copied on a branch path, do the same.

- **`resolve.ts` reuses `Context` sub-objects, and the rule is reference identity.** `Reification`
  (`context.ts`) hands out one `Context` per distinct `State` and reuses `Context.Field` plus each
  side's `sideConditions` / `allies` / `team` when the source `State` fragment is the *same object* —
  which holds because `withPokemonAt` / `withMove` share what they don't touch. Two constraints ride
  on it: reuse is refused unless the `Relevancy` is the same object (a reified handler closes over
  the fragment it was built against, so crossing relevancies would record provenance into the wrong
  one), and `Context.Pokemon` is never reused because it holds `side` / `move` back-pointers. A
  `Reification` hands out one live `Context` at a time — do not keep a previous one and calculate
  off it.

- **Crit is applied after `updateData`, not before.** `damageRolls` sets `context.move.crit` on an
  already-built context; nothing in move-data resolution may read it. That matches the cartridge
  (crit is rolled after the move's data is resolved) and it is what lets one `Context` serve both
  crit branches. `sniper` reads `move.crit` at *damage* time, which is fine. A new
  `basePowerCallback` that reads `crit` would break it — `context.test.ts` pins the invariant.

- **`stateKey` is the hot spot on the resolve path, not `Context` construction.** It was 40,050
  calls / 239ms of a 301ms Rock Blast resolve before being rewritten to build by concatenation
  (5.45µs → 1.63µs) and to memoise `sideKey` on object identity. Keep it allocation-free; a
  `map`/`join`/`sort` reintroduced here costs more than any mechanic in the loop.

- **The key memo is on `sideKey` only, deliberately.** Memoising `pokemonKey` too made resolves
  *slower* — in a resolve the target Pokémon is a fresh object on every branch, so it paid a
  `WeakMap.set` that was never read, and a memo-hit `sideKey` returns before it would ever call
  `pokemonKey` anyway. Memoise the fragment that repeats, not the one that changes. **The contract:
  a `State.Side` must not be mutated once it has been keyed** — construction-time mutation is fine.
  `Appliers.apply` is the one thing that mutates a `State` in place; a new `apply` must return a new
  `State`, not mutate a keyed one.

- **Exactness ends at 6 hits, and that is handled, not an error.** Counts leave the safe-integer
  range at hit 7 for any move (the gcd of the branch counts is 1 at every pass, so normalising
  cannot help). Past that, probabilities stay correct to ~1e-16 relative — summing positive floats
  has no cancellation — so `assertMassConserved` checks mass exactly while it fits and by relative
  tolerance beyond, and **any hit count resolves**. `assertExact` keeps the strict contract and
  still throws `ExactHorizonError`; `Distribution.exact` says which régime a result is in. Note the
  oracle does not cover 7+ hit moves, so those are self-consistent but not sim-verified.

- **`resolveTurns`'s `maxOutcomes` cannot be given a default.** `capOutcomes` keeps the top N by
  probability, which is wrong for a smooth HP distribution: capping Rock Blast to 100 discards 52%
  of the probability mass and drops the 4-turn KO chance from 0.92 to 0.47. `prunedMass` reports it,
  but `knockoutByTurn` silently becomes a lower bound. It was tried as a default and reverted
  2026-09-05. Bounding tier 3 needs *merging* (binning nearby HP), not more pruning.

- **Watch constructor ordering in `Context`.** `Context.Side` copies `context.field` in its
  own constructor, so `field` must be built *before* `p1`/`p2`. It wasn't, which silently
  left `Side.field` undefined and made every weather-gated ability (`chlorophyll`,
  `swiftswim`, `sandrush`, `slushrush`) never fire. Fixed 2026-09-03 — but the shape of the
  bug recurs whenever an entity reads back off `context` during construction.

- **The cross-repo imports are gone (2026-09-03).** 24 source + 9 test files used to point at
  `../../pokemon-draftzone-server/dmg/*`; all now resolve locally. `pokemon-draftzone-server/dmg/`
  still exists and is still what `speedchart.ts` uses — leave it alone until the packaging
  decision in `docs/PLAN.md` Phase 1.

- **Handler file size wildly overstates coverage.** The mechanics files are mostly stubs with
  PS source commented out:

  | file | entries | real handlers |
  | --- | --- | --- |
  | `abilities.ts` (3144 ln) | 246 | **41** |
  | `items.ts` (2324 ln) | 220 | **89** |
  | `moves.ts` (5911 ln) | 358 | **43** |

- **`apply` is essentially unimplemented** — exactly one in the whole mechanics tree
  (`abilities.ts:1149`). Since tier 2 *is* the state transition function, `apply` coverage is
  the real long-tail work, not the tree scaffolding.

- **Multi-hit looks like it works and does not.** `State.createMove` (`state.ts:511-520`)
  pins `hits` to a single number at construction, so Rock Blast's 2–5 distribution never
  enters the math. `Result` then convolves N identical `HitResult`s built from the *same*
  `Context`, so escalating BP, per-hit accuracy and between-hit state changes are
  unrepresentable. `NumberDistribution.chain` is pure convolution and convolution assumes
  every hit happens — which is why Triple Axel (per-hit accuracy → early termination) is the
  move that proves the node model.

- **`Distribution<T>` is not actually generic.** It merges via `new Map<T, number>()`
  (`mechanics/index.ts:405`) — reference equality, so object states will never merge. And
  `o.data >= value` / `o.data === value` (`:487`, `:492`) are number-assuming logic sitting
  in the generic parent.

- **The move-*ranking heuristic* is gone from this repo (2026-09-03)** —
  `pdzCalculateStrength`, `pdzEffectivePowerModifier`, `pdzCalculateMove`, `CRIT_KEY`,
  `Context.Move.pdzUpdateData` and the `effectivePower` getter were all deleted. The live
  version lives in the server's `teambuilder/teambuilder.service.ts` and is self-contained.
  **Do not re-add ranking heuristics to the damage core** — approximations like "×3.3 for a
  2-5 multihit" are the opposite of what this project exists to do.

- **Gen 9 essentials are stubbed.** Tera and Protean/Libero are commented out inside
  `getStabModifier`. Parental Bond is entirely commented out (`abilities.ts:1726`); Skill
  Link *is* implemented (`:2380`). Weather and terrain are hardcoded inline in
  `calculateDamage`; `mechanics/conditions.ts` contains exactly two entries, `brn` and `par`.

- **`Result.knockout` ignores its own `KOType` parameter** — no hazards, no residual,
  `exact: true` hardcoded.

- **`@pkmn/*` is aligned on 0.10.11** across this repo and the server (2026-09-04). Keep it that
  way: two copies of `@pkmn/data` in one type graph is what produced the original `TS2345`
  storms, and the server now resolves this package's types through a symlink, so a version drift
  would bring them straight back.

- **`wip/` is dead.** It predates the current architecture and imports modules that do not
  exist. Never a reference.

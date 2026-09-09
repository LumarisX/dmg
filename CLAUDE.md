# DraftZone Calculator (`dmg`)

A fork of [`@pkmn/dmg`](https://github.com/pkmn/dmg) — pkmn's own abandoned from-scratch
rewrite of `@smogon/calc` — being turned into DraftZone's standalone damage calculator.

Sibling repos: `pokemon-draftzone-client`, `pokemon-draftzone-server`, `pdz-sets`.

**Read [`docs/PLAN.md`](docs/PLAN.md) before starting work.** It holds the goal, the phased
roadmap, and the open decisions. This file holds only the conventions and traps.

## Current status

**Phases 0-3 complete, Phase 4 largely complete (2026-09-04).** `npx tsc -p . --noEmit` is
clean, and 24 of 26 Jest suites pass — 292 passed, 1 todo, 2 failed (2026-09-08).

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

### The report harness

`npm run report` builds and runs every scenario in `src/report/scenarios.ts`, prints a one-line
summary per scenario, and writes a self-contained `report.html` — damage distribution, survival
function, turns-to-KO, cumulative KO, branch structure, crit counts and the heaviest outcomes, as
inline SVG with no dependencies and no server.

```
npm run report                      # everything, to ./report.html
npm run build:cjs && node build/cjs/report/cli.js multi-hit --out /tmp/r.html
```

Bare arguments filter on name, group or move (the second form avoids npm mangling quoted
multi-word arguments on Windows). **Adding a case is a few lines in `scenarios.ts`** — only
`name`, `group`, `move` and the two species are required; `weather`, `terrain`, `turns`,
`maxResolves`, and per-side `ability`/`item`/`nature`/`evs`/`boosts`/`status`/`hp`/`tera` are
optional. The console line reports whether each scenario took the `hp` projection or the full
`state` space, which is the fastest way to see the fast-path gate refusing something.

**Prefer this over the client/server calculator page for iterating on mechanics** — it needs no
running server, no linked package and no browser round trip.

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

**For local development, link instead of repinning:**

```
cd dmg && npm link
cd pokemon-draftzone-server && npm link @pdz/calc
```

That points `node_modules/@pdz/calc` at this working copy and leaves `package.json` and
`package-lock.json` untouched, so prod keeps installing the pinned sha — which matters, because the
deploy workflow runs `npm install` from both files. Re-run the second command after any `npm install`
in the server, and **`npm run build` here after every change** — the server loads `build/cjs`, not
`src`. Linking is also the fastest way to find API drift: it surfaced ten type errors in the server's
`/calc` endpoint that the stale pin had been hiding.

`npm run build` runs both tsc passes; `prepare` runs it on install, so a type error in `src`
breaks `npm install` in both repos. There is **no UMD/browser bundle** — microbundle was
removed deliberately.

## Hard rules

- **No explanatory code comments.** Repo-wide across all DraftZone projects, `/** */`
  included. Write code that reads without them. Plenty of older files carry commented-out
  Pokémon Showdown source — leave those alone unless you are rewriting the block.

  **New files are not an exception, and neither are tests, type declarations or "this is subtle"
  rationale.** This rule was violated across an entire session on 2026-09-08 — `resolution.ts`,
  `handlers.ts`, `resolve.ts` and four test files all shipped with doc blocks — on the reasoning
  that new code and non-obvious invariants deserved explaining. They do not: **that explanation
  belongs in `docs/`**, where it can be read, argued with and corrected, rather than rotting next
  to code that changes. If an invariant is load-bearing enough to want a comment, write it in
  `docs/PIPELINE.md` or `docs/REFACTOR.md` and let the code stand on its naming.
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
- **No clock and no RNG may influence a result — only telemetry.** The same input must produce the
  same output, byte for byte; a calculator that answers differently on a rerun is worse than a slow
  one. `Math.random()` no longer appears anywhere in `src` outside tests, and there is no `Date.now()`
  at all — grep is the check. This has been violated twice: `present` sampled its base power with
  `random(10)` instead of enumerating four branches (and got the weights wrong doing it, because the
  thresholds were written for a 0-indexed roll while `random` returned 1..10 — 120 BP came up twice as
  often as the cartridge, healing half as often), and the `/calc` endpoint once sized its compute
  budget from the measured wall-clock cost of the first resolve, which made the same request return
  different answers run to run. **A budget or a threshold must key off something known before any work
  happens** — the server's now keys off the move's maximum hit count. Timing belongs in
  `meta.elapsedMs` and nowhere else.

- **A move whose own data branches randomly declares those branches; it never rolls them.**
  `Moves.<id>.branches` in `mechanics/moves.ts` is a list of `{label, weight, move?}`, and
  `resolveMove` runs the whole resolution once per branch — a fifth axis alongside accuracy, hit
  count, crit and secondaries.

  **`move`/`flags` are the mechanism and `label` is only telemetry.** A branch sets real move data —
  Fickle Beam's all-out branch sets `flags: {allOut: true}` and its `onBasePower` returns `0x2000`
  when it sees that flag; Present's branches set `basePower` outright. **No handler may read the
  label.** Branch logic keyed on a label string would make the reporting name load-bearing, so
  renaming a label in the report would silently change a damage calculation. Labels exist for
  `Outcome.labels` and nothing else.

  `State.Move.flags` is an open bag (`{[flag: string]: 1 | 0 | boolean | undefined}`) so a move can
  carry a flag nobody declared — `1 | 0` because that is what the cartridge flags from `@pkmn/data`
  hold, `boolean` for the ones branches add. That means **`flags` mixes static cartridge properties
  (`contact`, `protect`, `sound`) with transient per-resolution ones**, so anything iterating flags
  sees both. `MoveDataBranch.flags` is a separate field from `.move` precisely because `withBranch`
  has to **merge** it — a `.move` overlay carrying `flags` would replace the whole bag and drop
  `contact`, and mutating the bag in place would leak the flag into every other branch.

  **`resolveMove` restores the original move before accumulating, and a branch flag must never
  survive into a resulting state.** `flags` is not part of `moveKey`, so a leaked flag does not show
  up as a distinct outcome — it silently rides along on whichever state won the merge, and
  `resolveTurns` then carries a move with `allOut` set into every later turn. `movedata.test` pins
  that every outcome's move is the original one.

  With that in place, Fickle Beam against a target both branches kill collapses to a single outcome
  at probability 1, still labelled 70/30 — which is the merge doing the sensitivity work.

  The axis is free when unused: an unbranched move gets one synthetic branch of weight 1 and the
  arithmetic is bit-identical to before. `RANDOM_DATA_MOVES` names the moves known to branch in the
  sim, and any of them without declared branches is refused rather than silently answered from the
  base data — which is how Fickle Beam was wrong for months.

  **The branch is chosen once per move, not once per hit**, so a branched move that hits more than
  once is refused (`'move-data branches on a multi-hit move'`) — including Fickle Beam under
  Parental Bond. The sim rolls it inside `getDamage`, so per-hit is the faithful placement; the
  guard exists so that when a multi-hit citizen appears it errors instead of quietly averaging.

- **Metronome is not supported and is not planned.** Nor is any other move-calling move — **Sleep
  Talk, Assist, Copycat, Mirror Move, Me First, Nature Power**. The move that actually resolves is
  drawn from a pool at runtime, so `state.move` is not knowable at build time and the entire input
  model stops applying; a faithful Metronome answer is a mixture over ~900 sub-distributions that
  answers no question anyone asks. They are refused by name. **Do not extend `branches` to reach
  them** — it is the wrong axis, and this is a stated non-goal in `docs/PLAN.md`, not a gap.

- **`branches` is a static array, and two of its four citizens need it to be conditional.** Magnitude
  should branch only when the caller has not pinned `move.magnitude` (`createMove` currently *demands*
  one, so it is refused rather than wrong), and Shell Side Arm is deterministic except on an exact
  physical-vs-special damage tie, so its branch list depends on the participants. Expect `branches` to
  become a function of the move and attacker, the way `hitCountBranches` already is.

- **Three moves are silently wrong today, and `branches` fixes none of them** — different layers.
  `Psywave` has a `damageCallback` returning `random(50,151) * level / 100`; dmg does not implement it
  and the dex says `basePower: 1`, so it reports **1-4 damage instead of 50-150**. `Tri Attack` and
  `Dire Claw` pick their status with `this.sample([...])` inside the secondary's `onHit`, and the dex
  secondary is `{chance: 20}` with **no `status` field** — so `secondaryBranches` splits 20/80
  correctly and then applies an empty effect, the two branches merge back, and every status is
  dropped without complaint. Damage is right, status is gone. Random *damage* and random *secondary
  selection* are two more axes; see `docs/PLAN.md` before adding either.

  **All three, plus Magnitude, are catalogued rather than fixed (2026-09-08)** — known-wrong-and-
  left-alone, not unnoticed. `docs/REFACTOR.md` records the two assumptions the refactor must not
  bake in because of them (a damage kernel is not always 16 rolls; `branches` will stop being a
  static array).

- **`resolveMove` refuses unsupported *moves*, and silently ignores unsupported *abilities and
  items*.** The only ability guards are `UNMODELLED_STATUS_ABILITIES` / `UNMODELLED_BOOST_ABILITIES`,
  both narrow and both about secondaries.

  **Most entries in `mechanics/abilities.ts` are present but entirely commented out, so "is it in
  the table" is not a coverage measure** — count entries that actually define a function. Of the 121
  gen 9 abilities the sim gives damage-relevant hooks, **39 are implemented in the table, 14 more
  are handled directly in `resolve.ts` (Serene Grace, Mold Breaker, Sturdy, Water Bubble, Magic
  Guard, Rock Head, Infiltrator…), and 68 do nothing and say nothing.** Items are far better: 73 of
  89. Sharpness is 1.5× low, Purifying Salt ~2× high, and thirteen absorb abilities — Flash Fire,
  Water Absorb, Volt Absorb, Sap Sipper, Storm Drain, Lightning Rod, Motor Drive, Earth Eater,
  Well-Baked Body, Wind Rider, Bulletproof, Soundproof, Wonder Guard — **report full damage where
  the real answer is zero**. `docs/PLAN.md` has the measured tables.

  **Both structural holes were closed 2026-09-08.** `calculateDamage` now consults the target's
  ability and item for `onTryImmunity`, and there is an ability stat-modifier stage in the damage
  path — before that, `calculateDamage` read `context.attacker.stats[stat]` raw and **no ability
  stat modifier was applied anywhere**, which is why Dragon's Maw, Transistor, Fur Coat and the Ruin
  quartet were silent. `onSourceBasePower` / `onSourceModifyAtk` / `onSourceModifySpA` now exist for
  defender-side reductions.

  **Every target-side ability in the table used to be dead code**, so the "implemented" count was
  optimistic on top of everything else: `Context.Move.updateData` chained `onBasePower` for the
  *attacker's* ability and item only. `heatproof` was fully written and had never once fired. If you
  add a defender-side effect, put it on an `onSource*` hook — chaining the target's plain
  `onBasePower` would make a defender's Technician boost the attacker.

  Ability suppression lives in `ignoresTargetAbility` (`context.ts`), covering `move.ignoreAbility`
  plus Mold Breaker / Teravolt / Turboblaze. It gates every target-ability read in the damage path.
  `resolve.ts` still has its own `MOLD_BREAKERS` copy for `endures()`; unify when convenient.

  **The fix is a warning, not a refusal (decided 2026-09-08), and it extends to moves** — the 29
  charge/delayed/counter/condition moves whose preconditions are unmodelled should carry it too.
  Derive the set from the handler tables rather than a hardcoded list: ask whether the sim has
  damage-relevant hooks for an effect ours lacks. **This lands before `REFACTOR.md` phase 0**,
  because it changes `resolveMove`'s output and phase 0 freezes the baseline phases 1-3 are proved
  against.

- **When diffing against the sim in bulk, three traps cost an afternoon.** Multi-hit moves mismatch
  because our maximum is every hit landing and critting while the sim rolls its own hit count from
  the seed — force the count. Always-crit moves (Flower Trick, Frost Breath, Surging Strikes) need
  the sim's crit forced to match. And a type immunity makes `calculateDamage` return the **scalar**
  `0` against the sim's sixteen zeros, so a naive length comparison reports a bug that is not there.

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

- **`battle.randomChance` is shared across accuracy, crit, secondaries and move data.** A blanket
  override answers all of them — that is how a 90%-accuracy move ends up always missing and the
  oracle reports zero damage. `oracle.ts` dispatches on the call's shape: `(n, 100)` is a percentage
  roll and is forced to hit, `(1, d)` is the crit roll, and anything else is a move-data branch
  answered by `BranchOptions.dataBranch` — which is what lets Fickle Beam's 30% be forced
  independently of the crit. Before that split, forcing a crit also forced the proc and `critCalls`
  counted `(3, 10)` as a crit.

  **Still ambiguous: `(1, 2)`.** A crit ratio of 3 gives denominator 2, and Shell Side Arm's
  category tie-break is also `(1, 2)`. Nothing distinguishes them without call-site information,
  which is one more reason full record/replay is the robust form and is wanted before Phase 3 rung 4.

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

- **`resolveTurns` projects the target's HP marginal, not the full state space, whenever it can.**
  The full projection costs one `resolveMove` per carried state per turn — a 2-5 hit move produces
  ~500 outcomes on turn 1 at ~130ms each, so turn 2 alone is a minute and 10 turns is hours. But when
  the only thing that varies across a turn's outcomes is the target's HP, the *same* damage
  distribution applies every turn, so one resolve plus an HP-marginal iteration gives the identical
  answer. Population Bomb over 10 turns went from unanswerable to 606ms, and
  `turns.test.ts` pins the two paths agreeing to nine decimals.

  **The gate must stay conservative, because the fast path is only exact if per-turn damage really is
  independent of the target's HP.** Two conditions, both checked in `damageIgnoresTargetHp`:
  every outcome must key identically to the input once its HP is restored (generic — catches status,
  boosts, item loss, volatiles via `stateKey`, no hardcoded field list), *and* the target's ability
  and item and the move must be outside the sets that read target HP — `multiscale`, `shadowshield`,
  `sturdy`, `figyberry`, `sitrusberry`, `focussash`, `brine`, `crushgrip`, `naturesmadness`,
  `superfang`, `wringout`. **Those sets were derived by grepping the handler tables for live reads of
  `target.hp`; re-derive them when adding a handler that reads HP, or the fast path will silently
  return a wrong answer.** A custom `Policy` also disables it, since the move can then differ by turn.

- **`maxResolves` is a backstop, not a routine control.** It only applies on the full path now. When
  it is exhausted, states are carried forward *unadvanced* rather than dropped, so mass stays exact
  and KO chances become a lower bound (`TurnsResult.unexpandedMass` reports how much was frozen), and
  the budget is spent on the highest-probability states first. Even so, a tight budget produces a
  floor so far below the truth that it is worse than no answer — 12 resolves reported a 1.7% two-turn
  KO where the real figure was 41.4%. If you find yourself tuning it, the fast path is being refused;
  find out why instead.

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

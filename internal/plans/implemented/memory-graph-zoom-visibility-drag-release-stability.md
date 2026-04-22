# Memory Graph — Zoom Visibility + Drag-Release Stability

## Context

Two UX bugs on the memory graph page:

1. **Nodes invisible at low zoom.** Node radius is world-space only (`node.size * 2`), so at `vp.scale=0.1` a typical memory renders as ~0.6px — indistinguishable from dust. Existing `lowZoom` branch actually halves the radius (wrong direction) and its 2-world-unit floor becomes 0.2px on screen at minimum zoom.
2. **Dense clump spasms on drag-release.** `dragEnd` triggers `reheat()` which calls `simulation.alpha(0.5).restart()`. Alpha 0.5 is violently hot — with ~50 nodes worth of charge + link + collide forces re-equilibrating simultaneously, the whole clump visibly jitters for ~0.8s.

Also noticed: worker and main-thread simulation paths disagree on charge strength (`*8` vs `*5`) — same "strength" slider yields different repulsion depending on which path runs. Cosmetic but worth fixing in the same edit.

## Files

- `apps/web/src/components/_components/canvas/renderer.ts` — node radius computation
- `apps/web/src/components/_components/canvas/simulation-worker.ts` — reheat alpha (preferred path)
- `apps/web/src/components/_components/canvas/simulation.ts` — reheat alpha + charge strength (fallback path)

## Changes

### 1. renderer.ts — zoom-invariant min radius (line 393-394)

Hyperbolic soft floor. Hubs stay bigger than leaves at all zoom levels, ~4px min on screen.

```ts
// BEFORE
const baseRadius = node.size * 2;
const radius = lowZoom ? Math.max(2, baseRadius * 0.5) : baseRadius;

// AFTER
const baseRadius = node.size * 2;
// Keep nodes visible at extreme zoom-out. minWorld is the world-space length
// of 4 screen pixels; sqrt-blend preserves hub/leaf ranking at all zoom.
const minWorld = 4 / vp.scale;
const radius = Math.sqrt(baseRadius * baseRadius + minWorld * minWorld);
```

Math check: at `vp.scale=1` (normal), `minWorld=4`, a size-3 node renders as `sqrt(36+16)=7.2` world = ~7px. Baseline was 6px. Acceptably close to baseline — nodes aren't visibly bigger at normal zoom. At `vp.scale=0.1`, `minWorld=40`, size-3 node = `sqrt(36+1600)=40.4` world = 4.04px. ✓

Leave lines 312/326/365/421/455/553 alone — all gated on `!lowZoom` so desync with the enlarged low-zoom radius isn't visible.

### 2. simulation-worker.ts — gentler reheat (line 54)

```ts
// BEFORE
case "reheat":
  sim?.alpha(0.5).restart();
  break;

// AFTER
case "reheat": {
  // Don't clobber a hotter simulation. Drag-release only needs a nudge.
  const current = sim?.alpha() ?? 0;
  sim?.alpha(Math.max(current, 0.1)).restart();
  break;
}
```

### 3. simulation.ts — same reheat change + charge harmonize (lines 187, 240, 244)

```ts
// Line 187: BEFORE
const chargeStrength = -scalingRatio * 5;
// Line 187: AFTER — match worker
const chargeStrength = -scalingRatio * 8;

// Line 240: BEFORE
reheat() {
  simulation.alpha(0.5).restart();
},
// Line 240: AFTER
reheat() {
  const current = simulation.alpha();
  simulation.alpha(Math.max(current, 0.1)).restart();
},

// Line 244: BEFORE
setStrength(s: number) {
  chargeForce.strength(-s * 5);
  simulation.alpha(0.3).restart();
},
// Line 244: AFTER — match worker's `*8`
setStrength(s: number) {
  chargeForce.strength(-s * 8);
  simulation.alpha(0.3).restart();
},
```

## Verification

1. `cd apps/web && pnpm dev`, open memory graph page.
2. **Zoom test**: scroll out to minimum zoom. Nodes should read as dots (~4px), not dust. Degree hubs should still look perceptibly larger than leaf nodes.
3. **Drag test**: zoom into a dense clump (the user mentioned ~50 memories). Grab a node, drag it out, release. Neighbors should settle gently in under a second — no clump-wide eruption.
4. **Slider test**: if there's a "strength" slider in the UI, verify it still feels responsive at the new `*8` multiplier (worker path was already `*8` in practice, so no change in actual UX).
5. `npx tsc` in `apps/web` — types should be untouched (no new signatures).

## Decisions locked

- Min screen radius: **4px**
- Size model: soft (hyperbolic) floor, preserves hub/leaf ranking
- Drag-release alpha: **0.1**, with `Math.max(current, 0.1)` guard so active sims aren't slowed
- Charge harmonize: main → `*8` to match worker

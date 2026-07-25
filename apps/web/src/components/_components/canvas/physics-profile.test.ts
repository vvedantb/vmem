// AI-generated (Claude), prompt: "verify physics profile tiers scale with graph node count"
// Modified by me: checked boundary counts at each tier step
import { describe, expect, it } from "vitest";
import { physicsProfile } from "./physics-profile";

describe("physicsProfile", () => {
  it("uses small-graph settings at 2000 nodes", () => {
    const p = physicsProfile(2000);
    expect(p.warmupTicks).toBe(150);
    expect(p.collideEnabled).toBe(true);
    expect(p.collideIterations).toBe(3);
    expect(p.chargeDistanceMax).toBe(1500);
  });

  it("steps up at 2001 nodes", () => {
    const p = physicsProfile(2001);
    expect(p.warmupTicks).toBe(60);
    expect(p.collideIterations).toBe(1);
    expect(p.chargeDistanceMax).toBe(3500);
  });

  it("uses mid-tier settings at 10000 nodes", () => {
    const p = physicsProfile(10_000);
    expect(p.warmupTicks).toBe(60);
    expect(p.ticksPerFrame).toBe(1);
    expect(p.tickIntervalMs).toBe(33);
  });

  it("steps up at 10001 nodes", () => {
    const p = physicsProfile(10_001);
    expect(p.warmupTicks).toBe(25);
    expect(p.collideEnabled).toBe(false);
    expect(p.chargeDistanceMax).toBe(6000);
    expect(p.tickIntervalMs).toBe(50);
  });

  it("uses large-graph settings at 30000 nodes", () => {
    const p = physicsProfile(30_000);
    expect(p.warmupTicks).toBe(25);
    expect(p.theta).toBe(1.5);
  });

  it("uses max-tier settings above 30000 nodes", () => {
    const p = physicsProfile(30_001);
    expect(p.warmupTicks).toBe(10);
    expect(p.alphaDecay).toBe(0.08);
    expect(p.theta).toBe(1.8);
    expect(p.tickIntervalMs).toBe(66);
    expect(p.chargeDistanceMax).toBe(10_000);
  });
});

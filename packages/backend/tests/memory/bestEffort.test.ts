import { describe, expect, it, vi } from "vitest";
import { runBestEffort } from "../../engine/memory/bestEffort";

describe("runBestEffort", () => {
  it("resolves when the run succeeds", async () => {
    const onError = vi.fn();
    const run = vi.fn(async () => "ok");

    await runBestEffort(run, onError);

    expect(run).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("swallows failures and reports them", async () => {
    const onError = vi.fn();
    const failure = new Error("convex unavailable");

    await runBestEffort(async () => {
      throw failure;
    }, onError);

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure);
  });
});

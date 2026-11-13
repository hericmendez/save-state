import { describe, expect, it, vi } from "vitest";
import { createReadinessCheck } from "@/db/readiness";

function dependencies(overrides: Partial<Parameters<typeof createReadinessCheck>[0]> = {}) {
  return {
    connect: vi.fn(async () => {}),
    identity: vi.fn(() => "connection-a"),
    ping: vi.fn(async () => {}),
    verifyIndexes: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("MongoDB readiness check", () => {
  it("pings every time but caches successful index inspection briefly", async () => {
    const deps = dependencies();
    const check = createReadinessCheck(deps, { indexCacheMs: 30_000 });

    await check();
    await check();

    expect(deps.connect).toHaveBeenCalledTimes(2);
    expect(deps.ping).toHaveBeenCalledTimes(2);
    expect(deps.verifyIndexes).toHaveBeenCalledTimes(1);
  });

  it("single-flights concurrent index checks", async () => {
    let finish!: () => void;
    let markEntered!: () => void;
    const entered = new Promise<void>((resolve) => { markEntered = resolve; });
    const verifyIndexes = vi.fn(
      () => new Promise<void>((resolve) => { finish = resolve; markEntered(); }),
    );
    const check = createReadinessCheck(dependencies({ verifyIndexes }));

    const first = check();
    const second = check();
    await entered;
    expect(verifyIndexes).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([first, second]);
  });

  it("expires the index cache and retries after ping or index failure", async () => {
    vi.useFakeTimers();
    try {
      const ping = vi.fn().mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("ping failed"))
        .mockResolvedValue(undefined);
      const deps = dependencies({ ping });
      const check = createReadinessCheck(deps, { indexCacheMs: 1_000 });

      await check();
      await expect(check()).rejects.toThrow("ping failed");
      await check();
      expect(deps.verifyIndexes).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1_001);
      await check();
      expect(deps.verifyIndexes).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not reuse index success after the database identity changes", async () => {
    const identity = vi.fn().mockReturnValueOnce("database-a").mockReturnValue("database-b");
    const deps = dependencies({ identity });
    const check = createReadinessCheck(deps);

    await check();
    await check();
    expect(deps.verifyIndexes).toHaveBeenCalledTimes(2);
  });

  it("times out a stalled dependency rather than waiting indefinitely", async () => {
    const check = createReadinessCheck(
      dependencies({ connect: () => new Promise<void>(() => {}) }),
      { connectTimeoutMs: 5 },
    );

    await expect(check()).rejects.toThrow("MongoDB connect timed out");
  });

  it("can explicitly discard cached index success", async () => {
    const deps = dependencies();
    const check = createReadinessCheck(deps);
    await check();
    check.reset();
    await check();
    expect(deps.verifyIndexes).toHaveBeenCalledTimes(2);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTrackerApi,
  type VmemTrackerNative,
} from "../modules/vmem-tracker/src/api";

const status = {
  paused: false,
  usageAccess: true,
  collectedThroughMs: 10,
  lastCollectAtMs: 10,
  lastCollectError: null,
  tokenExpiresAtMs: 0,
  installId: "abc",
  counts: { events: 1, pendingReview: 2, approved: 0, uploaded: 3 },
};

/** A stand-in for VmemTrackerModule.kt: records calls, returns JSON strings. */
function fakeNative(overrides: Partial<VmemTrackerNative> = {}) {
  const calls: string[] = [];
  const record = <T>(name: string, value: T) => {
    calls.push(name);
    return Promise.resolve(value);
  };
  const native: VmemTrackerNative = {
    getStatus: () => record("getStatus", JSON.stringify(status)),
    collectNow: () => record("collectNow", JSON.stringify(status)),
    readEvents: () => record("readEvents", "[]"),
    insertNote: (text) => record(`insertNote:${text}`, undefined),
    insertClipboard: (text) => record(`insertClipboard:${text}`, undefined),
    updateQueueBody: (id, json) =>
      record(`updateQueueBody:${String(id)}:${json}`, undefined),
    promote: (json) => record(`promote:${json}`, 1),
    listQueue: () => record("listQueue", "[]"),
    approve: (json) => record(`approve:${json}`, 1),
    approveAll: () => record("approveAll", 2),
    discard: (json) => record(`discard:${json}`, undefined),
    retry: (json) => record(`retry:${json}`, undefined),
    markUploaded: (id) => record(`markUploaded:${String(id)}`, undefined),
    markFailed: (id, error, count) =>
      record(`markFailed:${String(id)}:${error}:${String(count)}`, undefined),
    setPaused: (paused) =>
      record(
        `setPaused:${String(paused)}`,
        JSON.stringify({ ...status, paused }),
      ),
    getDenyList: () =>
      record(
        "getDenyList",
        JSON.stringify([
          { package: "com.whatsapp", label: "WhatsApp", installed: true },
        ]),
      ),
    setDenyList: (json) => record(`setDenyList:${json}`, undefined),
    resetDenyList: () => record("resetDenyList", undefined),
    listRecentApps: () => record("listRecentApps", "[]"),
    setAuthToken: (token) => record(`setAuthToken:${String(token)}`, undefined),
    setBaseUrl: (url) => record(`setBaseUrl:${url}`, undefined),
    deleteAllData: () => record("deleteAllData", undefined),
    openUsageAccessSettings: () => {
      calls.push("openUsageAccessSettings");
    },
    ...overrides,
  };
  return { native, calls };
}

describe("createTrackerApi", () => {
  it("parses native JSON into typed values", async () => {
    const { native } = fakeNative();
    const api = createTrackerApi(native);
    assert.deepEqual(await api.getStatus(), status);
    assert.equal((await api.setPaused(true)).paused, true);
    assert.deepEqual(await api.getDenyList(), [
      { package: "com.whatsapp", label: "WhatsApp", installed: true },
    ]);
  });

  it("sends ids and promotions as JSON", async () => {
    const { native, calls } = fakeNative();
    const api = createTrackerApi(native);
    await api.approve([1, 2]);
    await api.discard([3]);
    await api.setDenyList(["com.whatsapp"]);
    await api.insertNote("a");
    await api.insertClipboard("b");
    await api.updateQueueBody(7, "{}");
    await api.promote({ items: [], deleteEventIds: [4], trimEvents: [] });
    assert.deepEqual(calls, [
      "approve:[1,2]",
      "discard:[3]",
      'setDenyList:["com.whatsapp"]',
      "insertNote:a",
      "insertClipboard:b",
      "updateQueueBody:7:{}",
      'promote:{"items":[],"deleteEventIds":[4],"trimEvents":[]}',
    ]);
  });

  it("rejects a native payload that breaks the contract", async () => {
    const { native } = fakeNative({
      listQueue: () => Promise.resolve('[{"id":"1"}]'),
      readEvents: () => Promise.resolve('[{"id":1,"kind":"keystrokes"}]'),
    });
    const api = createTrackerApi(native);
    await assert.rejects(api.listQueue());
    await assert.rejects(api.readEvents());
  });
});

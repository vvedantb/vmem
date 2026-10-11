import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ConfirmSkipHint,
  getAltHeld,
  useRequestConfirm,
} from "@vvedantb/app-kit";

describe("ConfirmSkipHint", () => {
  it("keeps the kbd mounted but hidden while Alt is not held", () => {
    const html = renderToStaticMarkup(<ConfirmSkipHint />);
    expect(html).toContain("<kbd");
    expect(html).toContain("hidden");
  });
});

describe("useRequestConfirm", () => {
  it("reads the Alt snapshot at request time without subscribing", () => {
    expect(getAltHeld()).toBe(false);
    const api = useRequestConfirm();
    expect("altHeld" in api).toBe(false);
    const { request } = api;
    const calls: string[] = [];
    request(
      () => calls.push("open"),
      () => calls.push("confirm"),
    );
    request(
      () => calls.push("open"),
      () => calls.push("confirm"),
      { altKey: true },
    );
    expect(calls).toEqual(["open", "confirm"]);
  });
});

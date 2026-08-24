import { describe, expect, it } from "vitest";

import manifest from "./manifest";

// **Validates: Requirement 12.2**
describe("manifest PWA", () => {
  it("dichiara avvio standalone, scope globale e icone installabili", () => {
    const valore = manifest();

    expect(valore).toMatchObject({
      start_url: "/",
      scope: "/",
      display: "standalone",
      lang: "it",
    });
    expect(valore.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
      ]),
    );
  });
});

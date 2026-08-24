import { readConfigureGlobal } from "fast-check";
import { describe, expect, it } from "vitest";

describe("configurazione fast-check", () => {
  it("usa una soglia di iterazioni e un seme riproducibile fissi", () => {
    expect(readConfigureGlobal()).toMatchObject({
      numRuns: 100,
      seed: 424242,
    });
  });
});

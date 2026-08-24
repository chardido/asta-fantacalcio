import { configureGlobal } from "fast-check";

configureGlobal({
  numRuns: 100,
  seed: 424242,
});

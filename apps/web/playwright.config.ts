import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { chromium, defineConfig } from "@playwright/test";

const eseguibileDocker = [
  "/usr/local/bin/docker",
  "/opt/homebrew/bin/docker",
  "/usr/bin/docker",
  String.raw`C:\Program Files\Docker\Docker\resources\bin\docker.exe`,
].find((percorso) => existsSync(percorso));
const dockerDisponibile =
  eseguibileDocker !== undefined &&
  spawnSync(eseguibileDocker, ["info"], { stdio: "ignore" }).status === 0;
const browserDisponibile = existsSync(chromium.executablePath());
const ambienteCompleto = dockerDisponibile && browserDisponibile;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  outputDir: ".next/playwright-results",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: ambienteCompleto
    ? {
        command: "node e2e/avvia-ambiente.mjs",
        url: "http://127.0.0.1:3100/registrati",
        reuseExistingServer: false,
        timeout: 180_000,
      }
    : undefined,
});

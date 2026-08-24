import { describe, expect, it, vi } from "vitest";

import { registraServiceWorker, URL_SERVICE_WORKER } from "./service-worker";

// **Validates: Requirements 12.2, 12.3**
describe("registrazione del Service Worker", () => {
  it("registra il worker sullo scope applicativo senza usare la cache HTTP", async () => {
    const registrazione = {} as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(registrazione);

    await expect(registraServiceWorker({ register })).resolves.toBe(registrazione);
    expect(register).toHaveBeenCalledWith(URL_SERVICE_WORKER, {
      scope: "/",
      updateViaCache: "none",
    });
  });

  it("non fallisce nei browser privi di supporto", async () => {
    await expect(registraServiceWorker(null)).resolves.toBeNull();
  });
});

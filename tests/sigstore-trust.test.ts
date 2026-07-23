import { describe, expect, it, vi } from "vitest";
import {
  PACKAGED_SIGSTORE_TRUST_ROOT_SHA256,
  loadPackagedSigstoreTrustedRoot
} from "../src/sigstore-trust";

describe("packaged Sigstore trust material", () => {
  it("loads the reviewed locked-package target without network access", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network is disabled."));
    try {
      const trustedRoot = await loadPackagedSigstoreTrustedRoot();

      expect(trustedRoot.mediaType).toBe(
        "application/vnd.dev.sigstore.trustedroot+json;version=0.1"
      );
      expect(trustedRoot.certificateAuthorities.length).toBeGreaterThan(0);
      expect(trustedRoot.tlogs.length).toBeGreaterThan(0);
      expect(trustedRoot.ctlogs.length).toBeGreaterThan(0);
      expect(PACKAGED_SIGSTORE_TRUST_ROOT_SHA256).toMatch(/^[a-f0-9]{64}$/u);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});

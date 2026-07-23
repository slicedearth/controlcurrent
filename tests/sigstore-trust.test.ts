import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTrustedRoot } from "@sigstore/tuf";
import { describe, expect, it } from "vitest";

describe("packaged Sigstore trust material", () => {
  it("loads the locked TUF seed with live refresh disabled", async () => {
    const cachePath = await mkdtemp(join(tmpdir(), "controlcurrent-tuf-test-"));
    try {
      const trustedRoot = await getTrustedRoot({
        cachePath,
        forceCache: true,
        retry: 0,
        timeout: 1_000
      });

      expect(trustedRoot.mediaType).toBe(
        "application/vnd.dev.sigstore.trustedroot+json;version=0.1"
      );
      expect(trustedRoot.certificateAuthorities.length).toBeGreaterThan(0);
      expect(trustedRoot.tlogs.length).toBeGreaterThan(0);
      expect(trustedRoot.ctlogs.length).toBeGreaterThan(0);
    } finally {
      await rm(cachePath, { force: true, recursive: true });
    }
  });
});

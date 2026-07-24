import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("portable hosting policy", () => {
  it("declares restrictive response headers for a supporting static host", async () => {
    const policy = await readFile(resolve(root, "public/_headers"), "utf8");

    for (const marker of [
      "Content-Security-Policy:",
      "default-src 'self'",
      "script-src 'self'",
      "script-src-attr 'none'",
      "style-src 'self'",
      "style-src-attr 'none'",
      "img-src 'self' data:",
      "connect-src 'none'",
      "font-src 'self'",
      "object-src 'none'",
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'none'",
      "upgrade-insecure-requests",
      "Referrer-Policy: no-referrer",
      "X-Content-Type-Options: nosniff",
      "X-Frame-Options: DENY",
      "Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()",
      "Cross-Origin-Resource-Policy: same-origin"
    ]) {
      expect(policy).toContain(marker);
    }

    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("Access-Control-Allow-Origin: *");
  });
});

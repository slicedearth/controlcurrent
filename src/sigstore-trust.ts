import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { TrustedRoot } from "@sigstore/protobuf-specs";
import { z } from "zod";

const require = createRequire(import.meta.url);
const SIGSTORE_TUF_MIRROR = "https://tuf-repo-cdn.sigstore.dev";
const TRUSTED_ROOT_TARGET = "trusted_root.json";
const MAX_SEED_BYTES = 64 * 1_024;

export const PACKAGED_SIGSTORE_TRUST_ROOT_SHA256 =
  "6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66";

const trustedRootJsonSchema = z
  .object({
    mediaType: z.literal("application/vnd.dev.sigstore.trustedroot+json;version=0.1"),
    tlogs: z.array(z.unknown()).min(1).max(16),
    certificateAuthorities: z.array(z.unknown()).min(1).max(16),
    ctlogs: z.array(z.unknown()).min(1).max(16),
    timestampAuthorities: z.array(z.unknown()).max(16)
  })
  .loose();

const packagedSeedsSchema = z.record(
  z.string(),
  z
    .object({
      root: z.string().optional(),
      targets: z.record(z.string(), z.string())
    })
    .loose()
);

function decodeCanonicalBase64(value: string): Uint8Array {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) {
    throw new Error("The packaged Sigstore trust target is not canonical base64.");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength > MAX_SEED_BYTES) {
    throw new Error(`The packaged Sigstore trust target exceeds ${String(MAX_SEED_BYTES)} bytes.`);
  }
  return bytes;
}

export async function loadPackagedSigstoreTrustedRoot(): Promise<TrustedRoot> {
  const tufEntry = require.resolve("@sigstore/tuf");
  const seedPath = resolve(dirname(tufEntry), "..", "seeds.json");
  const seedBytes = await readFile(seedPath);
  if (seedBytes.byteLength > MAX_SEED_BYTES) {
    throw new Error(`The packaged Sigstore seed exceeds ${String(MAX_SEED_BYTES)} bytes.`);
  }

  const seeds = packagedSeedsSchema.parse(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(seedBytes)) as unknown
  );
  const encodedTarget = seeds[SIGSTORE_TUF_MIRROR]?.targets[TRUSTED_ROOT_TARGET];
  if (!encodedTarget) {
    throw new Error("The locked Sigstore package does not contain the expected trust target.");
  }

  const target = decodeCanonicalBase64(encodedTarget);
  const fingerprint = createHash("sha256").update(target).digest("hex");
  if (fingerprint !== PACKAGED_SIGSTORE_TRUST_ROOT_SHA256) {
    throw new Error("The packaged Sigstore trust target changed without review.");
  }

  const parsed = trustedRootJsonSchema.parse(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(target)) as unknown
  );
  return TrustedRoot.fromJSON(parsed);
}

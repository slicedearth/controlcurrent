export const INTEGRITY_ALGORITHMS = ["sha256", "sha384", "sha512"] as const;
export type IntegrityAlgorithm = (typeof INTEGRITY_ALGORITHMS)[number];

const DIGEST_LENGTHS: Readonly<Record<IntegrityAlgorithm, number>> = {
  sha256: 32,
  sha384: 48,
  sha512: 64
};

export type IntegrityMetadata = {
  algorithm: IntegrityAlgorithm;
  digest: Uint8Array;
};

export type IntegrityMetadataParseResult = {
  metadata: IntegrityMetadata[];
  invalidSupportedTokenCount: number;
};

export type CspNonceSource = {
  state: "not_nonce" | "invalid" | "short" | "valid";
  byteLength?: number;
};

function decodeBase64Value(value: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/u.test(value)) return undefined;
  const firstPadding = value.indexOf("=");
  if (firstPadding !== -1 && firstPadding < value.length - (value.endsWith("==") ? 2 : 1)) {
    return undefined;
  }
  const unpadded = value.replace(/=+$/u, "").replaceAll("-", "+").replaceAll("_", "/");
  if (unpadded.length % 4 === 1) return undefined;
  const padded = unpadded.padEnd(unpadded.length + ((4 - (unpadded.length % 4)) % 4), "=");
  try {
    const decoded = atob(padded);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
}

export function parseIntegrityMetadata(value: string): IntegrityMetadataParseResult {
  const metadata: IntegrityMetadata[] = [];
  let invalidSupportedTokenCount = 0;

  for (const token of value.split(/\s+/u).filter(Boolean)) {
    const expression = token.split("?", 1)[0] ?? "";
    const match = /^(sha256|sha384|sha512)-(.+)$/u.exec(expression);
    if (!match?.[1] || !match[2]) continue;
    const algorithm = match[1] as IntegrityAlgorithm;
    const digest = decodeBase64Value(match[2]);
    if (digest?.byteLength !== DIGEST_LENGTHS[algorithm]) {
      invalidSupportedTokenCount += 1;
      continue;
    }
    metadata.push({ algorithm, digest });
  }

  return { metadata, invalidSupportedTokenCount };
}

export function parseCspHashSource(token: string): IntegrityMetadataParseResult {
  if (!token.startsWith("'") || !token.endsWith("'")) {
    return { metadata: [], invalidSupportedTokenCount: 0 };
  }
  return parseIntegrityMetadata(token.slice(1, -1));
}

export function parseCspNonceSource(token: string): CspNonceSource {
  if (!/^'nonce-/iu.test(token)) return { state: "not_nonce" };
  const match = /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/u.exec(token);
  if (!match?.[1]) return { state: "invalid" };
  const decoded = decodeBase64Value(match[1]);
  if (!decoded) return { state: "invalid" };
  return decoded.byteLength >= 16
    ? { state: "valid", byteLength: decoded.byteLength }
    : { state: "short", byteLength: decoded.byteLength };
}

export function strongestIntegrityMetadata(
  metadata: readonly IntegrityMetadata[]
): IntegrityMetadata[] {
  const strongestIndex = metadata.reduce(
    (maximum, item) => Math.max(maximum, INTEGRITY_ALGORITHMS.indexOf(item.algorithm)),
    -1
  );
  if (strongestIndex < 0) return [];
  const strongest = INTEGRITY_ALGORITHMS[strongestIndex];
  return metadata.filter((item) => item.algorithm === strongest);
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64Bytes(value: string): Uint8Array | undefined {
  return decodeBase64Value(value);
}

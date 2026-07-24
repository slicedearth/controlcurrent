import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { checkServerIdentity } from "node:tls";
import { COLLECTOR_VERSION, type CollectorHop, type CollectorTransport } from "../src/collector";

const REDIRECT_STATUSES = new Set([300, 301, 302, 303, 304, 305, 307, 308]);
const DROPPED_RESPONSE_HEADERS = new Set([
  "authentication-info",
  "authorization",
  "cookie",
  "proxy-authenticate",
  "proxy-authentication-info",
  "proxy-authorization"
]);

function ipv4Value(address: string): number | undefined {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return undefined;
  }
  return (
    (((parts[0] ?? 0) << 24) +
      ((parts[1] ?? 0) << 16) +
      ((parts[2] ?? 0) << 8) +
      (parts[3] ?? 0)) >>>
    0
  );
}

function inIpv4Range(value: number, network: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (network & mask);
}

function ipv6Value(address: string): bigint | undefined {
  const zoneIndex = address.indexOf("%");
  const input = (zoneIndex === -1 ? address : address.slice(0, zoneIndex)).toLowerCase();
  const lastColon = input.lastIndexOf(":");
  const tail = input.slice(lastColon + 1);
  let normalised = input;
  if (tail.includes(".")) {
    const ipv4 = ipv4Value(tail);
    if (ipv4 === undefined) return undefined;
    normalised = `${input.slice(0, lastColon)}:${((ipv4 >>> 16) & 0xffff).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }
  const halves = normalised.split("::");
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return undefined;
  const words = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (words.length !== 8 || words.some((word) => !/^[0-9a-f]{1,4}$/u.test(word))) {
    return undefined;
  }
  return words.reduce((value, word) => (value << 16n) | BigInt(`0x${word}`), 0n);
}

function inIpv6Range(value: bigint, network: bigint, prefix: number): boolean {
  const shift = BigInt(128 - prefix);
  return value >> shift === network >> shift;
}

export function isPublicCollectorAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Value(address);
    if (value === undefined) return false;
    const blocked: [number, number][] = [
      [0x00000000, 8],
      [0x0a000000, 8],
      [0x64400000, 10],
      [0x7f000000, 8],
      [0xa9fe0000, 16],
      [0xac100000, 12],
      [0xc0000000, 24],
      [0xc0000200, 24],
      [0xc0a80000, 16],
      [0xc6120000, 15],
      [0xc6336400, 24],
      [0xcb007100, 24],
      [0xe0000000, 4],
      [0xf0000000, 4]
    ];
    return !blocked.some(([network, prefix]) => inIpv4Range(value, network, prefix));
  }
  if (family === 6) {
    const value = ipv6Value(address);
    if (value === undefined) return false;
    if (value === 0n || value === 1n) return false;
    if (inIpv6Range(value, 0xfc00n << 112n, 7)) return false;
    if (inIpv6Range(value, 0xfe80n << 112n, 10)) return false;
    if (inIpv6Range(value, 0xff00n << 112n, 8)) return false;
    if (inIpv6Range(value, 0x20010db8n << 96n, 32)) return false;
    const mappedPrefix = value >> 32n;
    if (mappedPrefix === 0xffffn) {
      return isPublicCollectorAddress(
        [
          Number((value >> 24n) & 0xffn),
          Number((value >> 16n) & 0xffn),
          Number((value >> 8n) & 0xffn),
          Number(value & 0xffn)
        ].join(".")
      );
    }
    return true;
  }
  return false;
}

async function resolvePinnedAddress(hostname: string, allowLoopback: boolean): Promise<string> {
  const host =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (isIP(host)) {
    if (allowLoopback && ["127.0.0.1", "::1"].includes(host)) return host;
    if (!isPublicCollectorAddress(host)) {
      throw new Error("Collector targets must resolve only to public addresses.");
    }
    return host;
  }
  const answers = await lookup(host, { all: true, verbatim: true });
  if (answers.length === 0) throw new Error("Collector target DNS returned no addresses.");
  if (allowLoopback && answers.every((answer) => ["127.0.0.1", "::1"].includes(answer.address))) {
    const first = [...answers].sort((left, right) => left.address.localeCompare(right.address))[0];
    if (!first) throw new Error("Collector target DNS returned no addresses.");
    return first.address;
  }
  if (answers.some((answer) => !isPublicCollectorAddress(answer.address))) {
    throw new Error("Collector targets must resolve only to public addresses.");
  }
  const first = [...answers].sort((left, right) => left.address.localeCompare(right.address))[0];
  if (!first) throw new Error("Collector target DNS returned no addresses.");
  return first.address;
}

function redactedCookie(value: string): string {
  const [first = "", ...attributes] = value.split(";");
  const name = first.slice(0, Math.max(0, first.indexOf("="))).trim();
  const redactedName = name.startsWith("__Host-")
    ? "__Host-redacted"
    : name.startsWith("__Secure-")
      ? "__Secure-redacted"
      : "redacted";
  return [`${redactedName}=REDACTED`, ...attributes.map((attribute) => attribute.trim())]
    .filter(Boolean)
    .join("; ");
}

export function sanitiseCollectorHeaders(
  input: Readonly<Record<string, string | string[] | undefined>>
): Record<string, string | string[]> {
  const output: Record<string, string | string[]> = {};
  const entries = Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  if (entries.length > 64) throw new Error("Response exceeds the 64-header bound.");
  for (const [rawName, rawValue] of entries) {
    const name = rawName.toLowerCase();
    if (DROPPED_RESPONSE_HEADERS.has(name)) continue;
    const values = (
      Array.isArray(rawValue) ? rawValue : rawValue === undefined ? [] : [rawValue]
    ).slice(0, 8);
    if (values.some((value) => Buffer.byteLength(value, "utf8") > 8_192)) {
      throw new Error(`Response header ${name} exceeds the value bound.`);
    }
    const sanitised =
      name === "set-cookie"
        ? values.map(redactedCookie)
        : name === "location"
          ? values.map(() => "REDACTED")
          : values;
    output[name] = sanitised.length === 1 ? (sanitised[0] ?? "") : sanitised;
  }
  return output;
}

function firstHeader(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  name: string
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function contentType(
  headers: Readonly<Record<string, string | string[] | undefined>>
): CollectorHop["contentType"] {
  const value = firstHeader(headers, "content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!value) return "unknown";
  if (value === "text/html" || value === "application/xhtml+xml") return "html";
  if (value === "application/json" || value.endsWith("+json")) return "json";
  if (["text/javascript", "application/javascript"].includes(value)) return "javascript";
  if (value === "text/css") return "css";
  if (value.startsWith("font/")) return "font";
  if (value.startsWith("image/")) return "image";
  if (value.startsWith("text/")) return "text";
  return "other";
}

function cacheState(
  status: number,
  headers: Readonly<Record<string, string | string[] | undefined>>
): CollectorHop["cache"] {
  const evidence = [
    firstHeader(headers, "cf-cache-status"),
    firstHeader(headers, "x-cache"),
    firstHeader(headers, "age")
  ]
    .filter((value): value is string => value !== undefined)
    .join(" ")
    .toLowerCase();
  if (status === 304 || evidence.includes("revalid")) return "revalidated";
  if (/(?:^|\\W)hit(?:\\W|$)/u.test(evidence)) return "hit";
  if (/(?:^|\\W)miss(?:\\W|$)/u.test(evidence)) return "miss";
  const cacheControl = firstHeader(headers, "cache-control")?.toLowerCase() ?? "";
  if (cacheControl.includes("no-store") || cacheControl.includes("private")) return "bypass";
  return "unknown";
}

function errorKind(error: unknown): NonNullable<CollectorHop["errorKind"]> {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  if (["ETIMEDOUT", "ERR_SOCKET_TIMEOUT"].includes(code)) return "timeout";
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "dns";
  if (code.startsWith("ERR_TLS") || code.startsWith("CERT_")) return "tls";
  if (["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH"].includes(code)) {
    return "connection";
  }
  return "other";
}

async function requestOnce(
  url: URL,
  address: string,
  maximumBodyBytes: number,
  timeoutMs: number
): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body?: string;
}> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = client(
      {
        protocol: url.protocol,
        hostname: address,
        family: isIP(address),
        port: url.port || undefined,
        method: "GET",
        path: `${url.pathname}${url.search}`,
        servername: url.protocol === "https:" ? url.hostname : undefined,
        checkServerIdentity:
          url.protocol === "https:"
            ? (_hostname, certificate) => checkServerIdentity(url.hostname, certificate)
            : undefined,
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/json;q=0.8,text/plain;q=0.7,*/*;q=0.1",
          Connection: "close",
          Host: url.host,
          "User-Agent": `ControlCurrent-Authorised-Collector/${COLLECTOR_VERSION}`
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.byteLength;
          if (bytes > maximumBodyBytes) {
            request.destroy(
              Object.assign(new Error("Response body exceeds the collector bound."), {
                code: "ERR_COLLECTOR_BODY_BOUND"
              })
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const status = response.statusCode;
          if (!status) {
            reject(new Error("Collector response did not contain an HTTP status."));
            return;
          }
          resolve({
            status,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy(
        Object.assign(new Error("Collector request timed out."), { code: "ETIMEDOUT" })
      );
    });
    request.on("error", reject);
    request.end();
  });
}

export class FixedOriginCollectorTransport implements CollectorTransport {
  constructor(private readonly allowLoopback = false) {}

  async collect(input: {
    baseOrigin: string;
    path: string;
    maximumBodyBytes: number;
    maximumRedirects: number;
    timeoutMs: number;
  }): Promise<readonly CollectorHop[]> {
    const origin = new URL(input.baseOrigin);
    if (
      origin.protocol !== "https:" &&
      !(
        this.allowLoopback &&
        ["127.0.0.1", "[::1]", "localhost"].includes(origin.hostname.toLowerCase())
      )
    ) {
      throw new Error("Authorised collection requires HTTPS except for explicit loopback testing.");
    }
    let current = new URL(input.path, origin);
    const hops: CollectorHop[] = [];

    for (let sequence = 0; sequence <= input.maximumRedirects; sequence += 1) {
      try {
        const address = await resolvePinnedAddress(current.hostname, this.allowLoopback);
        const response = await requestOnce(
          current,
          address,
          input.maximumBodyBytes,
          input.timeoutMs
        );
        const type = contentType(response.headers);
        const cache = cacheState(response.status, response.headers);
        const headers = sanitiseCollectorHeaders(response.headers);
        if (REDIRECT_STATUSES.has(response.status)) {
          const location = firstHeader(response.headers, "location");
          let target: URL | undefined;
          try {
            target = location ? new URL(location, current) : undefined;
          } catch {
            target = undefined;
          }
          const targetRelation = target
            ? target.origin === origin.origin
              ? "same_origin"
              : "cross_origin"
            : "unknown";
          hops.push({
            status: response.status,
            outcome: "redirect",
            headers,
            contentType: type,
            cache,
            redirectTarget: targetRelation
          });
          if (
            !target ||
            targetRelation !== "same_origin" ||
            target.username !== "" ||
            target.password !== "" ||
            !["http:", "https:"].includes(target.protocol) ||
            sequence === input.maximumRedirects
          ) {
            return hops;
          }
          current = target;
          continue;
        }
        hops.push({
          status: response.status,
          outcome: response.status >= 400 ? "http_error" : "final",
          headers,
          contentType: type,
          cache,
          ...(type === "html" && response.body !== undefined ? { body: response.body } : {})
        });
        return hops;
      } catch (error) {
        hops.push({
          outcome: "transport_error",
          headers: {},
          contentType: "unknown",
          cache: "unknown",
          errorKind: errorKind(error)
        });
        return hops;
      }
    }
    return hops;
  }
}

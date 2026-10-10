import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { FixedOriginCollectorTransport } from "../tools/collector-network";

describe("collector network transport", () => {
  it("bounds stalled resolution with the same absolute deadline", async () => {
    const transport = new FixedOriginCollectorTransport(
      true,
      () => new Promise<string>(() => undefined)
    );
    const result = await transport.collect({
      baseOrigin: "http://127.0.0.1:1",
      path: "/",
      maximumBodyBytes: 4096,
      maximumRedirects: 1,
      timeoutMs: 30
    });
    expect(result[0]).toMatchObject({ outcome: "transport_error", errorKind: "timeout" });
  });

  it.each(["trickle", "headers", "abort", "cookies"])(
    "settles and closes the %s response lifecycle",
    async (kind) => {
      const server = createServer((_request, response) => {
        if (kind === "headers") return;
        if (kind === "cookies") {
          response.writeHead(200, {
            "Set-Cookie": Array.from({ length: 9 }, (_, i) =>
              i === 8 ? "adverse=secret" : "ok=secret; Secure"
            )
          });
          response.end();
          return;
        }
        if (kind === "abort") {
          response.writeHead(200);
          response.write("a");
          response.destroy();
          return;
        }
        response.writeHead(200, { "Content-Type": "text/html" });
        response.write("<main>");
        const interval = setInterval(() => response.write("a"), 5);
        response.on("close", () => clearInterval(interval));
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      try {
        const address = server.address() as AddressInfo;
        const result = await new FixedOriginCollectorTransport(true).collect({
          baseOrigin: `http://127.0.0.1:${String(address.port)}`,
          path: "/",
          maximumBodyBytes: 4096,
          maximumRedirects: 2,
          timeoutMs: 70
        });
        expect(result.at(-1)).toMatchObject({ outcome: "transport_error" });
        if (["trickle", "headers"].includes(kind)) expect(result.at(-1)?.errorKind).toBe("timeout");
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    }
  );

  it("shares one absolute deadline across redirect hops without relying on scheduling speed", async () => {
    let releaseRedirect: () => void = () => {
      throw new Error("The redirect request has not arrived.");
    };
    let firstRequest: () => void = () => undefined;
    let secondRequest: () => void = () => undefined;
    const firstArrived = new Promise<void>((resolve) => {
      firstRequest = resolve;
    });
    const secondArrived = new Promise<void>((resolve) => {
      secondRequest = resolve;
    });
    const server = createServer((request, response) => {
      if (request.url === "/") {
        releaseRedirect = () => {
          response.writeHead(302, { Location: "/next" });
          response.end();
        };
        firstRequest();
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html" });
      response.write("<main>");
      secondRequest();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    // Fake only deadline timers; socket I/O and request-arrival barriers remain real.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const address = server.address() as AddressInfo;
      const collection = new FixedOriginCollectorTransport(true).collect({
        baseOrigin: `http://127.0.0.1:${String(address.port)}`,
        path: "/",
        maximumBodyBytes: 4096,
        maximumRedirects: 2,
        timeoutMs: 70
      });
      await firstArrived;
      await vi.advanceTimersByTimeAsync(40);
      releaseRedirect();
      await secondArrived;
      // Only the original remaining 30 ms is available, not a new 70 ms per hop.
      await vi.advanceTimersByTimeAsync(30);
      expect(await collection).toMatchObject([
        { outcome: "redirect", status: 302, redirectTarget: "same_origin" },
        { outcome: "transport_error", errorKind: "timeout" }
      ]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
  it("follows bounded loopback redirects without carrying cookies or credentials", async () => {
    const observedCredentials: string[] = [];
    const server = createServer((request, response) => {
      if (request.headers.cookie) observedCredentials.push(request.headers.cookie);
      if (request.headers.authorization) observedCredentials.push(request.headers.authorization);
      if (request.url === "/start") {
        response.writeHead(302, {
          Location: "/final",
          "Set-Cookie": "__Host-session=secret; Path=/; Secure; HttpOnly; SameSite=Lax"
        });
        response.end();
        return;
      }
      if (request.url === "/cross-origin") {
        response.writeHead(302, { Location: "https://outside.example/path?token=secret" });
        response.end();
        return;
      }
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'self'",
        "Cache-Control": "no-store"
      });
      response.end("<main>Local fixture</main>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address() as AddressInfo;
      const transport = new FixedOriginCollectorTransport(true);
      const input = {
        baseOrigin: `http://127.0.0.1:${String(address.port)}`,
        path: "/start",
        maximumBodyBytes: 4_096,
        maximumRedirects: 2,
        timeoutMs: 2_000
      };
      const hops = await transport.collect(input);

      expect(hops).toHaveLength(2);
      expect(hops[0]).toMatchObject({
        status: 302,
        outcome: "redirect",
        redirectTarget: "same_origin",
        headers: {
          location: "REDACTED",
          "set-cookie": "__Host-redacted=REDACTED; Path=/; Secure; HttpOnly; SameSite=Lax"
        }
      });
      expect(hops[1]).toMatchObject({
        status: 200,
        outcome: "final",
        contentType: "html",
        cache: "bypass",
        body: "<main>Local fixture</main>"
      });
      expect(observedCredentials).toEqual([]);

      const crossOrigin = await transport.collect({ ...input, path: "/cross-origin" });
      expect(crossOrigin).toHaveLength(1);
      expect(crossOrigin[0]).toMatchObject({
        outcome: "redirect",
        redirectTarget: "cross_origin",
        headers: { location: "REDACTED" }
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
});

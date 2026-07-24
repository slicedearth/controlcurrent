import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { FixedOriginCollectorTransport } from "../tools/collector-network";

describe("collector network transport", () => {
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

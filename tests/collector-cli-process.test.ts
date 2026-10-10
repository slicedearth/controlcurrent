import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { evidenceBundleInputSchema } from "../src/contracts";

let root: string;
let manifest: string;
const requests: string[] = [];
const server = createServer((request, response) => {
  requests.push(request.url ?? "");
  expect(request.headers.cookie).toBeUndefined();
  expect(request.headers.authorization).toBeUndefined();
  response.writeHead(200, {
    "Content-Type": "text/html",
    "Set-Cookie": "__Host-session=synthetic; Secure; HttpOnly; Path=/"
  });
  response.end("<main>Synthetic loopback fixture</main>");
});

function cli(output: string, confirm = true) {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
  delete env.FORCE_COLOR;
  return new Promise<{ status: string | number; stdout: string; stderr: string }>((complete) => {
    execFile(
      process.execPath,
      [
        "--import",
        resolve("node_modules/tsx/dist/loader.mjs"),
        resolve("tools/cli.ts"),
        "collect-evidence",
        manifest,
        "--output",
        output,
        "--allow-loopback",
        ...(confirm ? ["--confirm-authorised-target"] : [])
      ],
      { cwd: root, env, timeout: 15_000, encoding: "utf8" },
      (error, stdout, stderr) => {
        complete({ status: error?.code ?? 0, stdout, stderr });
      }
    );
  });
}
beforeEach(async () => {
  requests.length = 0;
  root = await mkdtemp(join(tmpdir(), "controlcurrent-collector-process-"));
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing loopback fixture address");
  manifest = join(root, "manifest.json");
  await writeFile(
    manifest,
    JSON.stringify({
      schemaVersion: 1,
      name: "Synthetic capture",
      baseOrigin: `http://127.0.0.1:${String(address.port)}`,
      applicationId: "fixture-app",
      environment: "test",
      revision: "fixture",
      producerId: "local-test",
      completeness: "complete",
      surfaces: [
        { id: "document", path: "/", role: "document", requiredEvidence: ["response", "html"] }
      ]
    })
  );
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done()))
  );
  await rm(root, { recursive: true, force: true });
});

describe("collector CLI diagnostics and destination preflight", () => {
  it("requires confirmation before a controlled loopback request", async () => {
    const result = await cli(join(root, "bundle.json"), false);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("requires --confirm-authorised-target");
    expect(requests).toEqual([]);
  });

  it("anchors the repository boundary to the CLI location when invoked elsewhere", async () => {
    const output = resolve("public", `denied-${randomUUID()}.json`);
    try {
      const result = await cli(output);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("outside the repository");
      expect(requests).toEqual([]);
      await expect(stat(output)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(output, { force: true });
    }
  });

  it("writes a reduced private capture and rejects reuse before contacting the fixture again", async () => {
    const output = join(root, "captures", "bundle.json");
    const result = await cli(output);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Collected 1 bounded response observations.");
    const contents = await readFile(output, "utf8");
    const bundle = evidenceBundleInputSchema.parse(JSON.parse(contents) as unknown);
    expect(bundle.htmlDocuments[0]?.html).toBe("<main>Synthetic loopback fixture</main>");
    expect(contents).not.toContain("__Host-session=synthetic");
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    expect(requests).toEqual(["/"]);
    const repeat = await cli(output);
    expect(repeat.status).toBe(2);
    expect(repeat.stdout).toBe("");
    expect(repeat.stderr).toContain("already exists");
    expect(requests).toEqual(["/"]);
    expect(await readFile(output, "utf8")).toBe(contents);
  });
});

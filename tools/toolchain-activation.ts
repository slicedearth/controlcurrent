import { execFile } from "node:child_process";
import { appendFileSync, chmodSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
export const CLI_VERSION = "12.2.0";

/** Activation is deliberately separate from reconstruction and follows both gates. */
export async function activateToolchain(
  target: string,
  environment: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const path = join(target, "executables");
  const env = { ...environment };
  const { stdout } = await run(process.execPath, [join(target, "bin/npm-cli.js"), "--version"], {
    env,
    timeout: 10_000
  });
  if (stdout.trim() !== CLI_VERSION) throw new Error("Restored CLI version did not match.");
  await run(
    process.execPath,
    [join(target, "bin/npm-cli.js"), "audit", "--prefix", target, "--audit-level=low"],
    { env, timeout: 60_000 }
  );
  await run(
    process.execPath,
    [join(target, "bin/npm-cli.js"), "audit", "signatures", "--prefix", target],
    { env, timeout: 60_000 }
  );
  chmodSync(join(target, "bin/npm-cli.js"), 0o700);
  chmodSync(join(target, "bin/npx-cli.js"), 0o700);
  mkdirSync(path, { mode: 0o700 });
  try {
    symlinkSync(join(target, "bin/npm-cli.js"), join(path, "npm"));
    symlinkSync(join(target, "bin/npx-cli.js"), join(path, "npx"));
    if (environment.GITHUB_PATH) appendFileSync(environment.GITHUB_PATH, `${path}\n`);
  } catch (error) {
    rmSync(path, { recursive: true, force: true });
    throw error;
  }
  return path;
}

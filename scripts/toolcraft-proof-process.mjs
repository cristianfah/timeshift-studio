import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

import spawn from "cross-spawn";

const chromiumInstallPromises = new Map();

export function detectToolcraftPackageManager(projectDir, env = process.env) {
  if (existsSync(path.join(projectDir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(projectDir, "yarn.lock"))) return "yarn";
  if (
    existsSync(path.join(projectDir, "bun.lock")) ||
    existsSync(path.join(projectDir, "bun.lockb"))
  ) {
    return "bun";
  }
  if (existsSync(path.join(projectDir, "package-lock.json"))) return "npm";
  const userAgent = env.npm_config_user_agent ?? "";
  if (userAgent.startsWith("pnpm/")) return "pnpm";
  if (userAgent.startsWith("yarn/")) return "yarn";
  if (userAgent.startsWith("bun/")) return "bun";
  if (userAgent.startsWith("npm/")) return "npm";
  return "npm";
}

export function getToolcraftBinaryPath(projectDir, name) {
  return path.join(
    projectDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${name}.cmd` : name,
  );
}

export function getToolcraftFrozenInstallCommand(packageManager) {
  return {
    bun: { args: ["install", "--frozen-lockfile"], command: "bun" },
    npm: { args: ["ci"], command: "npm" },
    pnpm: { args: ["install", "--frozen-lockfile"], command: "pnpm" },
    yarn: { args: ["install", "--immutable"], command: "yarn" },
  }[packageManager];
}

function createProofProcessError({
  command,
  code,
  signal,
  stderr,
  stdout,
}) {
  const outcome = signal
    ? `after signal ${signal}`
    : `with code ${code ?? 1}`;
  const capturedOutput = [stdout, stderr]
    .filter((output) => output.length > 0)
    .join("\n");
  const error = new Error(
    `${path.basename(command)} exited ${outcome}.${capturedOutput ? `\n${capturedOutput}` : ""}`,
  );
  error.code = code;
  error.signal = signal;
  error.stderr = stderr;
  error.stdout = stdout;
  return error;
}

function createProofProcessSpawnError({ command, error, stderr, stdout }) {
  const reason = error.code ? `${error.code}: ${error.message}` : error.message;
  const capturedOutput = [stdout, stderr]
    .filter((output) => output.length > 0)
    .join("\n");
  const wrapped = new Error(
    `${path.basename(command)} failed to start: ${reason}.${capturedOutput ? `\n${capturedOutput}` : ""}`,
    { cause: error },
  );
  wrapped.code = error.code ?? null;
  wrapped.signal = null;
  wrapped.stderr = stderr;
  wrapped.stdout = stdout;
  return wrapped;
}

function spawnToolcraftProofProcess(
  command,
  args,
  {
    capture = false,
    cwd,
    env = process.env,
    spawnProcess = spawn,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      cwd,
      env,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let settled = false;
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      reject(createProofProcessSpawnError({ command, error, stderr, stdout }));
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      if (signal || code !== 0) {
        reject(
          createProofProcessError({
            command,
            code,
            signal,
            stderr,
            stdout,
          }),
        );
      } else {
        resolve(capture ? stdout : undefined);
      }
    });
  });
}

export function runToolcraftProofProcess(command, args, options = {}) {
  return spawnToolcraftProofProcess(command, args, options);
}

export function captureToolcraftProofProcess(command, args, options = {}) {
  return spawnToolcraftProofProcess(command, args, {
    ...options,
    capture: true,
  });
}

export function runToolcraftProofPackageScript(
  projectDir,
  scriptName,
  { env = process.env } = {},
) {
  const packageManager = detectToolcraftPackageManager(projectDir, env);
  const args =
    packageManager === "npm" || packageManager === "bun"
      ? ["run", scriptName]
      : [scriptName];
  return runToolcraftProofProcess(packageManager, args, {
    cwd: projectDir,
    env,
  });
}

export async function ensureToolcraftChromium({
  accessFile = access,
  playwright,
  projectDir,
  runProcess = runToolcraftProofProcess,
}) {
  let executablePath;
  try {
    executablePath = playwright.chromium.executablePath();
    await accessFile(executablePath);
    return;
  } catch {
    // The canonical Playwright installer below owns recovery for a missing browser.
  }
  const installKey = JSON.stringify([
    path.resolve(projectDir),
    executablePath ?? "chromium",
  ]);
  let installPromise = chromiumInstallPromises.get(installKey);
  if (!installPromise) {
    installPromise = Promise.resolve().then(() =>
      runProcess(
        getToolcraftBinaryPath(projectDir, "playwright"),
        ["install", "chromium"],
        { cwd: projectDir },
      )
    );
    chromiumInstallPromises.set(installKey, installPromise);
  }
  try {
    await installPromise;
  } finally {
    if (chromiumInstallPromises.get(installKey) === installPromise) {
      chromiumInstallPromises.delete(installKey);
    }
  }
}

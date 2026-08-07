import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  requiredPackageScriptNames,
  requiredProtectedTrustRootFilePaths,
} from "./toolcraft-integrity-policy.mjs";

const fixtureManifestSignature =
  "qU2Tc5z8NqfzbGr7ZdcGhKtt6eLBkw+kJMvmTNq5cE3andSTf/tF3SUdwpNJ4nNSiSHn/x6FcP0/iKW98nEWDg==";
const runtimeSource = "export const runtime = true;\n";

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const sortRecord = (value) =>
  Object.fromEntries(Object.entries(value).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  ));

export function createToolcraftIntegrityFixtureManifest() {
  return {
    files: { "runtime.mjs": sha256(runtimeSource) },
    packageScripts: sortRecord(Object.fromEntries(
      requiredPackageScriptNames.map((scriptName) => [
        scriptName,
        `fixture:${scriptName}`,
      ]),
    )),
    protectedFiles: sortRecord(Object.fromEntries(
      requiredProtectedTrustRootFilePaths.map((relativePath) => [
        relativePath,
        sha256(`protected:${relativePath}\n`),
      ]),
    )),
    signature: fixtureManifestSignature,
    version: 3,
  };
}

export async function installToolcraftIntegrityFixture(rootDir) {
  const manifest = createToolcraftIntegrityFixtureManifest();
  await fs.rm(path.join(rootDir, "src", "toolcraft"), {
    force: true,
    recursive: true,
  });
  for (const relativePath of requiredProtectedTrustRootFilePaths) {
    const filePath = path.join(rootDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `protected:${relativePath}\n`);
  }
  await fs.mkdir(path.join(rootDir, "docs", "toolcraft"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(rootDir, "docs", "toolcraft", "agent-worklog.md"),
    "# Agent worklog\n",
  );
  await fs.mkdir(path.join(rootDir, "src", "toolcraft"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(rootDir, "src", "toolcraft", "runtime.mjs"),
    runtimeSource,
  );
  await fs.writeFile(
    path.join(rootDir, "src", "toolcraft", ".toolcraft-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(rootDir, "package.json"),
    `${JSON.stringify({ scripts: manifest.packageScripts }, null, 2)}\n`,
  );
  return manifest;
}

export async function createToolcraftIntegrityFixture() {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-integrity-"),
  );
  await installToolcraftIntegrityFixture(rootDir);
  return rootDir;
}

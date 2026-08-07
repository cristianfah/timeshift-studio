import assert from "node:assert/strict";
import test from "node:test";

import {
  TOOLCRAFT_VERIFICATION_IMPACT_VERSION,
  normalizeToolcraftVerificationImpactOwners,
  validateToolcraftVerificationImpactInventory,
} from "./toolcraft-verification-impact-inventory.mjs";

const hash = "a".repeat(64);
const catalog = {
  acceptance: [
    {
      acceptanceId: "appearance.background",
      contractHash: hash,
      domainId: "appearance",
      file: "app-controls.spec.ts",
      testName: "browser: background",
    },
    {
      acceptanceId: "persistence.reload",
      contractHash: "b".repeat(64),
      domainId: "persistence",
      file: "app-persistence.spec.ts",
      testName: "browser: persistence",
    },
  ],
  performance: [
    {
      passIds: ["preview-composite"],
      pathId:
        "performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22preview-composite%22%5D%2C%5B%22main%22%5D%2C%5B%5D%5D",
      testName:
        "browser perf: toolcraft path performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22preview-composite%22%5D%2C%5B%22main%22%5D%2C%5B%5D%5D",
    },
  ],
  version: 2,
};
const owner = (path, acceptanceIds, kind = "functional") => ({
  acceptanceIds,
  kind,
  path,
});
const requiredOwnerPaths = [
  "public/material.glb",
  "src/app/app-schema.ts",
  "src/features/material.png",
  "src/features/output.tsx",
];
const validOwners = [
  owner("src/features/output.tsx", ["appearance.background"], "performance"),
  owner("src/app/app-schema.ts", ["persistence.reload"]),
  owner("src/features/material.png", ["appearance.background"], "presentation"),
  owner("public/material.glb", ["appearance.background"], "presentation"),
].map((entry) =>
  entry.kind === "performance"
    ? { ...entry, passIds: ["preview-composite"] }
    : entry
);

test("validates exact v3 coverage, sorts, and deeply freezes owners", () => {
  const result = validateToolcraftVerificationImpactInventory(
    { owners: [...validOwners].reverse(), version: 3 },
    { catalog, requiredOwnerPaths: [...requiredOwnerPaths].reverse() },
  );

  assert.equal(TOOLCRAFT_VERIFICATION_IMPACT_VERSION, 3);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.inventory.owners.map(({ path }) => path),
    requiredOwnerPaths,
  );
  assert.equal(Object.isFrozen(result.inventory), true);
  assert.equal(Object.isFrozen(result.inventory.owners), true);
  assert.equal(Object.isFrozen(result.inventory.owners[0]), true);
  assert.equal(Object.isFrozen(result.inventory.owners[0].acceptanceIds), true);
});

test("canonical owner boundary normalizes once and can require stored order", () => {
  const input = [{
    acceptanceIds: ["persistence.reload", "appearance.background"],
    kind: "performance",
    passIds: ["source-decode", "preview-composite"],
    path: "src/features/output.tsx",
  }];
  const options = {
    acceptanceIds: ["appearance.background", "persistence.reload"],
    passIds: ["preview-composite", "source-decode"],
  };
  const normalized = normalizeToolcraftVerificationImpactOwners(
    input,
    options,
  );

  assert.deepEqual(normalized.errors, []);
  assert.deepEqual(normalized.owners[0].acceptanceIds, [
    "appearance.background",
    "persistence.reload",
  ]);
  assert.deepEqual(normalized.owners[0].passIds, [
    "preview-composite",
    "source-decode",
  ]);
  assert.equal(Object.isFrozen(normalized.owners), true);
  assert.equal(Object.isFrozen(normalized.owners[0]), true);
  assert.match(
    normalizeToolcraftVerificationImpactOwners(input, {
      ...options,
      requireCanonical: true,
    }).errors.join("\n"),
    /must be sorted/iu,
  );
});

test("rejects an unowned current texture and an owner for proof-only code", () => {
  const missing = validateToolcraftVerificationImpactInventory(
    {
      owners: validOwners.filter(
        ({ path }) => path !== "src/features/material.png",
      ),
      version: 3,
    },
    { catalog, requiredOwnerPaths },
  );
  assert.match(
    missing.errors.join("\n"),
    /"src\/features\/material\.png".*missing/iu,
  );

  const proofOwner = validateToolcraftVerificationImpactInventory(
    {
      owners: [
        ...validOwners,
        owner(
          "src/app/acceptance/reference.ts",
          ["appearance.background"],
        ),
      ],
      version: 3,
    },
    { catalog, requiredOwnerPaths },
  );
  assert.match(
    proofOwner.errors.join("\n"),
    /"src\/app\/acceptance\/reference\.ts".*not a current runtime production module or product resource/iu,
  );
});

test("rejects stale paths, v2, unknown ids, exact-key drift, and symbols", () => {
  const stale = validateToolcraftVerificationImpactInventory(
    {
      owners: [
        ...validOwners,
        owner("src/features/deleted.ts", ["missing.acceptance"]),
      ],
      version: 2,
      legacy: true,
    },
    { catalog, requiredOwnerPaths },
  );
  const errors = stale.errors.join("\n");
  assert.match(errors, /version must be 3/iu);
  assert.match(errors, /unknown fields: legacy/iu);
  assert.match(errors, /deleted\.ts.*not a current/iu);
  assert.match(errors, /unknown acceptance id "missing\.acceptance"/iu);

  const symbolOwner = {
    ...owner("src/app/app-schema.ts", ["persistence.reload"]),
    [Symbol("hidden")]: true,
  };
  const symbols = validateToolcraftVerificationImpactInventory(
    { owners: [symbolOwner], version: 3 },
    { catalog, requiredOwnerPaths: ["src/app/app-schema.ts"] },
  );
  assert.match(symbols.errors.join("\n"), /unknown fields: Symbol\(hidden\)/u);
});

test("preserves duplicate, overbroad, and unknown pass rejection", () => {
  const blanket = requiredOwnerPaths.map((path) => ({
    acceptanceIds: ["appearance.background", "persistence.reload"],
    kind: "performance",
    passIds: ["preview-composite"],
    path,
  }));
  const result = validateToolcraftVerificationImpactInventory(
    {
      owners: [
        ...blanket,
        {
          acceptanceIds: ["appearance.background"],
          kind: "performance",
          passIds: ["deleted-pass"],
          path: requiredOwnerPaths[0],
        },
      ],
      version: 3,
    },
    { catalog, requiredOwnerPaths },
  );
  const errors = result.errors.join("\n");
  assert.match(errors, /path "public\/material\.glb" must be unique/iu);
  assert.match(errors, /unknown renderer pass "deleted-pass"/iu);
  assert.match(errors, /ownership is overbroad/iu);
});

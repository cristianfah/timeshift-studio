import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  TOOLCRAFT_FUNCTIONAL_PROOF_MODEL_VERSION,
  createToolcraftAcceptanceContractHash,
  createToolcraftFunctionalProofModel as createFunctionalProofModel,
  createToolcraftFunctionalProofModelHash,
  deriveToolcraftAcceptanceDomainId,
  diffToolcraftFunctionalProofModels,
  getToolcraftFunctionalProofModelError,
} from "./toolcraft-functional-proof-model.mjs";

const hash = (character) => character.repeat(64);
const acceptanceRow = (acceptanceId, contractHash = hash("a")) => ({
  acceptanceId,
  contractHash,
  domainId: acceptanceId.split(".")[0],
  file: `${acceptanceId.split(".")[0]}.spec.ts`,
  testName: `browser: ${acceptanceId}`,
});
const catalog = (acceptance) => ({
  acceptance,
  performance: [],
  version: 2,
});
const inventory = (owners) => ({ owners, version: 3 });
const owner = (ownerPath, acceptanceIds, extra = {}) => ({
  acceptanceIds,
  kind: "functional",
  path: ownerPath,
  ...extra,
});
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
function createModel(input) {
  const model = createFunctionalProofModel(input);
  assert.match(createToolcraftFunctionalProofModelHash(model), /^[a-f0-9]{64}$/u);
  return model;
}
function withSymbol(value) {
  value[Symbol("unexpected")] = true;
  return value;
}

test("acceptance contract hashing uses one strict canonical JSON representation", () => {
  const left = {
    nested: { z: null, a: [true, 2, "2"] },
    title: "material",
  };
  const right = {
    title: "material",
    nested: { a: [true, 2, "2"], z: null },
  };
  const expected = createHash("sha256")
    .update('{"nested":{"a":[true,2,"2"],"z":null},"title":"material"}')
    .digest("hex");

  assert.equal(createToolcraftAcceptanceContractHash(left), expected);
  assert.equal(createToolcraftAcceptanceContractHash(right), expected);
  assert.notEqual(
    createToolcraftAcceptanceContractHash({ nested: { a: ["2", 2, true], z: null }, title: "material" }),
    expected,
  );
  const primitiveHashes = [null, true, false, 0, 1, "1"].map((value) =>
    createToolcraftAcceptanceContractHash({ value })
  );
  assert.equal(new Set(primitiveHashes).size, primitiveHashes.length);
});

test("acceptance contract hashing rejects every non-JSON-safe value", () => {
  const cyclic = {};
  cyclic.self = cyclic;
  for (const value of [
    { value: undefined },
    { value() {} },
    { value: Symbol("value") },
    { value: Number.NaN },
    { value: Number.POSITIVE_INFINITY },
    cyclic,
    { value: new Date(0) },
  ]) {
    assert.throws(
      () => createToolcraftAcceptanceContractHash(value),
      /canonical JSON/iu,
    );
  }
});

test("acceptance domains use the first stable namespace segment", () => {
  assert.equal(deriveToolcraftAcceptanceDomainId("material.donut.shape"), "material");
  assert.equal(deriveToolcraftAcceptanceDomainId("canvas"), "canvas");
  for (const invalid of ["", " material.shape", ".material", undefined]) {
    assert.throws(
      () => deriveToolcraftAcceptanceDomainId(invalid),
      /acceptance id/iu,
    );
  }
});

test("creates one sorted, duplicate-free, deeply frozen functional proof model", () => {
  const model = createModel({
    catalog: catalog([
      acceptanceRow("material.shape", hash("b")),
      acceptanceRow("export.image"),
    ]),
    inventory: inventory([
      {
        acceptanceIds: ["material.shape", "export.image"],
        kind: "performance",
        passIds: ["source", "composite"],
        path: "src/output.ts",
      },
      owner("src/app-schema.ts", ["export.image"]),
    ]),
  });

  assert.equal(TOOLCRAFT_FUNCTIONAL_PROOF_MODEL_VERSION, 1);
  assert.deepEqual(model, {
    acceptance: [
      acceptanceRow("export.image"),
      acceptanceRow("material.shape", hash("b")),
    ],
    owners: [
      owner("src/app-schema.ts", ["export.image"]),
      {
        acceptanceIds: ["export.image", "material.shape"],
        kind: "performance",
        passIds: ["composite", "source"],
        path: "src/output.ts",
      },
    ],
    version: 1,
  });
  assert.equal(getToolcraftFunctionalProofModelError(model), undefined);
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.acceptance[0]), true);
  assert.equal(Object.isFrozen(model.owners[1].acceptanceIds), true);
  assert.equal(Object.isFrozen(model.owners[1].passIds), true);
  assert.match(createToolcraftFunctionalProofModelHash(model), /^[a-f0-9]{64}$/u);
});

test("proof model validation is exact-key, canonical, and closed over acceptance ids", () => {
  const model = createModel({
    catalog: catalog([acceptanceRow("material.shape")]),
    inventory: inventory([owner("src/output.ts", ["material.shape"])]),
  });
  const malformedModels = [
    [{ ...model, extra: true }, /model.*unknown fields: extra/iu],
    [
      { ...model, acceptance: [{ ...model.acceptance[0], extra: true }] },
      /acceptance row.*unknown fields: extra/iu,
    ],
    [
      { ...model, owners: [{ ...model.owners[0], passIds: ["source"] }] },
      /owner.*unknown fields: passIds/iu,
    ],
    [
      { ...model, acceptance: [...model.acceptance, model.acceptance[0]] },
      /duplicate acceptance id/iu,
    ],
    [
      { ...model, owners: [...model.owners, model.owners[0]] },
      /owner path.*must be unique/iu,
    ],
    [
      {
        ...model,
        owners: [owner("src/output.ts", ["missing.acceptance"])],
      },
      /unknown acceptance id "missing\.acceptance"/iu,
    ],
  ].map(([malformed, expectedError]) => [
    deepFreeze(malformed),
    expectedError,
  ]);
  for (const [malformed, expectedError] of malformedModels) {
    assert.match(getToolcraftFunctionalProofModelError(malformed), expectedError);
    assert.throws(
      () => createToolcraftFunctionalProofModelHash(malformed),
      expectedError,
    );
  }
  assert.throws(
    () => createFunctionalProofModel({
      catalog: catalog([acceptanceRow("material.shape")]),
      inventory: inventory([{
        ...owner("src/output.ts", ["material.shape"]),
        unknown: true,
      }]),
    }),
    /unknown fields/iu,
  );
});

test("model hash is independent of source ordering after canonical construction", () => {
  const rows = [
    acceptanceRow("material.shape", hash("b")),
    acceptanceRow("export.image"),
  ];
  const owners = [
    owner("src/output.ts", ["material.shape"]),
    owner("src/app-schema.ts", ["export.image"]),
  ];
  const first = createModel({
    catalog: catalog(rows),
    inventory: inventory(owners),
  });
  const second = createModel({
    catalog: catalog([...rows].reverse()),
    inventory: inventory([...owners].reverse()),
  });

  assert.deepEqual(first, second);
  assert.equal(
    createToolcraftFunctionalProofModelHash(first),
    createToolcraftFunctionalProofModelHash(second),
  );
});

test("validation and hashing reject mutable models at every object depth", () => {
  const model = createModel({
    catalog: catalog([acceptanceRow("material.shape")]),
    inventory: inventory([owner("src/output.ts", ["material.shape"])]),
  });
  const mutableRoot = structuredClone(model);
  const mutableRow = Object.freeze({
    ...model,
    acceptance: Object.freeze([{ ...model.acceptance[0] }]),
  });
  const mutableOwnerIds = Object.freeze({
    ...model,
    owners: Object.freeze([
      Object.freeze({
        ...model.owners[0],
        acceptanceIds: [...model.owners[0].acceptanceIds],
      }),
    ]),
  });

  for (const mutable of [mutableRoot, mutableRow, mutableOwnerIds]) {
    assert.match(
      getToolcraftFunctionalProofModelError(mutable),
      /deeply frozen/iu,
    );
    assert.throws(
      () => createToolcraftFunctionalProofModelHash(mutable),
      /deeply frozen/iu,
    );
  }
});

test("diff ignores catalog metadata relocation when contract hash is unchanged", () => {
  const previous = createModel({
    catalog: catalog([acceptanceRow("material.shape")]),
    inventory: inventory([owner("src/output.ts", ["material.shape"])]),
  });
  const relocatedRow = {
    ...acceptanceRow("material.shape"),
    file: "material-relocated.spec.ts",
  };
  const current = createModel({
    catalog: catalog([relocatedRow]),
    inventory: inventory([owner("src/output.ts", ["material.shape"])]),
  });

  assert.deepEqual(diffToolcraftFunctionalProofModels({ current, previous }), {
    acceptanceIds: [],
    changedOwnerPaths: [],
    removedAcceptanceIds: [],
  });
});

test("diff selects semantic row and owner deltas while reporting removed ids separately", () => {
  const previous = createModel({
    catalog: catalog([
      acceptanceRow("export.old"),
      acceptanceRow("material.color"),
      acceptanceRow("scene.light"),
    ]),
    inventory: inventory([
      owner("src/export.ts", ["export.old"]),
      owner("src/material.ts", ["material.color"]),
      owner("src/scene.ts", ["scene.light"]),
    ]),
  });
  const current = createModel({
    catalog: catalog([
      acceptanceRow("material.color", hash("b")),
      acceptanceRow("material.shape"),
      acceptanceRow("scene.light"),
    ]),
    inventory: inventory([
      owner("src/material.ts", ["material.shape", "material.color"]),
      owner("src/scene.ts", ["scene.light"]),
      owner("src/shape.ts", ["material.shape"]),
    ]),
  });

  assert.deepEqual(diffToolcraftFunctionalProofModels({ current, previous }), {
    acceptanceIds: ["export.old", "material.color", "material.shape"],
    changedOwnerPaths: ["src/export.ts", "src/material.ts", "src/shape.ts"],
    removedAcceptanceIds: ["export.old"],
  });
});

test("diff preserves all coverage of an additive owner delta", () => {
  const rows = [
    acceptanceRow("material.color"),
    acceptanceRow("material.emission"),
  ];
  const previous = createModel({
    catalog: catalog(rows),
    inventory: inventory([
      owner("src/material.ts", ["material.color"]),
      owner("src/emission.ts", ["material.emission"]),
    ]),
  });
  const current = createModel({
    catalog: catalog(rows),
    inventory: inventory([
      owner(
        "src/material.ts",
        ["material.color", "material.emission"],
      ),
      owner("src/emission.ts", ["material.emission"]),
    ]),
  });

  assert.deepEqual(diffToolcraftFunctionalProofModels({ current, previous }), {
    acceptanceIds: ["material.color", "material.emission"],
    changedOwnerPaths: ["src/material.ts"],
    removedAcceptanceIds: [],
  });
});

test("diff keeps functional coverage when only owner classification changes", () => {
  const rows = [acceptanceRow("material.color")];
  const previous = createModel({
    catalog: catalog(rows),
    inventory: inventory([
      owner("src/material.ts", ["material.color"]),
    ]),
  });
  const current = createModel({
    catalog: catalog(rows),
    inventory: inventory([
      owner("src/material.ts", ["material.color"], {
        kind: "performance",
        passIds: ["preview"],
      }),
    ]),
  });

  assert.deepEqual(diffToolcraftFunctionalProofModels({ current, previous }), {
    acceptanceIds: ["material.color"],
    changedOwnerPaths: ["src/material.ts"],
    removedAcceptanceIds: [],
  });
});

test("construction uses current catalog and impact validation without partial acceptance", () => {
  const row = acceptanceRow("material.shape");
  const validInventory = inventory([owner("src/output.ts", ["material.shape"])]);
  const malformedPathId = "performance-path:not-json";
  assert.throws(
    () => createFunctionalProofModel({
      catalog: {
        ...catalog([row]),
        performance: [{
          passIds: [],
          pathId: malformedPathId,
          testName: `browser perf: toolcraft path ${malformedPathId}`,
        }],
      },
      inventory: validInventory,
    }),
    /invalid delivery catalog.*malformed canonical path/iu,
  );
  assert.throws(
    () => createFunctionalProofModel({
      catalog: catalog([row]),
      inventory: { ...validInventory, version: 999 },
    }),
    /inventory.*version must be 3/iu,
  );
});

test("symbol fields are rejected at model, catalog, inventory, and owner boundaries", () => {
  const model = createModel({
    catalog: catalog([acceptanceRow("material.shape")]),
    inventory: inventory([owner("src/output.ts", ["material.shape"])]),
  });
  const acceptanceArray = withSymbol([...model.acceptance]);
  const ownersArray = withSymbol([...model.owners]);
  const malformedModels = [
    withSymbol({ ...model }),
    { ...model, acceptance: [withSymbol({ ...model.acceptance[0] })] },
    { ...model, owners: [withSymbol({ ...model.owners[0] })] },
    { ...model, acceptance: acceptanceArray },
    { ...model, owners: ownersArray },
    {
      ...model,
      owners: [{
        ...model.owners[0],
        acceptanceIds: withSymbol([...model.owners[0].acceptanceIds]),
      }],
    },
  ].map(deepFreeze);
  for (const malformed of malformedModels) {
    assert.match(getToolcraftFunctionalProofModelError(malformed), /symbol/iu);
  }

  const row = acceptanceRow("material.shape");
  const validOwner = owner("src/output.ts", ["material.shape"]);
  for (const input of [
    {
      catalog: withSymbol(catalog([row])),
      inventory: inventory([validOwner]),
    },
    {
      catalog: catalog([withSymbol({ ...row })]),
      inventory: inventory([validOwner]),
    },
    {
      catalog: catalog([row]),
      inventory: withSymbol(inventory([validOwner])),
    },
    {
      catalog: catalog([row]),
      inventory: inventory(withSymbol([validOwner])),
    },
    {
      catalog: catalog([row]),
      inventory: inventory([withSymbol({ ...validOwner })]),
    },
    {
      catalog: catalog([row]),
      inventory: inventory([{
        ...validOwner,
        acceptanceIds: withSymbol([...validOwner.acceptanceIds]),
      }]),
    },
  ]) {
    assert.throws(() => createFunctionalProofModel(input), /symbol/iu);
  }
});

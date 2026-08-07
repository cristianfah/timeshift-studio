import assert from "node:assert/strict";
import test from "node:test";

import { evaluateToolcraftProductBoundary } from "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from "./toolcraft-product-boundary-test-fixtures.mjs";

const workspaceUiModule = ["@", "repo/ui"].join("");

test("finds built-in controls through every module form", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/control-bridge.ts": `
      export { SliderControl as ProductSlider } from "@/toolcraft/ui/components/controls";
      export { Color as ProductColor } from "@/toolcraft/ui";
    `,
    "src/features/dynamic.ts": `
      export async function loadControls() {
        return import("@/toolcraft/ui/components/controls/slider");
      }
    `,
    "src/features/namespace.ts": `
      import * as Controls from "@/toolcraft/ui";
      export const Slider = Controls.Slider;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map((violation) => violation.kind),
    [
      "built-in-control",
      "built-in-control",
      "built-in-control-implementation",
      "built-in-control",
    ],
  );
});

test("rejects every deep import path into built-in control implementations", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/direct.tsx": `
      import { ColorPickerPopover } from "@/toolcraft/ui/components/controls/color/color-picker-popover";
      export const Direct = ColorPickerPopover;
    `,
    "src/features/directory-index.ts": `
      import * as PrivateControls from "${workspaceUiModule}/components/controls";
      export const DirectoryIndex = PrivateControls;
    `,
    "src/features/dynamic.ts": `
      export const loadPrivateControl = () => import("${workspaceUiModule}/components/controls/color/color-value-utils");
    `,
    "src/features/namespace.ts": `
      import * as PrivateColor from "@/toolcraft/ui/components/controls/color";
      export const Namespace = PrivateColor;
    `,
    "src/features/reexport.ts": `
      export { getCommittedHexColor } from "@/toolcraft/ui/components/controls/color/color-value-utils";
    `,
    "src/features/require.ts": `
      export const privateControl = require("@/toolcraft/ui/components/controls/color/color-picker-popover");
    `,
    "src/features/workspace-source.ts": `
      import { ColorPickerPopover } from "${workspaceUiModule}/src/components/controls/color/color-picker-popover";
      export const WorkspaceSource = ColorPickerPopover;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(result.violations.length, 7);
  assert.equal(
    result.violations.every(
      (violation) => violation.kind === "built-in-control-implementation",
    ),
    true,
  );
  assert.equal(
    result.violations.every((violation) =>
      /deep control implementation|public schema control/u.test(
        violation.message,
      ),
    ),
    true,
  );
});

test("rejects the badge color-control copy at both private imports", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/badge-color-control.tsx": `
      import { ColorPickerPopover } from "@/toolcraft/ui/components/controls/color/color-picker-popover";
      import { getCommittedHexColor } from "@/toolcraft/ui/components/controls/color/color-value-utils";
      export const BadgeColorControl = { ColorPickerPopover, getCommittedHexColor };
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(
    result.violations.map(({ column, kind, line, repoPath }) => ({
      column,
      kind,
      line,
      repoPath,
    })),
    [
      {
        column: 7,
        kind: "built-in-control-implementation",
        line: 2,
        repoPath: "src/features/badge-color-control.tsx",
      },
      {
        column: 7,
        kind: "built-in-control-implementation",
        line: 3,
        repoPath: "src/features/badge-color-control.tsx",
      },
    ],
  );
});

test("rejects native and kit-primitive recreations of built-in controls", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/kit-inputs.tsx": `
      import { Input as FieldInput } from "@/toolcraft/ui/primitives";
      import * as Primitives from "@/toolcraft/ui/primitives";
      const AliasedInput = FieldInput;
      const { Input: RequiredInput } = require("@/toolcraft/ui/primitives");
      export const Color = <FieldInput type="color" />;
      export const File = <AliasedInput type={"file"} />;
      export const Range = <Primitives.Input type="range" />;
      export const Radio = <RequiredInput type="radio" />;
      export function Dynamic({ kind }) {
        return <FieldInput type={kind} />;
      }
    `,
    "src/features/native.tsx": `
      const rangeType = "range";
      export const Range = <input type={rangeType} />;
      export const Checkbox = <input type="checkbox" />;
      export const Radio = <input type="radio" />;
      export const Select = <select><option>One</option></select>;
      export const Notes = <textarea />;
    `,
    "src/features/private-primitive.tsx": `
      import PrimitiveInput from "${workspaceUiModule}/components/primitives/input";
      export const PrivatePrimitiveColor = <PrimitiveInput type="color" />;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(result.violations.length, 11);
  assert.equal(
    result.violations.every(
      (violation) => violation.kind === "native-control-recreation",
    ),
    true,
  );
});

test("allows generic text inputs, buttons, canvas, and product components", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/safe-controls.tsx": `
      import { Button, Input as FieldInput } from "@/toolcraft/ui/primitives";
      function ProductInput() { return <div>Product value</div>; }
      function ShadowedInput(FieldInput) { return <FieldInput type="color" />; }
      export const Safe = (
        <>
          <FieldInput type="text" />
          <input type="email" />
          <input type="hidden" />
          <Button>Run</Button>
          <button type="button">Local action</button>
          <canvas />
          <ProductInput />
          <ShadowedInput />
        </>
      );
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(result.violations, []);
});

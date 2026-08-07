import ts from "typescript";

import { createToolcraftUiInputBindingTracker } from "./toolcraft-product-control-bindings.mjs";

const workspacePrivateControlModulePattern =
  /^@repo\/ui\/(?:src\/)?(?:components\/controls(?:\/|$)|controls\/)/u;

const forbiddenInputTypes = new Map([
  ["checkbox", "checkbox or switch"],
  ["color", "color or colorOpacity"],
  ["file", "fileDrop"],
  ["radio", "segmented or select"],
  ["range", "slider or rangeSlider"],
]);

function normalizeSpecifier(value) {
  return value.replaceAll("\\", "/");
}

export function isToolcraftPrivateControlImplementationModule({
  moduleSpecifier,
  resolvedSpecifier,
}) {
  const normalizedSpecifier = normalizeSpecifier(moduleSpecifier);
  const normalizedResolvedSpecifier = resolvedSpecifier
    ? normalizeSpecifier(resolvedSpecifier)
    : "";

  return (
    workspacePrivateControlModulePattern.test(normalizedSpecifier) ||
    /^[#@]\/toolcraft\/ui\/(?:components\/)?controls\//u.test(
      normalizedSpecifier,
    ) ||
    /^[#@]\/toolcraft\/ui\/components\/controls(?:\/|$)/u.test(
      normalizedSpecifier,
    ) ||
    /\/src\/toolcraft\/ui\/components\/controls(?:\/|$)/u.test(
      normalizedResolvedSpecifier,
    ) ||
    /\/packages\/ui\/src\/components\/controls(?:\/|$)/u.test(
      normalizedResolvedSpecifier,
    )
  );
}

function getJsxTagName(tagName) {
  if (ts.isIdentifier(tagName)) return tagName.text;
  if (ts.isPropertyAccessExpression(tagName)) return tagName.name.text;
  return null;
}

export function createToolcraftProductControlInspector({
  checker,
  getNodeLocation,
  repoPath,
  resolveStaticString,
  sourceFile,
}) {
  const { isTrackedInputTag } = createToolcraftUiInputBindingTracker({
    checker,
    resolveStaticString,
  });

  function createViolation(node, message) {
    return {
      ...getNodeLocation(sourceFile, node),
      kind: "native-control-recreation",
      message,
      repoPath,
    };
  }

  function getInputType(attributes) {
    let inputType = "text";
    for (const property of attributes.properties) {
      if (ts.isJsxSpreadAttribute(property)) {
        inputType = null;
        continue;
      }
      if (!ts.isIdentifier(property.name) || property.name.text !== "type") {
        continue;
      }
      if (!property.initializer) {
        inputType = null;
      } else if (ts.isStringLiteral(property.initializer)) {
        inputType = property.initializer.text;
      } else if (
        ts.isJsxExpression(property.initializer) &&
        property.initializer.expression
      ) {
        inputType = resolveStaticString(property.initializer.expression) ?? null;
      } else {
        inputType = null;
      }
    }
    return inputType?.toLowerCase() ?? null;
  }

  function inspectNode(node) {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) {
      return [];
    }

    const tagName = getJsxTagName(node.tagName);
    if (tagName === "select") {
      return [
        createViolation(
          node.tagName,
          "Product source must not recreate the built-in Select with a native <select>. Declare a select schema control.",
        ),
      ];
    }
    if (tagName === "textarea") {
      return [
        createViolation(
          node.tagName,
          "Product source must not recreate built-in text or code controls with a native <textarea>. Declare a text or code schema control.",
        ),
      ];
    }

    if (tagName !== "input" && !isTrackedInputTag(node.tagName)) return [];

    const inputType = getInputType(node.attributes);
    if (inputType === null) {
      return [
        createViolation(
          node.tagName,
          "Product Input type must be statically resolvable so the Toolcraft boundary can verify that it does not recreate a built-in control.",
        ),
      ];
    }

    const builtInSchemaType = forbiddenInputTypes.get(inputType);
    if (!builtInSchemaType) return [];

    return [
      createViolation(
        node.tagName,
        `Product source must not recreate a built-in control with input type "${inputType}". Declare the built-in ${builtInSchemaType} schema control.`,
      ),
    ];
  }

  return { inspectNode };
}

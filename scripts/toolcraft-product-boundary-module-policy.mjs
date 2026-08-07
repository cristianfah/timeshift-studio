import path from "node:path";

import {
  getToolcraftProductExportModuleKind,
} from "./toolcraft-product-export-boundary.mjs";
import {
  isToolcraftPrivateControlImplementationModule,
} from "./toolcraft-product-control-boundary.mjs";

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function resolveSpecifierPath(sourceFilePath, moduleSpecifier, rootDir) {
  if (moduleSpecifier.startsWith("@/") || moduleSpecifier.startsWith("#/")) {
    return toPosixPath(path.resolve(rootDir, "src", moduleSpecifier.slice(2)));
  }
  if (moduleSpecifier.startsWith("/")) {
    return toPosixPath(path.resolve(rootDir, moduleSpecifier.slice(1)));
  }
  if (moduleSpecifier.startsWith(".")) {
    return toPosixPath(path.resolve(path.dirname(sourceFilePath), moduleSpecifier));
  }
  return null;
}

export function getToolcraftSensitiveModuleKind({
  moduleSpecifier,
  rootDir,
  sourceFilePath,
}) {
  const normalizedSpecifier = moduleSpecifier.replaceAll("\\", "/");
  const resolvedSpecifier = resolveSpecifierPath(
    sourceFilePath,
    normalizedSpecifier,
    rootDir,
  );
  const exportModuleKind = getToolcraftProductExportModuleKind(
    normalizedSpecifier,
    resolvedSpecifier,
  );
  if (exportModuleKind) return exportModuleKind;

  if (
    isToolcraftPrivateControlImplementationModule({
      moduleSpecifier: normalizedSpecifier,
      resolvedSpecifier,
    })
  ) {
    return "ui-control-implementation";
  }

  if (
    /^@repo\/toolcraft-runtime\/react\/model-rendering(?:\/|$)/u.test(
      normalizedSpecifier,
    ) ||
    /^[#@]\/toolcraft\/runtime\/react\/model-rendering(?:\/|$)/u.test(
      normalizedSpecifier,
    ) ||
    resolvedSpecifier?.includes("/src/toolcraft/runtime/react/model-rendering")
  ) {
    return "runtime-model-presentation";
  }

  if (
    /^three\/(?:addons|examples\/jsm)\/loaders(?:\/|$)/u.test(
      normalizedSpecifier,
    ) ||
    /^@gltf-transform(?:\/|$)/u.test(normalizedSpecifier) ||
    /^@repo\/toolcraft-runtime\/model-import(?:\/|$)/u.test(
      normalizedSpecifier,
    ) ||
    /^[#@]\/toolcraft\/runtime\/model-import(?:\/|$)/u.test(
      normalizedSpecifier,
    ) ||
    resolvedSpecifier?.includes("/src/toolcraft/runtime/model-import")
  ) {
    return "runtime-model-import";
  }

  if (
    /^@repo\/toolcraft-runtime\/react(?:\/|$)/u.test(normalizedSpecifier) ||
    /^[#@]\/toolcraft\/runtime\/react(?:\/|$)/u.test(normalizedSpecifier) ||
    resolvedSpecifier?.includes("/src/toolcraft/runtime/react")
  ) {
    return "runtime-react";
  }

  if (
    /^@repo\/ui(?:\/controls(?:\/|$)|$)/u.test(normalizedSpecifier) ||
    /^[#@]\/toolcraft\/ui(?:\/components\/controls(?:\/|$)|\/controls(?:\/|$)|$)/u.test(
      normalizedSpecifier,
    ) ||
    resolvedSpecifier?.includes("/src/toolcraft/ui/components/controls") ||
    /\/src\/toolcraft\/ui$/u.test(resolvedSpecifier ?? "")
  ) {
    return "ui-controls";
  }

  return null;
}

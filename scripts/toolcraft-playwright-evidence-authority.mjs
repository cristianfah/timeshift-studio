import ts from "typescript";

const PLAYWRIGHT_MODULE = "@playwright/test";
const PLAYWRIGHT_EVIDENCE_AUTHORITY_MESSAGE =
  'Product-owned tests must import "test" from the protected ./toolcraft-product-test wrapper. Direct Playwright runtime authority is not available to product code.';

function importedName(specifier) {
  return specifier.propertyName?.text ?? specifier.name.text;
}

function isPlaywrightAuthorityModule(value) {
  return (
    value === PLAYWRIGHT_MODULE || value?.startsWith(`${PLAYWRIGHT_MODULE}/`)
  );
}

function isAllowedPlaywrightImport(specifier, importClause) {
  if (specifier.isTypeOnly || importClause.isTypeOnly) {
    return importedName(specifier) !== "TestInfo";
  }
  return importedName(specifier) === "expect";
}

export function inspectToolcraftPlaywrightEvidenceAuthority({
  getNodeLocation,
  repoPath,
  resolveStaticString,
  sourceFile,
}) {
  const violations = [];

  function report(node) {
    violations.push({
      ...getNodeLocation(sourceFile, node),
      kind: "direct-playwright-evidence-authority",
      message: PLAYWRIGHT_EVIDENCE_AUTHORITY_MESSAGE,
      repoPath,
    });
  }

  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      isPlaywrightAuthorityModule(resolveStaticString(node.moduleSpecifier)) &&
      node.importClause
    ) {
      if (node.importClause.name) report(node.importClause.name);
      const bindings = node.importClause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        report(bindings);
      } else if (bindings && ts.isNamedImports(bindings)) {
        for (const specifier of bindings.elements) {
          if (!isAllowedPlaywrightImport(specifier, node.importClause)) {
            report(specifier);
          }
        }
      }
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      isPlaywrightAuthorityModule(
        resolveStaticString(node.moduleReference.expression),
      )
    ) {
      report(node);
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      isPlaywrightAuthorityModule(resolveStaticString(node.moduleSpecifier))
    ) {
      report(node);
    }

    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const callee = node.expression;
      const isDynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && callee.text === "require";
      if (
        (isDynamicImport || isRequire) &&
        isPlaywrightAuthorityModule(resolveStaticString(node.arguments[0]))
      ) {
        report(node);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

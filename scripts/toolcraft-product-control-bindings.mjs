import ts from "typescript";

const workspaceUiPrimitiveModulePattern =
  /^@repo\/ui(?:$|\/(?:src\/)?(?:components\/)?primitives(?:\/|$))/u;

function isToolcraftPublicUiPrimitiveModule(moduleSpecifier) {
  const normalizedSpecifier = moduleSpecifier.replaceAll("\\", "/");

  return (
    workspaceUiPrimitiveModulePattern.test(normalizedSpecifier) ||
    /^[#@]\/toolcraft\/ui$/u.test(normalizedSpecifier) ||
    /^[#@]\/toolcraft\/ui\/primitives(?:\/|$)/u.test(normalizedSpecifier) ||
    /^[#@]\/toolcraft\/ui\/components\/primitives(?:\/|$)/u.test(
      normalizedSpecifier,
    )
  );
}

function unwrapExpression(node) {
  let current = node;

  while (
    ts.isAwaitExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function getImportModuleSpecifier(declaration) {
  if (ts.isImportSpecifier(declaration)) {
    const importDeclaration = declaration.parent.parent.parent;
    return ts.isImportDeclaration(importDeclaration) &&
      ts.isStringLiteralLike(importDeclaration.moduleSpecifier)
      ? importDeclaration.moduleSpecifier.text
      : null;
  }

  if (ts.isNamespaceImport(declaration)) {
    const importDeclaration = declaration.parent.parent;
    return ts.isImportDeclaration(importDeclaration) &&
      ts.isStringLiteralLike(importDeclaration.moduleSpecifier)
      ? importDeclaration.moduleSpecifier.text
      : null;
  }

  if (ts.isImportClause(declaration)) {
    const importDeclaration = declaration.parent;
    return ts.isImportDeclaration(importDeclaration) &&
      ts.isStringLiteralLike(importDeclaration.moduleSpecifier)
      ? importDeclaration.moduleSpecifier.text
      : null;
  }

  return null;
}

export function createToolcraftUiInputBindingTracker({
  checker,
  resolveStaticString,
}) {
  const bindingKinds = new Map();
  const resolvingSymbols = new Set();

  function classifyExpression(expression) {
    const current = unwrapExpression(expression);

    if (ts.isIdentifier(current)) {
      const symbol = checker.getSymbolAtLocation(current);
      return symbol ? classifySymbol(symbol) : null;
    }

    if (
      ts.isPropertyAccessExpression(current) &&
      current.name.text === "Input" &&
      classifyExpression(current.expression) === "namespace"
    ) {
      return "input";
    }

    if (
      ts.isCallExpression(current) &&
      current.arguments.length > 0 &&
      (current.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(current.expression) &&
          current.expression.text === "require"))
    ) {
      const moduleSpecifier = resolveStaticString(current.arguments[0]);
      return moduleSpecifier &&
        isToolcraftPublicUiPrimitiveModule(moduleSpecifier)
        ? "namespace"
        : null;
    }

    return null;
  }

  function classifyDeclaration(declaration) {
    if (ts.isImportSpecifier(declaration)) {
      const importedName = declaration.propertyName?.text ?? declaration.name.text;
      const moduleSpecifier = getImportModuleSpecifier(declaration);
      return importedName === "Input" &&
        moduleSpecifier &&
        isToolcraftPublicUiPrimitiveModule(moduleSpecifier)
        ? "input"
        : null;
    }

    if (ts.isNamespaceImport(declaration)) {
      const moduleSpecifier = getImportModuleSpecifier(declaration);
      return moduleSpecifier &&
        isToolcraftPublicUiPrimitiveModule(moduleSpecifier)
        ? "namespace"
        : null;
    }

    if (ts.isImportClause(declaration)) {
      const moduleSpecifier = getImportModuleSpecifier(declaration);
      return moduleSpecifier &&
        isToolcraftPublicUiPrimitiveModule(moduleSpecifier) &&
        /(?:^|\/)input(?:\.[cm]?[jt]sx?)?$/iu.test(moduleSpecifier)
        ? "input"
        : null;
    }

    if (
      ts.isImportEqualsDeclaration(declaration) &&
      ts.isExternalModuleReference(declaration.moduleReference) &&
      declaration.moduleReference.expression &&
      ts.isStringLiteralLike(declaration.moduleReference.expression) &&
      isToolcraftPublicUiPrimitiveModule(declaration.moduleReference.expression.text)
    ) {
      return "namespace";
    }

    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      return classifyExpression(declaration.initializer);
    }

    if (
      ts.isBindingElement(declaration) &&
      !declaration.dotDotDotToken &&
      (declaration.propertyName?.getText() ?? declaration.name.getText()) ===
        "Input"
    ) {
      const variableDeclaration = declaration.parent.parent;
      return ts.isVariableDeclaration(variableDeclaration) &&
        variableDeclaration.initializer &&
        classifyExpression(variableDeclaration.initializer) === "namespace"
        ? "input"
        : null;
    }

    return null;
  }

  function classifySymbol(symbol) {
    if (bindingKinds.has(symbol)) return bindingKinds.get(symbol);
    if (resolvingSymbols.has(symbol)) return null;

    resolvingSymbols.add(symbol);
    const bindingKind =
      symbol.declarations
        ?.map(classifyDeclaration)
        .find((candidate) => candidate !== null) ?? null;
    resolvingSymbols.delete(symbol);
    bindingKinds.set(symbol, bindingKind);
    return bindingKind;
  }

  function isTrackedInputTag(tagName) {
    return classifyExpression(tagName) === "input";
  }

  return { isTrackedInputTag };
}

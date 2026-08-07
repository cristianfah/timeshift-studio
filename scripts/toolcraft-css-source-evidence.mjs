import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

import { scanToolcraftCssUrlTokens } from "./toolcraft-css-url-scanner.mjs";

const EXTERNAL_CSS_URL_PATTERN =
  /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/|#)/u;

function compoundNodeHasLocalClass(node) {
  if (node.type === "class") return true;
  if (node.type !== "pseudo") return false;
  if ([":is", ":where"].includes(node.value)) {
    return Boolean(
      node.nodes?.length > 0 &&
        node.nodes.every(
          (branch) =>
            branch.type === "selector" &&
            selectorFirstCompoundHasLocalClass(branch),
        ),
    );
  }
  if (node.value !== ":local") return false;
  let hasLocalClass = false;
  node.walkClasses(() => {
    hasLocalClass = true;
  });
  return hasLocalClass;
}

function selectorFirstCompoundHasLocalClass(selector) {
  for (const node of selector.nodes) {
    if (node.type === "combinator") break;
    if (compoundNodeHasLocalClass(node)) return true;
  }
  return false;
}

function inspectSiblingEscapes(selector, reasons, displaySelector = selector) {
  let currentCompoundHasLocalClass = false;
  let pendingSiblingCombinator;
  for (const node of selector.nodes) {
    if (node.type === "combinator") {
      if (pendingSiblingCombinator && !currentCompoundHasLocalClass) {
        reasons.push(
          `selector "${displaySelector}" escapes through sibling combinator ${pendingSiblingCombinator}`,
        );
      }
      const combinator = node.value.trim();
      pendingSiblingCombinator =
        combinator === "+" || combinator === "~" ? combinator : undefined;
      currentCompoundHasLocalClass = false;
      continue;
    }
    if (compoundNodeHasLocalClass(node)) currentCompoundHasLocalClass = true;
    if (node.type === "pseudo") {
      for (const branch of node.nodes ?? []) {
        if (branch.type === "selector") {
          inspectSiblingEscapes(branch, reasons, displaySelector);
        }
      }
    }
  }
  if (pendingSiblingCombinator && !currentCompoundHasLocalClass) {
    reasons.push(
      `selector "${displaySelector}" escapes through sibling combinator ${pendingSiblingCombinator}`,
    );
  }
}

function inspectSelector(selector, reasons) {
  inspectSiblingEscapes(selector, reasons);
  selector.walk((node) => {
    if (node.type === "pseudo" && node.value === ":global") {
      reasons.push(`selector "${selector}" uses :global`);
    }
    if (
      (node.type === "tag" && ["body", "html"].includes(node.value.toLowerCase())) ||
      (node.type === "id" && node.value === "root") ||
      (node.type === "pseudo" && node.value === ":root")
    ) {
      reasons.push(`selector "${selector}" targets a document root`);
    }
    if (
      node.type === "attribute" &&
      ((node.attribute === "data-slot" &&
        /^toolcraft-/u.test(node.value ?? "")) ||
        (node.attribute.startsWith("data-toolcraft-") &&
          ![
            "data-toolcraft-product-output",
            "data-toolcraft-product-text",
          ].includes(node.attribute)))
    ) {
      reasons.push(`selector "${selector}" targets a Toolcraft host attribute`);
    }
  });
  if (!selectorFirstCompoundHasLocalClass(selector)) {
    reasons.push(`selector "${selector}" is not anchored to a local class`);
  }
}

function getSourceLocation(source, offset) {
  const prefix = source.slice(0, offset);
  return {
    column: offset - prefix.lastIndexOf("\n"),
    line: (prefix.match(/\n/gu)?.length ?? 0) + 1,
  };
}

function collectValueUrlFacts({ facts, rawSource, value, valueOffset }) {
  for (const token of scanToolcraftCssUrlTokens(value)) {
    facts.push(Object.freeze({
      ...getSourceLocation(rawSource, valueOffset + token.start),
      local:
        token.value.length > 0 &&
        !EXTERNAL_CSS_URL_PATTERN.test(token.value),
      quoted: token.quoted,
      rawValue: token.rawValue,
      value: token.value,
    }));
  }
}

function collectUrlFacts(root, rawSource) {
  const facts = [];
  root.walk((node) => {
    if (node.type === "decl") {
      collectValueUrlFacts({
        facts,
        rawSource,
        value: node.value,
        valueOffset:
          node.source.start.offset + node.prop.length + node.raws.between.length,
      });
    } else if (node.type === "atrule" && node.params) {
      collectValueUrlFacts({
        facts,
        rawSource,
        value: node.params,
        valueOffset:
          node.source.start.offset +
          node.name.length +
          (node.raws.afterName?.length ?? 0) +
          1,
      });
    }
  });
  return Object.freeze(facts);
}

function createCssEvidence(reasons, repoPath, urlFacts) {
  const uniqueReasons = Object.freeze([...new Set(reasons)]);
  const violations = uniqueReasons.length === 0
    ? Object.freeze([])
    : Object.freeze([Object.freeze({
        column: 1,
        kind: "product-global-css",
        line: 1,
        message:
          `Product styles must use selector-local *.module.css rules and must not escape into the signed Toolcraft host. ${uniqueReasons.join("; ")}.`,
        repoPath,
      })]);
  return Object.freeze({ reasons: uniqueReasons, urlFacts, violations });
}

export function createToolcraftCssSourceRecord({ rawSource, repoPath }) {
  const reasons = [];
  let urlFacts = Object.freeze([]);
  if (!/\.module\.css$/iu.test(repoPath)) {
    reasons.push("the file is not a CSS Module");
  }
  try {
    const root = postcss.parse(rawSource, { from: repoPath });
    urlFacts = collectUrlFacts(root, rawSource);
    root.walkAtRules("import", () => {
      reasons.push("CSS @import can pull unscoped styles into the product bundle");
    });
    root.walkRules((rule) => {
      selectorParser((selectors) => {
        selectors.each((selector) => inspectSelector(selector, reasons));
      }).processSync(rule.selector);
    });
  } catch (error) {
    reasons.push(
      `CSS could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return Object.freeze({
    cssEvidence: createCssEvidence(reasons, repoPath, urlFacts),
    imports: Object.freeze([]),
    rawSource,
  });
}

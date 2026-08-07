function parseFenceOpening(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
  if (!match || (match[1][0] === "`" && match[2].includes("`"))) {
    return undefined;
  }
  return { character: match[1][0], length: match[1].length };
}

function isFenceClosing(line, fence) {
  const escaped = fence.character === "`" ? "`" : "~";
  return new RegExp(
    `^ {0,3}${escaped}{${fence.length},}[ \\t]*$`,
    "u",
  ).test(line);
}

function parseHeading(line) {
  const match = /^ {0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$/u.exec(line);
  if (!match) return undefined;
  const text = (match[2] ?? "")
    .replace(/[ \t]+#+[ \t]*$/u, "")
    .trim();
  return { level: match[1].length, text };
}

function scanMarkdown(source) {
  const lines = source.split(/\r?\n/u);
  const authoritative = Array.from({ length: lines.length }, () => true);
  const headings = [];
  let fence;
  let unclosedFenceLine;

  for (const [index, line] of lines.entries()) {
    if (fence) {
      authoritative[index] = false;
      if (isFenceClosing(line, fence)) {
        fence = undefined;
        unclosedFenceLine = undefined;
      }
      continue;
    }
    const opening = parseFenceOpening(line);
    if (opening) {
      authoritative[index] = false;
      fence = opening;
      unclosedFenceLine = index;
      continue;
    }
    const heading = parseHeading(line);
    if (heading) headings.push({ ...heading, line: index });
  }
  return { authoritative, headings, lines, unclosedFenceLine };
}

function getSectionEnd(headings, section) {
  return (
    headings.find(
      (heading) =>
        heading.line > section.line && heading.level <= section.level,
    )?.line ?? Number.POSITIVE_INFINITY
  );
}

function getSanitizedLines(scan, start, end) {
  return scan.lines
    .slice(start, end)
    .map((line, offset) =>
      scan.authoritative[start + offset] ? line : "",
    );
}

export function getToolcraftMarkdownSectionBodies(source, sectionName) {
  const scan = scanMarkdown(source);
  return scan.headings
    .filter(
      (heading) =>
        heading.text.toLocaleLowerCase() ===
        sectionName.toLocaleLowerCase(),
    )
    .map((section) => {
      const end = Math.min(
        getSectionEnd(scan.headings, section),
        scan.lines.length,
      );
      return getSanitizedLines(scan, section.line + 1, end)
        .join("\n")
        .trim();
    });
}

export function parseToolcraftDecisionTrail(source) {
  const scan = scanMarkdown(source);
  const errors = [];
  const sections = scan.headings.filter(
    (heading) =>
      heading.level === 2 &&
      heading.text.toLocaleLowerCase() === "decision trail",
  );
  if (sections.length !== 1) {
    errors.push(
      "agent-worklog.md must include exactly one Decision Trail section.",
    );
    return Object.freeze({ errors: Object.freeze(errors), iterations: Object.freeze([]) });
  }

  const section = sections[0];
  const sectionEnd = Math.min(
    getSectionEnd(scan.headings, section),
    scan.lines.length,
  );
  if (
    scan.unclosedFenceLine !== undefined &&
    scan.unclosedFenceLine > section.line &&
    scan.unclosedFenceLine < sectionEnd
  ) {
    errors.push(
      "agent-worklog.md Decision Trail contains an unclosed fenced code block.",
    );
  }
  const headings = scan.headings.filter(
    (heading) =>
      heading.level === 3 &&
      heading.line > section.line &&
      heading.line < sectionEnd,
  );
  const firstHeadingLine = headings[0]?.line ?? sectionEnd;
  if (
    getSanitizedLines(scan, section.line + 1, firstHeadingLine).some(
      (line) => line.trim().length > 0,
    )
  ) {
    errors.push(
      "agent-worklog.md Decision Trail cannot contain content before its first iteration heading.",
    );
  }
  if (headings.length === 0) {
    errors.push(
      "agent-worklog.md Decision Trail must include at least one iteration heading.",
    );
  }

  const seenHeadings = new Set();
  const iterations = headings.flatMap((heading, index) => {
    if (!heading.text) {
      errors.push(
        "agent-worklog.md Decision Trail iteration headings must contain text.",
      );
      return [];
    }
    const canonicalHeading = heading.text.toLocaleLowerCase();
    if (seenHeadings.has(canonicalHeading)) {
      errors.push(
        `agent-worklog.md has duplicate Decision Trail iteration heading "${heading.text}".`,
      );
    }
    seenHeadings.add(canonicalHeading);
    const end = headings[index + 1]?.line ?? sectionEnd;
    return [{
      body: getSanitizedLines(scan, heading.line + 1, end)
        .join("\n")
        .trim(),
      heading: heading.text,
    }];
  });

  return Object.freeze({
    errors: Object.freeze(errors),
    iterations: Object.freeze(iterations),
  });
}

const toRepoTestFile = (file) =>
  file.startsWith("e2e/") ? file : `e2e/${file}`;

export function selectToolcraftCurrentBrowserImpact({
  files,
  model,
  semanticAcceptanceIds,
}) {
  const fileSet = new Set(files);
  const rows = model.acceptance.filter(({ file }) =>
    fileSet.has(toRepoTestFile(file)),
  );
  const exact =
    rows.length > 0 &&
    rows.every(({ acceptanceId }) =>
      semanticAcceptanceIds.has(acceptanceId),
    );
  return Object.freeze({
    acceptanceIds: Object.freeze(
      exact ? rows.map(({ acceptanceId }) => acceptanceId) : [],
    ),
    domainIds: Object.freeze(
      exact ? [] : [...new Set(rows.map(({ domainId }) => domainId))],
    ),
  });
}

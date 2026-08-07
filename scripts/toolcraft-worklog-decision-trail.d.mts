export type ToolcraftDecisionTrailIteration = Readonly<{
  body: string;
  heading: string;
}>;

export declare function getToolcraftMarkdownSectionBodies(
  source: string,
  sectionName: string,
): string[];

export declare function parseToolcraftDecisionTrail(source: string): Readonly<{
  errors: readonly string[];
  iterations: readonly ToolcraftDecisionTrailIteration[];
}>;

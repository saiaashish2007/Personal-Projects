export type SourceKind = "meeting" | "slack";

export type Decision = {
  id: string;
  position: number;
  statement: string;
  owner: string;
  speaker: string;
  rationale: string;
  date: string;
  sourceQuote: string;
  sourceTitle: string;
  sourceKind: SourceKind;
  sourceId: string;
  topic: string;
  commitment: string;
  shortLabel: string;
};

export type Source = {
  id: string;
  title: string;
  kind: SourceKind;
  date: string;
  raw: string;
};

export type IngestRequest = {
  text: string;
  title?: string;
  kind?: SourceKind;
  date?: string;
  sourceId?: string;
};

export type ExtractorName = "claude" | "deterministic";

export type ExtractResult = {
  decisions: Decision[];
  extractor: ExtractorName;
};

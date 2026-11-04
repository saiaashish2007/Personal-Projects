import corpusJson from "../data/northline.json";
import { loadCorpus } from "../lib/corpus";
import { Workspace } from "./workspace";

export default function Page() {
  const corpus = loadCorpus(corpusJson);
  return (
    <Workspace
      company={corpus.company}
      seedDecisions={corpus.decisions}
      seedSources={corpus.sources}
    />
  );
}

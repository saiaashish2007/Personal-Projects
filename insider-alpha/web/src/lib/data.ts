import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ARTIFACT_FILES,
  type ArtifactBundle,
  type ArtifactName,
  type AttributionArtifact,
  type BacktestArtifact,
  type BacktestVariant,
  type ClassifierArtifact,
  type CostsArtifact,
  type DataProfileArtifact,
  type IcArm,
  type IcArtifact,
  type LimitationsArtifact,
  type MetaArtifact,
  type RobustnessArtifact,
  type SignalArm,
} from "./artifacts";

/**
 * Artifacts are read from disk at build time. This module must never be imported from
 * a client component; charts receive already-loaded data as props.
 *
 * `../artifacts` is the source of truth. `./artifacts` is a fallback for hosts that do
 * not expose files above the project root during the build — see web/README.md.
 */
const ARTIFACT_DIRS = [
  join(process.cwd(), "..", "artifacts"),
  join(process.cwd(), "artifacts"),
];

function read<T>(name: ArtifactName): T {
  const file = ARTIFACT_FILES[name];
  for (const dir of ARTIFACT_DIRS) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  }
  throw new Error(
    `Artifact ${file} not found in any of: ${ARTIFACT_DIRS.join(", ")}. ` +
      `Run \`npm run fixtures\` to write placeholders, or \`npm run sync:artifacts\` to copy ` +
      `pipeline output into web/artifacts/.`,
  );
}

let cached: ArtifactBundle | null = null;

export function loadArtifacts(): ArtifactBundle {
  if (cached) return cached;
  cached = {
    meta: read<MetaArtifact>("meta"),
    data_profile: read<DataProfileArtifact>("data_profile"),
    classifier: read<ClassifierArtifact>("classifier"),
    ic: read<IcArtifact>("ic"),
    backtest: read<BacktestArtifact>("backtest"),
    costs: read<CostsArtifact>("costs"),
    attribution: read<AttributionArtifact>("attribution"),
    robustness: read<RobustnessArtifact>("robustness"),
    limitations: read<LimitationsArtifact>("limitations"),
  };
  return cached;
}

/** True if any artifact on the site is fabricated, which drives the global banner. */
export function anyPlaceholder(bundle: ArtifactBundle = loadArtifacts()): boolean {
  return Object.values(bundle).some((a) => a.data_status === "placeholder");
}

export function getArm(ic: IcArtifact, arm: SignalArm): IcArm {
  const found = ic.arms.find((a) => a.arm === arm);
  if (!found) {
    throw new Error(
      `ic.json is missing the "${arm}" arm. Both arms are required: the filter-on vs. ` +
        `filter-off comparison is the headline result and the dashboard will not render without it.`,
    );
  }
  return found;
}

export function getVariant(backtest: BacktestArtifact, id: string): BacktestVariant {
  const found = backtest.variants.find((v) => v.id === id);
  if (!found) {
    throw new Error(`backtest.json has no variant with id "${id}".`);
  }
  return found;
}

export function primaryVariant(backtest: BacktestArtifact): BacktestVariant {
  return getVariant(backtest, backtest.primary_variant_id);
}

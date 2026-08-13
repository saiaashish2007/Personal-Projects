/**
 * Validates every file in artifacts/ against its JSON Schema. Run from either side of
 * the contract: the dashboard runs it before building, and the Python pipeline can
 * shell out to it (or use jsonschema against the same files in artifacts/schema/).
 *
 * Run: npm run validate
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMAS = join(HERE, "..", "..", "artifacts", "schema");
// Mirrors the loader: repo-level artifacts first, then the in-project copy used on hosts
// that cannot read above the project root.
const ARTIFACTS = [join(HERE, "..", "..", "artifacts"), join(HERE, "..", "artifacts")].find((dir) =>
  existsSync(join(dir, "meta.json")),
);

if (!ARTIFACTS) {
  console.error("No artifacts found. Run `npm run fixtures` first.");
  process.exit(1);
}

if (!existsSync(SCHEMAS)) {
  console.warn("No schema directory found; skipping validation.");
  process.exit(0);
}

const NAMES = [
  "meta",
  "data_profile",
  "classifier",
  "ic",
  "backtest",
  "costs",
  "attribution",
  "robustness",
  "limitations",
];

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

let failed = false;

for (const name of NAMES) {
  const dataPath = join(ARTIFACTS, `${name}.json`);
  const schemaPath = join(SCHEMAS, `${name}.schema.json`);
  if (!existsSync(dataPath)) {
    console.error(`MISSING  ${name}.json`);
    failed = true;
    continue;
  }
  const data = JSON.parse(readFileSync(dataPath, "utf8"));
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const validate = ajv.compile(schema);
  if (validate(data)) {
    console.log(`ok       ${name}.json  [${data.data_status}]`);
  } else {
    failed = true;
    console.error(`INVALID  ${name}.json`);
    for (const err of validate.errors ?? []) {
      console.error(`         ${err.instancePath || "/"} ${err.message}`);
    }
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("\nAll artifacts valid.");
}

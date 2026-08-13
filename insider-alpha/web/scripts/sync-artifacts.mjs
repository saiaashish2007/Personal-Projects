/**
 * Copies ../artifacts/*.json into web/artifacts/.
 *
 * Only needed when the build host cannot read files above the project root — the usual
 * case being a Vercel project whose root directory is `insider-alpha/web` without
 * "Include source files outside of the Root Directory" enabled. The copy is gitignored
 * by default; commit it only if that setting is unavailable.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, "..", "..", "artifacts");
const DEST = join(HERE, "..", "artifacts");

if (!existsSync(SOURCE)) {
  const destHasJson =
    existsSync(DEST) && readdirSync(DEST).some((file) => file.endsWith(".json"));
  if (destHasJson) {
    console.log(`No ${SOURCE}; using committed copy in web/artifacts/.`);
    process.exit(0);
  }
  console.error(`No artifacts directory at ${SOURCE}.`);
  process.exit(1);
}

mkdirSync(DEST, { recursive: true });

let copied = 0;
for (const file of readdirSync(SOURCE)) {
  if (!file.endsWith(".json")) continue;
  copyFileSync(join(SOURCE, file), join(DEST, file));
  copied += 1;
}

console.log(`Copied ${copied} artifacts to web/artifacts/.`);

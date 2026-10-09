/**
 * Next's `output: "standalone"` traces only the server code into
 * .next/standalone. It deliberately does NOT copy `public/` or `.next/static`.
 *
 * That is fine inside the Docker image, where the Dockerfile copies them — but it
 * means running `node .next/standalone/server.js` by hand silently serves a 404
 * for /loudmetric.js. The tracker is the single most important file in the
 * repository, and a dashboard that looks fine while its tracker 404s is the worst
 * possible failure: you would debug your own site before suspecting the build.
 *
 * So this runs after every build and makes the output genuinely self-contained.
 * Set NEXT_STANDALONE_COPY=0 if your deploy pipeline already does this and you
 * would rather not pay the copy twice.
 */
import { cp, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

if (process.env.NEXT_STANDALONE_COPY === "0") {
  console.log("[finalize] skipped (NEXT_STANDALONE_COPY=0)");
  process.exit(0);
}

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error("[finalize] .next/standalone not found — did the build run?");
  process.exit(1);
}

const copies = [
  ["public", path.join(standalone, "public")],
  [".next/static", path.join(standalone, ".next", "static")],
];

for (const [from, to] of copies) {
  const src = path.join(root, from);
  if (!existsSync(src)) {
    console.warn(`[finalize] ${from} missing, skipped`);
    continue;
  }
  await mkdir(path.dirname(to), { recursive: true });
  await cp(src, to, { recursive: true });
  const size = (await stat(to)).isDirectory() ? "" : "";
  console.log(`[finalize] ${from} -> ${path.relative(root, to)} ${size}`);
}

console.log("[finalize] standalone output is self-contained");

import { cp, mkdir } from "node:fs/promises";
await mkdir(".next/standalone/.next", { recursive: true });
await cp(".next/static", ".next/standalone/.next/static", {
  recursive: true,
  force: true,
});
await cp("public", ".next/standalone/public", { recursive: true, force: true });
console.log(
  "Prepared standalone server with public assets and client bundles. Private runtime storage and environment files are excluded.",
);

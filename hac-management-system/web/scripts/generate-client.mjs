// Version-pinned official Prisma in-process APIs avoid the CLI's eager native-engine
// download. This generates the same real driver-adapter client without using a native
// migration engine; npm integrity checks remain enabled for every dependency.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { getDMMF, getGenerators } = require("@prisma/internals");
const { PrismaClientJsGenerator } = require("@prisma/client-generator-js");
const schemaPath = resolve("prisma/schema.prisma");
const schema = await readFile(schemaPath, "utf8");
const dmmf = await getDMMF({ datamodel: schema });
const generators = await getGenerators({
  schemaPath,
  skipDownload: true,
  cliCommand: "prisma",
  registry: {
    "prisma-client-js": {
      type: "in-process",
      generator: new PrismaClientJsGenerator({
        cliCommand: "prisma",
        runtimePath: resolve("node_modules/@prisma/client/runtime"),
      }),
    },
  },
});
try {
  for (const generator of generators) await generator.generate();
} finally {
  for (const generator of generators) generator.stop();
}
console.log(
  `Validated ${dmmf.datamodel.models.length} models with official Prisma WASM and generated the real Prisma client.`,
);

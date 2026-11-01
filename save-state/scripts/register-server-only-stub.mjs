import { register } from "node:module";
import Module from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "server-only-hook.mjs")).href);

// tsx compiles TS to CJS by default: also redirect CommonJS requires.
const emptyStub = join(here, "server-only-empty.cjs");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return emptyStub;
  return originalResolve.call(this, request, ...rest);
};

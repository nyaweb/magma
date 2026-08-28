import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "magma-test-"));
process.env.MAGMA_DATA ||= join(root, "data");
process.env.MAGMA_STACKS ||= join(root, "stacks");
mkdirSync(process.env.MAGMA_DATA, { recursive: true });
mkdirSync(process.env.MAGMA_STACKS, { recursive: true });

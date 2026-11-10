import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectPath = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

globalThis.projectDir = projectPath;
globalThis.testDir = path.join(projectPath, 'tests');
globalThis.tmpDir = os.tmpdir();
globalThis.defaultTimeout = 20000;
globalThis.maxTimeout = Math.pow(2, 31) - 1;

#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_url_1 = __importDefault(require("node:url"));
const node_process_1 = __importDefault(require("node:process"));
const node_child_process_1 = __importDefault(require("node:child_process"));
const projectPath = node_path_1.default.dirname(node_path_1.default.dirname(node_url_1.default.fileURLToPath(import.meta.url)));
const platform = node_os_1.default.platform();
/* eslint-disable no-console */
async function main(argv = node_process_1.default.argv) {
    argv = argv.slice(2);
    const tscArgs = [`-p`, node_path_1.default.join(projectPath, 'tsconfig.build.json')];
    console.error('Running tsc:');
    console.error(['tsc', ...tscArgs].join(' '));
    node_child_process_1.default.execFileSync('tsc', tscArgs, {
        stdio: ['inherit', 'inherit', 'inherit'],
        windowsHide: true,
        encoding: 'utf-8',
        shell: platform === 'win32' ? true : false,
    });
    const jestArgs = [...argv];
    console.error('Running jest:');
    console.error(['jest', ...jestArgs].join(' '));
    node_child_process_1.default.execFileSync('jest', jestArgs, {
        env: {
            ...node_process_1.default.env,
            NODE_OPTIONS: '--experimental-vm-modules',
        },
        stdio: ['inherit', 'inherit', 'inherit'],
        windowsHide: true,
        encoding: 'utf-8',
        shell: platform === 'win32' ? true : false,
    });
}
/* eslint-enable no-console */
if (import.meta.url.startsWith('file:')) {
    const modulePath = node_url_1.default.fileURLToPath(import.meta.url);
    if (node_process_1.default.argv[1] === modulePath) {
        void main();
    }
}
//# sourceMappingURL=test.mjs.map
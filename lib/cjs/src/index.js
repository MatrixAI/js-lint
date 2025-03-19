"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
const no_aliased_imports_js_1 = __importDefault(require("./rules/no-aliased-imports.js"));
const recommended_js_1 = __importDefault(require("./configs/recommended.js"));
const plugin = {
    meta: {
        name: "eslint-plugin-matrixai",
        version: "0.0.1",
    },
    rules: {
        'no-aliased-imports': no_aliased_imports_js_1.default
    },
    configs: {
        recommended: recommended_js_1.default
    }
};
Object.assign(plugin.configs, {
    recommended: recommended_js_1.default,
});
exports.default = plugin;
//# sourceMappingURL=index.js.map
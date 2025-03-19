"use strict";
// src/configs/recommended.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    rules: {
        "@matrixai/no-aliased-imports": [
            "error",
            {
                aliases: [{ prefix: "#", target: "src" }],
                includeFolders: ["src"],
                autoFix: false,
            },
        ],
    },
};
//# sourceMappingURL=recommended.js.map
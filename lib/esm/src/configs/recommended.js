// src/configs/recommended.ts
export default {
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
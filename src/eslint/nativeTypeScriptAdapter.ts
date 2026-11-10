import { nativeTypeScriptBackend } from './NativeTypeScriptBackend.js';

// This interface is consumed by the pinned upstream native parser's private module.
function getNativeProjectService(cwd: string) {
  return nativeTypeScriptBackend.getProjectService(cwd);
}

function clearNativeProjectService(): void {
  nativeTypeScriptBackend.clear();
}

export { getNativeProjectService, clearNativeProjectService };

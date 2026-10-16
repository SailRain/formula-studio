// Resolve deployed resources relative to the shared module directory, not the
// host root. The same bundle works at / and at /repository-name/.
export function createResourceResolver(sharedModuleURL) {
  const base = new URL('../', sharedModuleURL);
  return path => new URL(path, base).href;
}

export const resourceURL = createResourceResolver(import.meta.url);

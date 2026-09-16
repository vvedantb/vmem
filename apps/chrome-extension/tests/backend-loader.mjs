export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@vmem/backend") {
    return {
      shortCircuit: true,
      url: new URL("./backend-stub.mjs", import.meta.url).href,
    };
  }
  return nextResolve(specifier, context);
}

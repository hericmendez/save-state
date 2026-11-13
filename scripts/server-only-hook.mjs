/**
 * Node module customization hook for tsx-run ops scripts.
 * Maps the `server-only` boundary marker to an empty module: CLI scripts
 * run exclusively server-side, so the bundler-time guard is vacuous
 * there. Application code is unaffected.
 */
export async function resolve(specifier, context, next) {
  if (specifier === "server-only") {
    return {
      url: "data:text/javascript,export default {};",
      shortCircuit: true,
    };
  }
  return next(specifier, context);
}

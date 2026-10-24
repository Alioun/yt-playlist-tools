declare module "virtual:page-link-svelte" {
  const namespaces: { root: typeof import("svelte"); client: typeof import("svelte/internal/client") }
  export default namespaces
}

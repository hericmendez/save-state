import LoadingScreen from "@/components/RPGUI/LoadingScreen";

/**
 * Shared loading boundary for every authenticated route (`app/(app)/*`).
 *
 * Rendered by the Next.js App Router while a segment's Server Component
 * is loading. Segments with their own `loading.tsx` (dashboard, backlog)
 * keep their specific boundaries; all other authenticated routes
 * (catalog, platforms, lists, settings, ...) fall back to this one.
 *
 * No protected content is rendered here and authentication is untouched:
 * `(app)/layout.tsx` still redirects unauthenticated users before any
 * page content loads.
 */
export default function AppLoading() {
  return (
    <main className="flex flex-col gap-4">
      <LoadingScreen />
    </main>
  );
}

import { Suspense } from "react";
import { ReviewEditorScreen } from "@/features/reviews/review-editor-screen";

export const metadata = {
  title: "Review Editor — Save State",
  description:
    "Editor Markdown independente para reviews: rascunhos locais com salvamento automático.",
};

interface ReviewsEditorPageProps {
  searchParams: Promise<{ draftId?: string; userGameId?: string }>;
}

/**
 * GET /reviews/editor — protected by `app/(app)/layout.tsx` (server-side
 * session; redirects to /login when unauthenticated). Search params are
 * read on the server and passed as plain props; all draft/auth logic runs
 * in the client screen.
 */
export default async function ReviewsEditorPage({
  searchParams,
}: ReviewsEditorPageProps) {
  const params = await searchParams;
  return (
    <Suspense
      fallback={
        <div className="rpgui-container framed-grey" role="status">
          <p>Carregando editor de reviews…</p>
        </div>
      }
    >
      <ReviewEditorScreen
        draftIdParam={params.draftId ?? ""}
        userGameIdParam={params.userGameId ?? ""}
      />
    </Suspense>
  );
}

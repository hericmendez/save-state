/**
 * Isolated development preview of the Activity Feed (E1.75).
 *
 * Mock-only route: deterministic fixtures flow through the REAL
 * `groupActivities()` projection. Nothing here touches the Home, the
 * navigation, any API, MongoDB, or domain services. Not linked from
 * anywhere — open directly during development.
 */

import { groupActivities } from "@/features/activity/grouping";
import {
  ActivityFeed,
  FeedEmpty,
  FeedErrorDemo,
  FeedLoading,
} from "@/features/activity/activity-feed";
import {
  PREVIEW_EVENTS_WITH_LISTS,
  PREVIEW_TIME_ZONE,
} from "@/features/activity/fixtures";

export const dynamic = "force-static";

export default function ActivityPreviewPage() {
  const items = groupActivities(
    PREVIEW_EVENTS_WITH_LISTS,
    { timeZone: PREVIEW_TIME_ZONE },
  );
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <header className="rpgui-container framed-grey p-4">
        <p className="text-xs opacity-70">Preview de desenvolvimento</p>
        <h1 className="font-display text-2xl">Seu Diário</h1>
      </header>

      <ActivityFeed items={items} timeZone={PREVIEW_TIME_ZONE} />

      <hr className="golden" />

      <section aria-label="Estados visuais">
        <h2 className="font-display mb-2 text-lg">Estados (mock)</h2>
        <div className="flex flex-col gap-4">
          <FeedEmpty />
          <FeedLoading />
          <FeedErrorDemo items={items} timeZone={PREVIEW_TIME_ZONE} />
        </div>
      </section>
    </main>
  );
}

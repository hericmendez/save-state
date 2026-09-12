import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { CatalogSearch } from "@/features/atp/catalog-search";

export default async function CatalogPage() {
  try {
    await getCurrentSession();
  } catch {
    redirect("/login?from=/catalog");
  }
  return <CatalogSearch />;
}

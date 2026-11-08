import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import RPGUIButton from "@/components/RPGUI/Button";
import { getCurrentSession } from "@/server/auth/session";
import { findCompanyEntry } from "@/features/catalog/companies/company-directory";
import { COMPANY_DIRECTORY } from "@/features/catalog/companies/company-directory";
import { CatalogSearch } from "@/features/atp/catalog-search";

const ENTRY_ROLE_LABEL = {
  developer: "Desenvolvedora",
  publisher: "Publisher",
} as const;

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  try {
    await getCurrentSession();
  } catch {
    redirect("/login");
  }
  const { companyId } = await params;
  const entry = findCompanyEntry(COMPANY_DIRECTORY, companyId);
  if (!entry) notFound();

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <Link className="mb-3 inline-block" href="/catalog/empresas">
          <RPGUIButton title="← Empresas" />
        </Link>
        <h1 className="font-display text-2xl">{entry.name}</h1>
        <p className="mt-2 text-sm">{ENTRY_ROLE_LABEL[entry.role]}</p>
      </header>
      <CatalogSearch
        initialDeveloper={entry.role === "developer" ? entry.queryValue : undefined}
        initialPublisher={entry.role === "publisher" ? entry.queryValue : undefined}
        initialContextName={`${entry.name} (${ENTRY_ROLE_LABEL[entry.role]})`}
      />
    </div>
  );
}

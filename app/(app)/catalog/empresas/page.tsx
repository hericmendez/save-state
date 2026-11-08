import Link from "next/link";
import { redirect } from "next/navigation";
import RPGUIButton from "@/components/RPGUI/Button";
import { getCurrentSession } from "@/server/auth/session";
import { DirectoryCard } from "@/features/catalog/directory/directory-card";
import {
  COMPANY_DIRECTORY,
  COMPANY_ROLE_FILTERS,
  filterCompaniesByRole,
  type CompanyRoleFilter,
} from "@/features/catalog/companies/company-directory";

const ROLE_LABEL: Record<CompanyRoleFilter, string> = {
  all: "Todas",
  developer: "Desenvolvedoras",
  publisher: "Publishers",
};

const ENTRY_ROLE_LABEL = {
  developer: "Desenvolvedora",
  publisher: "Publisher",
} as const;

function parseRoleFilter(value: string | undefined): CompanyRoleFilter {
  return value === "developer" || value === "publisher" ? value : "all";
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  try {
    await getCurrentSession();
  } catch {
    redirect("/login?from=/catalog/empresas");
  }
  const role = parseRoleFilter((await searchParams).role);
  const entries = filterCompaniesByRole(COMPANY_DIRECTORY, role);

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Buscar por Empresa</h1>
        <p className="mt-2 text-sm">
          Escolha uma empresa para ver seus jogos no catálogo.
        </p>
      </header>
      <nav
        aria-label="Filtrar empresas por função"
        className="flex flex-wrap gap-2"
      >
        {COMPANY_ROLE_FILTERS.map((filter) => (
          <Link
            key={filter}
            href={
              filter === "all"
                ? "/catalog/empresas"
                : `/catalog/empresas?role=${filter}`
            }
            aria-current={role === filter ? "page" : undefined}
          >
            <RPGUIButton
              title={ROLE_LABEL[filter]}
              className={role === filter ? "down" : ""}
            />
          </Link>
        ))}
      </nav>
      {entries.length === 0 ? (
        <p>Nenhuma empresa cadastrada.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <DirectoryCard
              key={entry.id}
              entry={entry}
              href={`/catalog/empresas/${entry.id}`}
              subtitle={ENTRY_ROLE_LABEL[entry.role]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

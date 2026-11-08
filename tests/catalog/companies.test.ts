import { describe, expect, it } from "vitest";
import {
  COMPANY_DIRECTORY,
  filterCompaniesByRole,
  findCompanyEntry,
} from "@/features/catalog/companies/company-directory";

describe("company directory data", () => {
  it("has unique ids and complete entries with an explicit role", () => {
    expect(COMPANY_DIRECTORY.length).toBeGreaterThan(0);
    const ids = COMPANY_DIRECTORY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of COMPANY_DIRECTORY) {
      expect(entry.id.trim()).not.toBe("");
      expect(entry.name.trim()).not.toBe("");
      expect(entry.queryValue.trim()).not.toBe("");
      expect(["developer", "publisher"]).toContain(entry.role);
    }
  });

  it("represents dual-dimension companies as separate role entries", () => {
    const dev = findCompanyEntry(COMPANY_DIRECTORY, "nintendo-dev");
    const pub = findCompanyEntry(COMPANY_DIRECTORY, "nintendo-pub");
    expect(dev?.name).toBe("Nintendo");
    expect(pub?.name).toBe("Nintendo");
    expect(dev?.role).toBe("developer");
    expect(pub?.role).toBe("publisher");
    // Same company, distinct identities and dimensions.
    expect(dev?.id).not.toBe(pub?.id);
  });

  it("returns null for unknown ids (detail page 404)", () => {
    expect(findCompanyEntry(COMPANY_DIRECTORY, "nope")).toBeNull();
  });

  it("filters by role", () => {
    const developers = filterCompaniesByRole(COMPANY_DIRECTORY, "developer");
    const publishers = filterCompaniesByRole(COMPANY_DIRECTORY, "publisher");
    const all = filterCompaniesByRole(COMPANY_DIRECTORY, "all");
    expect(developers.length).toBeGreaterThan(0);
    expect(publishers.length).toBeGreaterThan(0);
    expect(all).toHaveLength(COMPANY_DIRECTORY.length);
    expect(developers.every((entry) => entry.role === "developer")).toBe(true);
    expect(publishers.every((entry) => entry.role === "publisher")).toBe(true);
  });
});

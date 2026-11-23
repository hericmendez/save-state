/**
 * Normalize CSSOM font-family serialization without discarding list semantics.
 * Quoted and unquoted family names are equivalent; commas inside quoted names
 * are part of that family, not list separators.
 */
export function normalizeFontFamilyList(value: string): string[] {
  const families: string[] = [];
  let family = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      family += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      family += character;
      escaped = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        family += character;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
    } else if (character === ",") {
      families.push(normalizeFamilyWhitespace(family));
      family = "";
    } else {
      family += character;
    }
  }

  if (quote) throw new SyntaxError("Unterminated quoted font family");
  families.push(normalizeFamilyWhitespace(family));
  return families;
}

function normalizeFamilyWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

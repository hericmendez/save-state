/** Shared, non-destructive index inspection and provisioning helpers. */

export type DeclaredIndex = [
  Record<string, unknown>,
  Record<string, unknown>?,
];

export interface IndexModelLike {
  modelName: string;
  schema: { indexes(): DeclaredIndex[] };
  collection: {
    listIndexes(): { toArray(): Promise<Array<Record<string, unknown>>> };
    createIndex(
      fields: Record<string, unknown>,
      options?: Record<string, unknown>,
    ): Promise<unknown>;
  };
}

export interface IndexInspection {
  model: string;
  fields: Record<string, unknown>;
  options: Record<string, unknown>;
  status: "present" | "missing" | "incompatible";
  actualOptions?: Record<string, unknown>;
}

const RELEVANT_OPTIONS = [
  "unique",
  "sparse",
  "partialFilterExpression",
  "expireAfterSeconds",
] as const;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function sameIndexKey(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return stableStringify(left) === stableStringify(right);
}

function normalizedOptions(options: Record<string, unknown> = {}) {
  return {
    unique: options.unique === true,
    sparse: options.sparse === true,
    partialFilterExpression: stableValue(
      options.partialFilterExpression ?? null,
    ),
    expireAfterSeconds: options.expireAfterSeconds ?? null,
  };
}

export function relevantIndexOptionsMatch(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): boolean {
  const wanted = normalizedOptions(expected);
  const found = normalizedOptions(actual);
  return RELEVANT_OPTIONS.every((option) =>
    stableStringify(wanted[option]) === stableStringify(found[option]),
  );
}

export function isEnforcedIndex(options: Record<string, unknown>): boolean {
  return (
    options.unique === true ||
    options.sparse === true ||
    options.partialFilterExpression !== undefined ||
    typeof options.expireAfterSeconds === "number"
  );
}

function isNamespaceNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 26
  );
}

/** Only MongoDB's missing-namespace response means an empty index list. */
export async function readIndexesOrEmpty(
  model: IndexModelLike,
): Promise<Array<Record<string, unknown>>> {
  try {
    return await model.collection.listIndexes().toArray();
  } catch (error) {
    if (isNamespaceNotFound(error)) return [];
    throw error;
  }
}

export async function inspectModelIndexes(
  model: IndexModelLike,
): Promise<IndexInspection[]> {
  const actualIndexes = await readIndexesOrEmpty(model);
  return model.schema.indexes().map(([fields, rawOptions = {}]) => {
    const existing = actualIndexes.find((index) =>
      sameIndexKey(
        (index.key ?? {}) as Record<string, unknown>,
        fields,
      ),
    );
    if (!existing) {
      return {
        model: model.modelName,
        fields,
        options: rawOptions,
        status: "missing",
      };
    }
    const actualOptions = existing as Record<string, unknown>;
    return {
      model: model.modelName,
      fields,
      options: rawOptions,
      status: relevantIndexOptionsMatch(rawOptions, actualOptions)
        ? "present"
        : "incompatible",
      actualOptions,
    };
  });
}

/**
 * Explicit create-only bootstrap. A full preflight happens before the first
 * write, so an incompatible existing index prevents any automatic changes.
 * Only absent schema indexes are created; no drop/sync operation is used.
 */
export async function provisionMissingIndexes(
  models: readonly IndexModelLike[],
): Promise<IndexInspection[]> {
  const inspections = await Promise.all(models.map(inspectModelIndexes));
  const conflicts = inspections.flat().filter(
    (inspection) => inspection.status === "incompatible",
  );
  if (conflicts.length > 0) {
    throw new Error(
      `Incompatible existing indexes; resolve manually without automatic drops: ${conflicts
        .map((item) => `${item.model} ${JSON.stringify(item.fields)}`)
        .join(", ")}`,
    );
  }

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    for (const inspection of inspections[modelIndex]) {
      if (inspection.status !== "missing") continue;
      await model.collection.createIndex(
        inspection.fields,
        inspection.options,
      );
    }
  }

  return Promise.all(models.map(inspectModelIndexes)).then((items) =>
    items.flat(),
  );
}

/** Fail-closed production readiness check for integrity-enforced indexes. */
export async function verifyEnforcedModelIndexes(
  models: readonly IndexModelLike[],
): Promise<void> {
  for (const model of models) {
    const inspections = await inspectModelIndexes(model);
    for (const inspection of inspections) {
      if (!isEnforcedIndex(inspection.options)) continue;
      if (inspection.status === "missing") {
        throw new Error(
          `missing enforced index on model "${model.modelName}": ${stableStringify(inspection.fields)}`,
        );
      }
      if (inspection.status === "incompatible") {
        throw new Error(
          `incompatible enforced index on model "${model.modelName}": ${stableStringify(inspection.fields)}`,
        );
      }
    }
  }
}

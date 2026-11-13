import { MONGOOSE_CONNECTION_OPTIONS } from "@/db/mongo-config";

/**
 * Connection-only safeguards for B-01. These options do not change Mongoose's
 * global defaults or affect other connections in the process.
 */
export function indexAuditConnectionOptions(dbName: string) {
  return {
    ...MONGOOSE_CONNECTION_OPTIONS,
    dbName,
    autoCreate: false,
    autoIndex: false,
    autoSearchIndex: false,
  } as const;
}

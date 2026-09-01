import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { parse as parseYamlDoc } from "yaml";
import { z, type ZodType } from "zod";

/** Thrown when raw data fails a check. Names the file, the row, and the reason. */
export class ValidationError extends Error {
  constructor(file: string, rowLabel: string, detail: string) {
    super(`${file}: ${rowLabel}\n${detail}`);
    this.name = "ValidationError";
  }
}

export async function readCsvRows(
  path: string,
): Promise<Record<string, string>[]> {
  const text = await readFile(path, "utf8");
  return parse(text, { columns: true, skip_empty_lines: true, bom: true });
}

export async function readYamlList(path: string): Promise<unknown[]> {
  const doc: unknown = parseYamlDoc(await readFile(path, "utf8"));
  if (!Array.isArray(doc)) {
    throw new ValidationError(path, "document", "expected a YAML sequence");
  }
  return doc;
}

/**
 * Validate every item against `schema`, stopping at the first failure with a
 * ValidationError that points to the offending row.
 */
export function validateAll<T>(
  file: string,
  rows: readonly unknown[],
  schema: ZodType<T>,
  rowLabel: (row: unknown, index: number) => string,
): T[] {
  return rows.map((row, i) => {
    const result = schema.safeParse(row);
    if (!result.success) {
      throw new ValidationError(
        file,
        rowLabel(row, i),
        z.prettifyError(result.error),
      );
    }
    return result.data;
  });
}

/**
 * Assert a key is unique across rows. Throws naming both offending rows the
 * first time a key repeats.
 */
export function assertUnique<T>(
  file: string,
  rows: readonly T[],
  key: (row: T) => string,
  describe: (row: T) => string,
): void {
  const seen = new Map<string, T>();
  for (const row of rows) {
    const k = key(row);
    const prior = seen.get(k);
    if (prior) {
      throw new ValidationError(
        file,
        `duplicate key ${JSON.stringify(k)}`,
        `first:  ${describe(prior)}\nsecond: ${describe(row)}`,
      );
    }
    seen.set(k, row);
  }
}

/** Run a validate step, printing a summary line and failing loudly. */
export async function step(
  label: string,
  fn: () => Promise<string>,
): Promise<void> {
  try {
    console.log(`  ${label}: ${await fn()}`);
  } catch (err) {
    console.error(`  ${label}: FAILED`);
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

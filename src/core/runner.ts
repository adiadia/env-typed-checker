import { EnvDoctorError, type EnvDoctorIssue } from "../errors/EnvDoctorError";
import { normalizeSpec, parseByType } from "../validators/primitives";
import type { EnvDoctorResult, EnvDoctorSchema } from "../types";

export function validateAndParse<TSchema extends EnvDoctorSchema>(
  schema: TSchema,
  env: Record<string, string | undefined>,
): EnvDoctorResult<TSchema> {
  const issues: EnvDoctorIssue[] = [];
  const out: Record<string, unknown> = {};

  for (const [key, schemaValue] of Object.entries(schema)) {
    let spec: ReturnType<typeof normalizeSpec>;

    try {
      spec = normalizeSpec(schemaValue);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      issues.push({ key, kind: "invalid", message: msg });
      continue;
    }

    const raw = env[key];

    // treat undefined or empty string as "missing"
    if (raw === undefined || raw === "") {
      if (spec.defaultValue !== undefined) {
        out[key] = spec.defaultValue;
      } else if (spec.optional) {
        out[key] = undefined;
      } else {
        issues.push({
          key,
          kind: "missing",
          message: "missing required environment variable",
        });
      }
      continue;
    }

    try {
      if (spec.kind === "enum") {
        if (!spec.values.includes(raw)) {
          throw new Error(
            `expected one of [${spec.values.join(", ")}], got "${raw}"`,
          );
        }
        out[key] = raw;
      } else if (spec.kind === "regex") {
        if (!spec.re.test(raw)) {
          throw new Error(`does not match ${spec.display}`);
        }
        out[key] = raw;
      } else {
        // primitives: string/number/boolean/json/url/email
        out[key] = parseByType(spec.kind, raw);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      issues.push({ key, kind: "invalid", message: msg });
    }
  }

  if (issues.length > 0) throw new EnvDoctorError(issues);

  return out as EnvDoctorResult<TSchema>;
}

import type { EnvBaseType, EnvSchemaValue } from "../types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseByType(type: EnvBaseType, raw: string): unknown {
  switch (type) {
    case "string":
      return raw;

    case "number": {
      const n = Number(raw.trim());
      if (!Number.isFinite(n)) throw new Error(`expected number, got "${raw}"`);
      return n;
    }

    case "boolean": {
      const v = raw.trim().toLowerCase();
      if (["true", "1", "yes", "y", "on"].includes(v)) return true;
      if (["false", "0", "no", "n", "off"].includes(v)) return false;
      throw new Error(
        `expected boolean (true/false/1/0/yes/no/on/off), got "${raw}"`,
      );
    }

    case "json": {
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error(`expected json, got "${raw}"`);
      }
    }

    case "url": {
      try {
        new URL(raw);
        return raw;
      } catch {
        throw new Error(`expected url, got "${raw}"`);
      }
    }

    case "email": {
      const s = raw.trim();
      if (!EMAIL_RE.test(s)) {
        throw new Error(`expected email, got "${raw}"`);
      }
      return s;
    }

    default: {
      throw new Error(`unsupported primitive type: ${String(type)}`);
    }
  }
}

function hasOwn(obj: unknown, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Type-check + normalize a default value into the right runtime type.
 * - Allows string defaults for number/boolean (parsed)
 * - Validates url/email defaults
 * - json defaults can be any value
 */
function coerceDefault(kind: EnvBaseType, def: unknown): unknown {
  if (def === undefined) return undefined;

  switch (kind) {
    case "string": {
      if (typeof def !== "string")
        throw new Error(`default for string must be a string`);
      return def;
    }

    case "number": {
      if (typeof def === "number") {
        if (!Number.isFinite(def))
          throw new Error(`default for number must be finite`);
        return def;
      }
      if (typeof def === "string") return parseByType("number", def);
      throw new Error(`default for number must be number or string`);
    }

    case "boolean": {
      if (typeof def === "boolean") return def;
      if (typeof def === "string") return parseByType("boolean", def);
      throw new Error(`default for boolean must be boolean or string`);
    }

    case "json": {
      // allow any JSON-ish value
      return def;
    }

    case "url": {
      if (typeof def !== "string")
        throw new Error(`default for url must be a string`);
      return parseByType("url", def);
    }

    case "email": {
      if (typeof def !== "string")
        throw new Error(`default for email must be a string`);
      return parseByType("email", def);
    }

    /* c8 ignore next */
    default: {
      throw new Error(`unsupported default kind: ${String(kind)}`);
    }
  }
}

/** Normalized spec used by the runner */
export type NormalizedSpec =
  | { kind: EnvBaseType; optional: boolean; defaultValue?: unknown }
  | {
      kind: "enum";
      optional: boolean;
      values: readonly string[];
      defaultValue?: string;
    }
  | {
      kind: "regex";
      optional: boolean;
      re: RegExp;
      display: string;
      defaultValue?: string;
    };

export function normalizeSpec(schemaValue: EnvSchemaValue): NormalizedSpec {
  // --------------------
  // String style: "number?" etc.
  // --------------------
  if (typeof schemaValue === "string") {
    const optional = schemaValue.endsWith("?");
    const base = optional ? schemaValue.slice(0, -1) : schemaValue;

    const allowed: readonly EnvBaseType[] = [
      "string",
      "number",
      "boolean",
      "json",
      "url",
      "email",
    ];

    if (!allowed.includes(base as EnvBaseType)) {
      throw new Error(
        `Unsupported type "${schemaValue}". Supported: string, number, boolean, json, url, email (optional with ?)`,
      );
    }

    return { kind: base as EnvBaseType, optional };
  }

  // --------------------
  // Object style
  // --------------------
  if (
    !schemaValue ||
    typeof schemaValue !== "object" ||
    Array.isArray(schemaValue)
  ) {
    throw new Error("Schema value must be a string or object spec.");
  }

  const t = (schemaValue as any).type;

  // --------------------
  // Primitive object spec: { type: "number", optional?: true, default?: ... }
  // --------------------
  const primitiveAllowed: readonly EnvBaseType[] = [
    "string",
    "number",
    "boolean",
    "json",
    "url",
    "email",
  ];

  if (primitiveAllowed.includes(t)) {
    const optional = !!(schemaValue as any).optional;
    const defaultValue = hasOwn(schemaValue, "default")
      ? coerceDefault(t as EnvBaseType, (schemaValue as any).default)
      : undefined;

    return { kind: t as EnvBaseType, optional, defaultValue };
  }

  // --------------------
  // Enum: { type: "enum", values: [...], optional?: true, default?: "dev" }
  // --------------------
  if (t === "enum") {
    const values = (schemaValue as any).values;
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      !values.every((v: any) => typeof v === "string")
    ) {
      throw new Error(`enum spec requires "values": string[] (non-empty)`);
    }

    const optional = !!(schemaValue as any).optional;

    let defaultValue: string | undefined = undefined;
    if (hasOwn(schemaValue, "default")) {
      const def = (schemaValue as any).default;
      if (typeof def !== "string") {
        throw new Error(`default for enum must be a string`);
      }
      if (!values.includes(def)) {
        throw new Error(
          `default "${def}" must be one of [${values.join(", ")}]`,
        );
      }
      defaultValue = def;
    }

    return { kind: "enum", optional, values, defaultValue };
  }

  // --------------------
  // Regex: { type: "regex", pattern: "...", flags?: "...", optional?: true, default?: "abc" }
  // --------------------
  if (t === "regex") {
    const pattern = (schemaValue as any).pattern;
    const flags = (schemaValue as any).flags;

    if (typeof pattern !== "string" || pattern.length === 0) {
      throw new Error(`regex spec requires "pattern": string`);
    }
    if (flags !== undefined && typeof flags !== "string") {
      throw new Error(`regex spec "flags" must be a string if provided`);
    }

    let re: RegExp;
    try {
      re = new RegExp(pattern, flags);
    } catch (e) {
      throw new Error(`invalid regex: ${String(e)}`);
    }

    const display = `/${pattern}/${flags ?? ""}`;
    const optional = !!(schemaValue as any).optional;

    let defaultValue: string | undefined = undefined;
    if (hasOwn(schemaValue, "default")) {
      const def = (schemaValue as any).default;
      if (typeof def !== "string") {
        throw new Error(`default for regex must be a string`);
      }
      if (!re.test(def)) {
        throw new Error(`default "${def}" does not match ${display}`);
      }
      defaultValue = def;
    }

    return { kind: "regex", optional, re, display, defaultValue };
  }

  throw new Error(
    `Unsupported object spec type "${String(t)}". Supported: primitives (string/number/boolean/json/url/email), enum, regex`,
  );
}

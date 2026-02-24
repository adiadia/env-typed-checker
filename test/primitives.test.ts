import { describe, it, expect } from "vitest";
import { envDoctor } from "../src";
import { EnvDoctorError } from "../src/errors/EnvDoctorError";
import { normalizeSpec, parseByType } from "../src/validators/primitives";

describe("primitives", () => {
  it("boolean parser accepts many true/false forms", () => {
    expect(parseByType("boolean", "true")).toBe(true);
    expect(parseByType("boolean", "1")).toBe(true);
    expect(parseByType("boolean", "yes")).toBe(true);
    expect(parseByType("boolean", "on")).toBe(true);

    expect(parseByType("boolean", "false")).toBe(false);
    expect(parseByType("boolean", "0")).toBe(false);
    expect(parseByType("boolean", "no")).toBe(false);
    expect(parseByType("boolean", "off")).toBe(false);
  });

  it("boolean parser throws on invalid", () => {
    expect(() => parseByType("boolean", "maybe")).toThrow();
  });

  it("json parser throws on invalid json", () => {
    expect(() => parseByType("json", "{")).toThrow(/expected json/i);
  });

  it("url parser throws on invalid url", () => {
    expect(() => parseByType("url", "not-a-url")).toThrow(/expected url/i);
  });

  it("email parser throws on invalid email", () => {
    expect(() => parseByType("email", "abc")).toThrow(/expected email/i);
  });

  it("normalizeSpec rejects unknown primitive", () => {
    expect(() => normalizeSpec("wat" as any)).toThrow(/Unsupported type/i);
  });

  it("normalizeSpec rejects invalid object spec shapes", () => {
    expect(() => normalizeSpec(null as any)).toThrow();
    expect(() => normalizeSpec([] as any)).toThrow();
    expect(() => normalizeSpec({} as any)).toThrow(/Unsupported object spec/i);
  });

  it("normalizeSpec accepts metadata on object specs", () => {
    const p = normalizeSpec({
      type: "string",
      description: "API token",
      example: "token_123",
      secret: true,
    } as any);
    expect(p.kind).toBe("string");
    expect((p as any).description).toBe("API token");
    expect((p as any).example).toBe("token_123");
    expect((p as any).secret).toBe(true);

    const e = normalizeSpec({
      type: "enum",
      values: ["dev", "prod"],
      description: "App mode",
      example: "dev",
      secret: false,
    } as any);
    expect(e.kind).toBe("enum");
    expect((e as any).description).toBe("App mode");
    expect((e as any).example).toBe("dev");
    expect((e as any).secret).toBe(false);
  });

  it("normalizeSpec validates metadata field types", () => {
    expect(() =>
      normalizeSpec({ type: "string", description: 123 } as any),
    ).toThrow(/description/i);
    expect(() => normalizeSpec({ type: "string", example: 123 } as any)).toThrow(
      /example/i,
    );
    expect(() => normalizeSpec({ type: "string", secret: "yes" } as any)).toThrow(
      /secret/i,
    );
  });

  it("normalizeSpec enum requires non-empty string values", () => {
    expect(() => normalizeSpec({ type: "enum", values: [] } as any)).toThrow();
    expect(() =>
      normalizeSpec({ type: "enum", values: [1, 2] } as any),
    ).toThrow();
  });

  it("normalizeSpec regex requires pattern and validates flags", () => {
    expect(() =>
      normalizeSpec({ type: "regex", pattern: "" } as any),
    ).toThrow();
    expect(() =>
      normalizeSpec({ type: "regex", pattern: "a", flags: 123 } as any),
    ).toThrow();
    expect(() =>
      normalizeSpec({ type: "regex", pattern: "[", flags: "" } as any),
    ).toThrow();
  });

  it("runner handles enum/regex invalid values", () => {
    expect(() =>
      envDoctor(
        { NODE_ENV: { type: "enum", values: ["dev", "prod"] as const } },
        { loadDotEnv: false, env: { NODE_ENV: "staging" } },
      ),
    ).toThrow(EnvDoctorError);

    expect(() =>
      envDoctor(
        { SLUG: { type: "regex", pattern: "^[a-z]+$" } },
        { loadDotEnv: false, env: { SLUG: "abc123" } },
      ),
    ).toThrow(EnvDoctorError);
  });

  // -----------------------------
  // ✅ Added tests to hit uncovered branches in primitives.ts
  // -----------------------------

  it("number parser parses and trims", () => {
    expect(parseByType("number", " 3000 ")).toBe(3000);
  });

  it("email parser returns trimmed email on success", () => {
    expect(parseByType("email", "  a@b.com  ")).toBe("a@b.com");
  });

  it("normalizeSpec supports optional string style (number?)", () => {
    const s = normalizeSpec("number?");
    expect(s).toEqual({ kind: "number", optional: true, secret: false });
  });

  it("normalizeSpec primitive object spec: coerces number default (string -> number)", () => {
    const s = normalizeSpec({ type: "number", default: "3000" } as any);
    expect(s.kind).toBe("number");
    expect(s.optional).toBe(false);
    expect((s as any).defaultValue).toBe(3000);
  });

  it("normalizeSpec primitive object spec: rejects non-finite number default", () => {
    expect(() =>
      normalizeSpec({ type: "number", default: Infinity } as any),
    ).toThrow(/finite/i);
  });

  it("normalizeSpec primitive object spec: coerces boolean default (string -> boolean)", () => {
    const s = normalizeSpec({ type: "boolean", default: "yes" } as any);
    expect(s.kind).toBe("boolean");
    expect((s as any).defaultValue).toBe(true);
  });

  it("normalizeSpec primitive object spec: rejects invalid boolean default type", () => {
    expect(() =>
      normalizeSpec({ type: "boolean", default: 123 } as any),
    ).toThrow(/boolean or string/i);
  });

  it("normalizeSpec primitive object spec: validates url/email defaults", () => {
    const u = normalizeSpec({
      type: "url",
      default: "https://example.com",
    } as any);
    expect(u.kind).toBe("url");
    expect((u as any).defaultValue).toBe("https://example.com");

    expect(() =>
      normalizeSpec({ type: "email", default: "not-an-email" } as any),
    ).toThrow(/expected email/i);
  });

  it("normalizeSpec primitive object spec: json default allows any value", () => {
    const j = normalizeSpec({ type: "json", default: { a: 1 } } as any);
    expect(j.kind).toBe("json");
    expect((j as any).defaultValue).toEqual({ a: 1 });
  });

  it("normalizeSpec enum default: validates type and membership", () => {
    const ok = normalizeSpec({
      type: "enum",
      values: ["dev", "prod"],
      default: "dev",
    } as any);

    expect(ok.kind).toBe("enum");
    expect((ok as any).defaultValue).toBe("dev");

    expect(() =>
      normalizeSpec({
        type: "enum",
        values: ["dev", "prod"],
        default: 1,
      } as any),
    ).toThrow(/default for enum must be a string/i);

    expect(() =>
      normalizeSpec({
        type: "enum",
        values: ["dev", "prod"],
        default: "staging",
      } as any),
    ).toThrow(/must be one of/i);
  });

  it("normalizeSpec regex default: validates type and pattern match", () => {
    const ok = normalizeSpec({
      type: "regex",
      pattern: "^[a-z]+$",
      default: "abc",
    } as any);

    expect(ok.kind).toBe("regex");
    expect((ok as any).defaultValue).toBe("abc");

    expect(() =>
      normalizeSpec({
        type: "regex",
        pattern: "^[a-z]+$",
        default: 123,
      } as any),
    ).toThrow(/default for regex must be a string/i);

    expect(() =>
      normalizeSpec({
        type: "regex",
        pattern: "^[a-z]+$",
        default: "abc123",
      } as any),
    ).toThrow(/does not match/i);
  });

  it("normalizeSpec primitive object spec: rejects wrong string default type", () => {
    expect(() => normalizeSpec({ type: "string", default: 1 } as any)).toThrow(
      /default for string must be a string/i,
    );
  });

  it("normalizeSpec number default rejects non-number/non-string (covers line 84)", () => {
    expect(() =>
      normalizeSpec({ type: "number", default: true } as any),
    ).toThrow(/default for number must be number or string/i);

    // (optional) another variant:
    expect(() => normalizeSpec({ type: "number", default: {} } as any)).toThrow(
      /default for number must be number or string/i,
    );
  });

  it("parseByType string returns raw (covers string case)", () => {
    expect(parseByType("string", "hello")).toBe("hello");
  });

  it("parseByType number throws on non-finite", () => {
    expect(() => parseByType("number", "nope")).toThrow(/expected number/i);
  });

  it("parseByType json succeeds for valid json", () => {
    expect(parseByType("json", '{"a":1}')).toEqual({ a: 1 });
  });

  it("parseByType url succeeds for valid url", () => {
    expect(parseByType("url", "https://example.com")).toBe(
      "https://example.com",
    );
  });

  it("parseByType email succeeds and trims", () => {
    expect(parseByType("email", "  a@b.com  ")).toBe("a@b.com");
  });

  it("normalizeSpec primitive object spec without default covers hasOwn=false path", () => {
    const s = normalizeSpec({ type: "number", optional: true } as any);
    expect(s.kind).toBe("number");
    expect((s as any).defaultValue).toBe(undefined);
  });

  it("normalizeSpec primitive default: finite number + boolean (covers coerceDefault success branches)", () => {
    const n = normalizeSpec({ type: "number", default: 1 } as any);
    expect(n.kind).toBe("number");
    expect((n as any).defaultValue).toBe(1);

    const b = normalizeSpec({ type: "boolean", default: false } as any);
    expect(b.kind).toBe("boolean");
    expect((b as any).defaultValue).toBe(false);
  });

  it("normalizeSpec primitive default: explicit default: undefined hits coerceDefault def===undefined branch", () => {
    const s = normalizeSpec({ type: "string", default: undefined } as any);
    expect(s.kind).toBe("string");
    expect((s as any).defaultValue).toBe(undefined);
  });

  it("normalizeSpec url/email default rejects non-string (covers throw branches)", () => {
    expect(() => normalizeSpec({ type: "url", default: 123 } as any)).toThrow();
    expect(() =>
      normalizeSpec({ type: "email", default: 123 } as any),
    ).toThrow();
  });

  it("normalizeSpec enum/regex without default covers no-default branches", () => {
    const e = normalizeSpec({ type: "enum", values: ["dev", "prod"] } as any);
    expect(e.kind).toBe("enum");
    expect((e as any).defaultValue).toBe(undefined);

    const r = normalizeSpec({
      type: "regex",
      pattern: "^[a-z]+$",
      flags: "i",
    } as any);
    expect(r.kind).toBe("regex");
    expect((r as any).defaultValue).toBe(undefined);
  });
  it("parseByType covers unreachable default branch (runtime safety)", () => {
    expect(() => parseByType("wat" as any, "x")).toThrow(
      /unsupported primitive type/i,
    );
  });
});

import { describe, expect, it, afterEach, vi } from "vitest";
import { validateAndParse } from "../src/core/runner";
import { EnvDoctorError } from "../src/errors/EnvDoctorError";
import type { EnvDoctorSchema } from "../src/types";
import * as primitives from "../src/validators/primitives";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runner validateAndParse coverage", () => {
  it("uses defaultValue when env is missing", () => {
    const schema: EnvDoctorSchema = {
      PORT: { type: "number", default: 3000 } as any,
    };

    const cfg = validateAndParse(schema as any, {});
    expect((cfg as any).PORT).toBe(3000);
  });

  it("treats empty string as missing (required fails)", () => {
    expect(() =>
      validateAndParse({ PORT: "number" } as any, { PORT: "" }),
    ).toThrow(EnvDoctorError);
  });

  it("optional missing yields undefined and no error", () => {
    const cfg = validateAndParse({ OPT: "string?" } as any, {});
    expect((cfg as any).OPT).toBe(undefined);
  });

  it("invalid schema value produces EnvDoctorError (normalizeSpec throws Error path)", () => {
    expect(() =>
      validateAndParse({ X: "wat" as any } as any, { X: "1" }),
    ).toThrow(EnvDoctorError);
  });

  it("covers msg=String(e) when normalizeSpec throws non-Error", () => {
    vi.spyOn(primitives, "normalizeSpec").mockImplementation(() => {
      throw "boom";
    });

    try {
      validateAndParse({ X: "string" } as any, { X: "ok" });
      throw new Error("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EnvDoctorError);
      const err = e as EnvDoctorError;
      expect(err.issues[0].message).toBe("boom");
    }
  });

  it("covers msg=String(e) when parseByType throws non-Error", () => {
    vi.spyOn(primitives, "parseByType").mockImplementation(() => {
      throw "boom2";
    });

    try {
      validateAndParse({ X: "string" } as any, { X: "ok" });
      throw new Error("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EnvDoctorError);
      const err = e as EnvDoctorError;
      expect(err.issues[0].message).toBe("boom2");
    }
  });
});

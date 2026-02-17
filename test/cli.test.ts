import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "env-typed-checker-"));
}

function writeJson(filePath: string, data: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function setEnv(key: string, value: string) {
  const prev = process.env[key];
  process.env[key] = value;
  return () => {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  };
}

function tmpFile(name: string, content: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "env-typed-checker-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, "utf8");
  return file;
}

describe("CLI v2", () => {
  it("prints help and returns 0", () => {
    const out: string[] = [];
    const err: string[] = [];

    const code = runCli(["--help"], {
      log: (m) => out.push(m),
      error: (m) => err.push(m),
    });

    expect(code).toBe(0);
    expect(out.join("\n")).toContain("Usage:");
    expect(err.join("\n")).toBe("");
  });

  it("returns code 2 for unknown command (provide schema to reach branch)", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    writeJson(schemaFile, { PORT: "number?" });

    const err: string[] = [];
    const code = runCli(["wat", "--schema", schemaFile], {
      log: () => {},
      error: (m) => err.push(m),
    });

    expect(code).toBe(2);
    expect(err.join("\n")).toContain("Unknown command");
  });

  it("returns code 2 if --schema is missing for check", () => {
    const err: string[] = [];
    const code = runCli(["check"], {
      log: () => {},
      error: (m) => err.push(m),
    });

    expect(code).toBe(2);
    expect(err.join("\n")).toContain("--schema");
  });

  it("supports --schema=<file> and --env-file=<file> syntax (success path)", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const envFile = path.join(dir, ".env.custom");

    writeJson(schemaFile, { PORT: "number" });
    fs.writeFileSync(envFile, "PORT=3000\n", "utf8");

    const out: string[] = [];
    const err: string[] = [];

    const code = runCli(
      ["check", `--schema=${schemaFile}`, `--env-file=${envFile}`],
      { log: (m) => out.push(m), error: (m) => err.push(m) },
    );

    expect(code).toBe(0);
    expect(out.join("\n")).toContain("✅");
    expect(err.join("\n")).toBe("");
  });

  it("supports --env-file <file> (space separated) syntax", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const envFile = path.join(dir, ".env");

    writeJson(schemaFile, { PORT: "number" });
    fs.writeFileSync(envFile, "PORT=3000\n", "utf8");

    const out: string[] = [];
    const err: string[] = [];

    const code = runCli(
      ["check", "--schema", schemaFile, "--env-file", envFile],
      { log: (m) => out.push(m), error: (m) => err.push(m) },
    );

    expect(code).toBe(0);
    expect(out.join("\n")).toContain("✅");
    expect(err.join("\n")).toBe("");
  });

  it("loads default .env when --env-file is not provided", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    writeJson(schemaFile, { PORT: "number" });

    fs.writeFileSync(path.join(dir, ".env"), "PORT=3000\n", "utf8");

    const oldCwd = process.cwd();
    process.chdir(dir);
    try {
      const out: string[] = [];
      const err: string[] = [];
      const code = runCli(["check", "--schema", "env.schema.json"], {
        log: (m) => out.push(m),
        error: (m) => err.push(m),
      });

      expect(code).toBe(0);
      expect(out.join("\n")).toContain("✅");
      expect(err.join("\n")).toBe("");
    } finally {
      process.chdir(oldCwd);
    }
  });

  it("returns code 2 when schema JSON is not an object", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");

    fs.writeFileSync(schemaFile, JSON.stringify(["PORT"], null, 2), "utf8");

    const err: string[] = [];
    const code = runCli(["check", "--schema", schemaFile, "--no-dotenv"], {
      log: () => {},
      error: (m) => err.push(m),
    });

    expect(code).toBe(2);
    expect(err.join("\n")).toContain("Schema must be a JSON object");
  });

  it("returns code 2 when schema file contains invalid JSON", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");

    fs.writeFileSync(schemaFile, "not-json", "utf8");

    const err: string[] = [];
    const code = runCli(["check", "--schema", schemaFile, "--no-dotenv"], {
      log: () => {},
      error: (m) => err.push(m),
    });

    expect(code).toBe(2);

    const msg = err.join("\n");
    expect(
      msg.includes("not valid JSON") || msg.includes("Unexpected token"),
    ).toBe(true);
  });

  it("returns code 2 when schema values are not valid specs", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");

    writeJson(schemaFile, { PORT: 123 });

    const err: string[] = [];
    const code = runCli(["check", "--schema", schemaFile, "--no-dotenv"], {
      log: () => {},
      error: (m) => err.push(m),
    });

    expect(code).toBe(2);
    expect(err.join("\n")).toContain("Invalid schema value");
  });

  it("returns code 1 when validation fails (EnvDoctorError path)", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    writeJson(schemaFile, { PORT: "number" });

    const cleanup = setEnv("PORT", "abc");
    try {
      const err: string[] = [];
      const code = runCli(["check", "--schema", schemaFile, "--no-dotenv"], {
        log: () => {},
        error: (m) => err.push(m),
      });

      expect(code).toBe(1);
      expect(err.join("\n")).toContain("PORT");
    } finally {
      cleanup();
    }
  });

  it("ignores unknown flags", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    writeJson(schemaFile, { PORT: "number?" });

    const code = runCli(
      ["check", "--schema", schemaFile, "--no-dotenv", "--unknown-flag"],
      { log: () => {}, error: () => {} },
    );

    expect(code).toBe(0);
  });

  it("covers enum/regex object specs and =arg forms", () => {
    const schemaPath = tmpFile(
      "env.schema.json",
      JSON.stringify({
        NODE_ENV: { type: "enum", values: ["dev", "prod"] },
        SLUG: { type: "regex", pattern: "^[a-z0-9-]+$", flags: "i" },
        PORT: "number",
      }),
    );

    const envPath = tmpFile(
      ".env.custom",
      "NODE_ENV=dev\nSLUG=my-slug\nPORT=3000\n",
    );

    const out: string[] = [];
    const err: string[] = [];

    const code = runCli(
      ["check", `--schema=${schemaPath}`, `--env-file=${envPath}`],
      { log: (m) => out.push(m), error: (m) => err.push(m) },
    );

    expect(code).toBe(0);
    expect(out.join("\n")).toContain("✅ Environment is valid.");
    expect(err.join("\n")).toBe("");
  });

  it("covers primitive object spec validation in loadSchema()", () => {
    const schemaPath = tmpFile(
      "env.schema.json",
      JSON.stringify({
        PORT: { type: "number", optional: true, default: 3000 },
      }),
    );

    const out: string[] = [];
    const err: string[] = [];

    const code = runCli(["check", `--schema=${schemaPath}`, "--no-dotenv"], {
      log: (m) => out.push(m),
      error: (m) => err.push(m),
    });

    expect(code).toBe(0);
    expect(out.join("\n")).toContain("✅");
    expect(err.join("\n")).toBe("");
  });

  // ---------------- generate command tests ----------------

  it("generate (update mode default) creates .env if missing and writes missing keys", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");

    writeJson(schemaFile, {
      PORT: "number",
      DEBUG: "boolean?",
    });

    const outFile = path.join(dir, ".env");

    const out: string[] = [];
    const err: string[] = [];

    const code = runCli(
      ["generate", "--schema", schemaFile, "--out", outFile],
      { log: (m) => out.push(m), error: (m) => err.push(m) },
    );

    expect(code).toBe(0);
    expect(fs.existsSync(outFile)).toBe(true);

    const contents = fs.readFileSync(outFile, "utf8");
    expect(contents).toContain("PORT=");
    expect(contents).toContain("DEBUG=");
    expect(out.join("\n")).toContain("✅");
    expect(err.join("\n")).toBe("");
  });

  it("covers readEnvFile missing-file branch (update mode reads empty)", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const outFile = path.join(dir, ".env.missing");

    writeJson(schemaFile, { PORT: "number", FOO: "string?" });
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    const code = runCli(
      [
        "generate",
        "--schema",
        schemaFile,
        "--out",
        outFile,
        "--mode",
        "update",
      ],
      { log: () => {}, error: () => {} },
    );

    expect(code).toBe(0);
    const contents = fs.readFileSync(outFile, "utf8");
    expect(contents).toContain("PORT=");
    expect(contents).toContain("FOO=");
  });

  it("generate updates existing .env by appending only missing keys (no overwrite)", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const outFile = path.join(dir, ".env");

    writeJson(schemaFile, {
      PORT: "number",
      NODE_ENV: { type: "enum", values: ["dev", "prod"] },
    });

    fs.writeFileSync(outFile, "PORT=9999\n", "utf8");

    const code = runCli(
      ["generate", "--schema", schemaFile, "--out", outFile, "--comment-types"],
      { log: () => {}, error: () => {} },
    );

    expect(code).toBe(0);
    const contents = fs.readFileSync(outFile, "utf8");
    expect(contents).toContain("PORT=9999");
    expect(contents).toContain("NODE_ENV=");
  });

  it("generate with --mode=create refuses to overwrite existing file", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const outFile = path.join(dir, ".env");

    writeJson(schemaFile, { PORT: "number" });
    fs.writeFileSync(outFile, "PORT=3000\n", "utf8");

    const err: string[] = [];
    const code = runCli(
      ["generate", "--schema", schemaFile, `--out=${outFile}`, "--mode=create"],
      { log: () => {}, error: (m) => err.push(m) },
    );

    expect(code).toBe(2);
    expect(err.join("\n")).toContain("Refusing to overwrite");
  });

  it("generate prints 'nothing to generate' when all keys already exist", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const outFile = path.join(dir, ".env");

    writeJson(schemaFile, { PORT: "number" });
    fs.writeFileSync(outFile, "PORT=3000\n", "utf8");

    const out: string[] = [];
    const code = runCli(
      ["generate", "--schema", schemaFile, "--out", outFile],
      { log: (m) => out.push(m), error: () => {} },
    );

    expect(code).toBe(0);
    expect(out.join("\n")).toContain("Nothing to generate");
  });

  it("generate supports --no-defaults and --mode=update forms (arg parsing coverage)", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const outFile = path.join(dir, ".env.gen");

    writeJson(schemaFile, {
      SLUG: {
        type: "regex",
        pattern: "^[a-z]+$",
        optional: true,
        default: "abc",
      },
    });

    const out: string[] = [];
    const err: string[] = [];

    const code = runCli(
      [
        "generate",
        `--schema=${schemaFile}`,
        `--out=${outFile}`,
        "--mode=update",
        "--no-defaults",
      ],
      { log: (m) => out.push(m), error: (m) => err.push(m) },
    );

    expect(code).toBe(0);
    const contents = fs.readFileSync(outFile, "utf8");
    expect(contents).toContain("SLUG=");
    expect(out.join("\n")).toContain("✅");
    expect(err.join("\n")).toBe("");
  });

  it("covers --mode <invalid> parsing branch (ignored)", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    writeJson(schemaFile, { PORT: "number?" });

    const outFile = path.join(dir, ".env");
    const out: string[] = [];
    const err: string[] = [];

    const code = runCli(
      ["generate", "--schema", schemaFile, "--out", outFile, "--mode", "wat"],
      { log: (m) => out.push(m), error: (m) => err.push(m) },
    );

    expect(code).toBe(0);
    expect(fs.existsSync(outFile)).toBe(true);
  });

  it("covers readEnvFile export-stripping branch", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const outFile = path.join(dir, ".env");

    writeJson(schemaFile, { PORT: "number?", FOO: "string?" });

    fs.writeFileSync(outFile, "export PORT=9999\n", "utf8");

    const code = runCli(
      [
        "generate",
        "--schema",
        schemaFile,
        "--out",
        outFile,
        "--mode",
        "update",
      ],
      { log: () => {}, error: () => {} },
    );

    expect(code).toBe(0);

    const contents = fs.readFileSync(outFile, "utf8");
    expect(contents).toContain("export PORT=9999");

    const plainPortLines = (contents.match(/(^|\n)PORT=/g) ?? []).length;
    expect(plainPortLines).toBe(0);

    expect(contents).toContain("FOO=");
  });

  it("covers defaultToEnvString object default stringify path", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const outFile = path.join(dir, ".env");

    writeJson(schemaFile, {
      X: { type: "json", optional: true, default: { a: 1 } },
    });

    const code = runCli(
      [
        "generate",
        "--schema",
        schemaFile,
        "--out",
        outFile,
        "--mode",
        "create",
      ],
      { log: () => {}, error: () => {} },
    );

    expect(code).toBe(0);

    const contents = fs.readFileSync(outFile, "utf8");
    expect(contents).toContain('X="{\\"a\\":1}"');
  });

  it("covers quoting branch (spaces/#/quotes) and no-comment branch", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const outFile = path.join(dir, ".env");

    writeJson(schemaFile, {
      MSG: { type: "string", optional: true, default: `hello # "world"` },
    });

    const code = runCli(
      [
        "generate",
        "--schema",
        schemaFile,
        "--out",
        outFile,
        "--mode",
        "create",
      ],
      { log: () => {}, error: () => {} },
    );

    expect(code).toBe(0);
    const contents = fs.readFileSync(outFile, "utf8");
    expect(contents).toMatch(/MSG=".*"/);
    expect(contents).toContain(`#`);
  });

  it("covers check path that uses env-file override branch in buildEnv()", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const envFile = path.join(dir, ".env.custom");

    writeJson(schemaFile, { PORT: "number" });

    const cleanup = setEnv("PORT", "1111");
    try {
      fs.writeFileSync(envFile, "PORT=3000\n", "utf8");

      const out: string[] = [];
      const err: string[] = [];

      const code = runCli(
        ["check", "--schema", schemaFile, "--env-file", envFile],
        { log: (m) => out.push(m), error: (m) => err.push(m) },
      );

      expect(code).toBe(0);
      expect(out.join("\n")).toContain("✅");
      expect(err.join("\n")).toBe("");
    } finally {
      cleanup();
    }
  });

  it("covers parseArgs =forms and toggles (schema/out/mode/comment-types/no-defaults)", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const outFile = path.join(dir, ".env.out");

    writeJson(schemaFile, {
      PORT: "number?",
      NODE_ENV: { type: "enum", values: ["dev", "prod"] },
    });

    const code = runCli(
      [
        "generate",
        `--schema=${schemaFile}`,
        `--out=${outFile}`,
        "--mode=update",
        "--no-defaults",
        "--comment-types",
      ],
      { log: () => {}, error: () => {} },
    );

    expect(code).toBe(0);
    const contents = fs.readFileSync(outFile, "utf8");
    // no-defaults => blank
    expect(contents).toContain("PORT=");
    // comment-types => inline type comment should appear at least once
    expect(contents).toMatch(
      /#\s*(number\??|enum|regex|string|boolean|json|url|email)/,
    );
  });

  it("covers loadSchema object spec validation errors (bad enum/regex/primitive)", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");

    // triggers multiple invalid object paths; first error is enough
    fs.writeFileSync(
      schemaFile,
      JSON.stringify(
        {
          // enum values must be string[]
          NODE_ENV: { type: "enum", values: ["dev", 123] },
        },
        null,
        2,
      ),
      "utf8",
    );

    const err: string[] = [];
    const code = runCli(["check", "--schema", schemaFile, "--no-dotenv"], {
      log: () => {},
      error: (m) => err.push(m),
    });

    expect(code).toBe(2);
    expect(err.join("\n")).toContain("Invalid schema value");
  });

  it("covers loadSchema regex flags type validation branch", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");

    fs.writeFileSync(
      schemaFile,
      JSON.stringify(
        {
          SLUG: { type: "regex", pattern: "^[a-z]+$", flags: 123 },
        },
        null,
        2,
      ),
      "utf8",
    );

    const err: string[] = [];
    const code = runCli(["check", "--schema", schemaFile, "--no-dotenv"], {
      log: () => {},
      error: (m) => err.push(m),
    });

    expect(code).toBe(2);
    expect(err.join("\n")).toContain("Invalid schema value");
  });

  it("covers generate update append prefix branch (file exists => leading newline)", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const outFile = path.join(dir, ".env");

    writeJson(schemaFile, { A: "string?", B: "string?" });

    // existing file without trailing newline triggers prefix logic clearly
    fs.writeFileSync(outFile, "A=1", "utf8");

    const code = runCli(
      [
        "generate",
        "--schema",
        schemaFile,
        "--out",
        outFile,
        "--mode",
        "update",
      ],
      { log: () => {}, error: () => {} },
    );

    expect(code).toBe(0);
    const contents = fs.readFileSync(outFile, "utf8");

    // ensure B appended and there is a newline separation (A=1\nB=)
    expect(contents).toContain("A=1");
    expect(contents).toMatch(/A=1\n\n?B=/); // depending on your prefix logic
  });
  it("generate defaults to out=.env and mode=update when flags omitted (covers outFile?? + mode??)", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");

    writeJson(schemaFile, {
      SAFE: { type: "string", optional: true, default: "abc" },
    });

    const oldCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = runCli(["generate", "--schema", "env.schema.json"], {
        log: () => {},
        error: () => {},
      });

      expect(code).toBe(0);
      const outPath = path.join(dir, ".env");
      expect(fs.existsSync(outPath)).toBe(true);
      expect(fs.readFileSync(outPath, "utf8")).toContain("SAFE=abc");
    } finally {
      process.chdir(oldCwd);
    }
  });

  it("parseArgs covers --mode=<invalid> equals form (hits false branch in --mode= parser)", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const outFile = path.join(dir, ".env");

    writeJson(schemaFile, { A: "string?" });

    const code = runCli(
      ["generate", "--schema", schemaFile, "--out", outFile, "--mode=wat"],
      { log: () => {}, error: () => {} },
    );

    // invalid mode is ignored => defaults to update => creates/updates file
    expect(code).toBe(0);
    expect(fs.existsSync(outFile)).toBe(true);
  });

  it("check with dotenv enabled but missing .env covers buildEnv no-file branch", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");

    // optional so it passes even without .env and without env vars
    writeJson(schemaFile, { PORT: "number?" });

    const oldCwd = process.cwd();
    process.chdir(dir);
    try {
      const out: string[] = [];
      const err: string[] = [];
      const code = runCli(["check", "--schema", "env.schema.json"], {
        log: (m) => out.push(m),
        error: (m) => err.push(m),
      });

      expect(code).toBe(0);
      expect(out.join("\n")).toContain("✅");
      expect(err.join("\n")).toBe("");
    } finally {
      process.chdir(oldCwd);
    }
  });

  it("generate covers needsQuoting for: empty, newline, whitespace, #, double-quote, single-quote, and false(no quote)", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const outFile = path.join(dir, ".env");

    writeJson(schemaFile, {
      // false branch (no quoting)
      SAFE: { type: "string", optional: true, default: "abc" },

      // empty
      EMPTY: { type: "string", optional: true, default: "" },

      // newline (stored as \n in JSON => parsed to newline char)
      NL: { type: "string", optional: true, default: "a\nb" },

      // whitespace
      SPACE: { type: "string", optional: true, default: "a b" },

      // hash
      HASH: { type: "string", optional: true, default: "a#b" },

      // double quote
      DQUOTE: { type: "string", optional: true, default: 'a"b' },

      // single quote
      SQUOTE: { type: "string", optional: true, default: "O'Reilly" },
    });

    const code = runCli(
      [
        "generate",
        "--schema",
        schemaFile,
        "--out",
        outFile,
        "--mode",
        "create",
      ],
      { log: () => {}, error: () => {} },
    );

    expect(code).toBe(0);
    const contents = fs.readFileSync(outFile, "utf8");

    // SAFE should be unquoted
    expect(contents).toContain("SAFE=abc");

    // quoted variants
    expect(contents).toContain('EMPTY=""');
    expect(contents).toContain('SPACE="a b"');
    expect(contents).toContain('HASH="a#b"');
    expect(contents).toContain('SQUOTE="O\'Reilly"');

    // JSON.stringify escapes newline as \n inside the string
    expect(contents).toContain('NL="a\\nb"');

    // JSON.stringify escapes embedded quotes
    expect(contents).toContain('DQUOTE="a\\"b"');
  });

  it("runCli catch covers non-Error thrown branch (String(e)) via mocked normalizeSpec", async () => {
    // Ensure fresh module graph so cli.ts imports see our spy reliably
    await vi.resetModules();

    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const outFile = path.join(dir, ".env");

    writeJson(schemaFile, { X: "string?" });

    const primitives = await import("../src/validators/primitives");
    const spy = vi
      .spyOn(primitives, "normalizeSpec")
      // throw a non-Error value
      .mockImplementation(() => {
        throw "boom";
      });

    const { runCli: runCliFresh } = await import("../src/cli");

    const err: string[] = [];
    const code = runCliFresh(
      ["generate", "--schema", schemaFile, "--out", outFile],
      {
        log: () => {},
        error: (m) => err.push(m),
      },
    );

    expect(code).toBe(2);
    expect(err.join("\n")).toContain("boom");

    spy.mockRestore();
  });

  it("generate covers defaultToEnvString for string + number + boolean + null defaults", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const outFile = path.join(dir, ".env");

    writeJson(schemaFile, {
      DEF_NULL: { type: "json", optional: true, default: null }, // null -> ""
      DEF_STR: { type: "string", optional: true, default: "abc" }, // string branch
      DEF_NUM: { type: "number", optional: true, default: 123 }, // number branch
      DEF_BOOL: { type: "boolean", optional: true, default: true }, // boolean branch
    });

    const code = runCli(
      [
        "generate",
        "--schema",
        schemaFile,
        "--out",
        outFile,
        "--mode",
        "create",
      ],
      { log: () => {}, error: () => {} },
    );

    expect(code).toBe(0);

    const contents = fs.readFileSync(outFile, "utf8");
    expect(contents).toContain('DEF_NULL=""');
    expect(contents).toContain("DEF_STR=abc");
    expect(contents).toContain("DEF_NUM=123");
    expect(contents).toContain("DEF_BOOL=true");
  });

  it("runCli catch uses String(e) when a non-Error is thrown inside try", () => {
    const dir = tmpDir();
    const schemaFile = path.join(dir, "env.schema.json");
    const outFile = path.join(dir, ".env");

    writeJson(schemaFile, { A: "string?" });
    fs.writeFileSync(outFile, "A=1\n", "utf8"); // make file exist

    const err: string[] = [];
    let first = true;

    const code = runCli(
      [
        "generate",
        "--schema",
        schemaFile,
        "--out",
        outFile,
        "--mode",
        "create",
      ],
      {
        log: () => {},
        error: (m) => {
          // First error happens inside runGenerate (refuse overwrite)
          if (first && m.includes("Refusing to overwrite")) {
            first = false;
            throw "boom-non-error"; // <-- non-Error thrown inside try
          }
          // Second error happens in catch block: io.error(String(e))
          err.push(m);
        },
      },
    );

    expect(code).toBe(2);
    expect(err.join("\n")).toContain("boom-non-error");
  });
});

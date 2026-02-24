import fs from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";
import { envDoctor, EnvDoctorError } from "../index";
import { normalizeSpec } from "../validators/primitives";
import type { EnvDoctorSchema, EnvSchemaValue } from "../types";

type Io = {
  log: (msg: string) => void;
  error: (msg: string) => void;
};

type CheckOutputFormat = "pretty" | "json" | "github";

function isCheckOutputFormat(value: unknown): value is CheckOutputFormat {
  return value === "pretty" || value === "json" || value === "github";
}

function parseArgs(argv: string[]) {
  const out: {
    cmd?: string;
    schemaPath?: string;
    envFile?: string;
    checkFormat: CheckOutputFormat;
    invalidCheckFormat?: string;
    useDotenv: boolean;

    // generate options
    outFile?: string;
    mode?: "update" | "create";
    useDefaults: boolean;
    commentTypes: boolean;
    commentDocs: boolean;
    exampleValues: boolean;
  } = {
    checkFormat: "pretty",
    useDotenv: true,
    useDefaults: true,
    commentTypes: false,
    commentDocs: false,
    exampleValues: false,
  };

  const [cmd, ...rest] = argv;
  out.cmd = cmd;

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];

    if (a === "--schema") out.schemaPath = rest[++i];
    else if (a.startsWith("--schema=")) out.schemaPath = a.split("=", 2)[1];
    else if (a === "--env-file") out.envFile = rest[++i];
    else if (a.startsWith("--env-file=")) out.envFile = a.split("=", 2)[1];
    else if (a === "--format") {
      const f = rest[++i];
      if (isCheckOutputFormat(f)) out.checkFormat = f;
      else out.invalidCheckFormat = String(f);
    } else if (a.startsWith("--format=")) {
      const f = a.slice("--format=".length);
      if (isCheckOutputFormat(f)) out.checkFormat = f;
      else out.invalidCheckFormat = f;
    }
    else if (a === "--no-dotenv") out.useDotenv = false;
    // generate flags
    else if (a === "--out") out.outFile = rest[++i];
    else if (a.startsWith("--out=")) out.outFile = a.split("=", 2)[1];
    else if (a === "--mode") {
      const m = rest[++i];
      if (m === "update" || m === "create") out.mode = m;
    } else if (a.startsWith("--mode=")) {
      const m = a.split("=", 2)[1];
      if (m === "update" || m === "create") out.mode = m;
    } else if (a === "--no-defaults") out.useDefaults = false;
    else if (a === "--comment-types") out.commentTypes = true;
    else if (a === "--comment-docs") out.commentDocs = true;
    else if (a === "--example-values") out.exampleValues = true;
  }

  return out;
}

function loadSchema(schemaPath: string): EnvDoctorSchema {
  const abs = path.resolve(process.cwd(), schemaPath);
  const raw = fs.readFileSync(abs, "utf8");

  // Let JSON.parse throw with its native message; CLI catches and prints it
  const json = JSON.parse(raw);

  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("Schema must be a JSON object of key -> spec.");
  }

  // Validate using the same core logic (reduces CLI branch complexity a lot)
  for (const [k, v] of Object.entries(json)) {
    try {
      normalizeSpec(v as EnvSchemaValue);
    } catch (e) {
      throw new Error(`Invalid schema value for "${k}": ${String(e)}`);
    }
  }

  return json as EnvDoctorSchema;
}

function buildEnv(
  useDotenv: boolean,
  envFile?: string,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };

  if (!useDotenv) return env;

  const p = envFile ?? ".env";
  const envAbsPath = path.resolve(process.cwd(), p);

  if (fs.existsSync(envAbsPath)) {
    const fileRaw = fs.readFileSync(envAbsPath, "utf8");
    const parsed = dotenv.parse(fileRaw);
    Object.assign(env, parsed); // env-file overrides shell env
  }

  return env;
}

// -------- generate helpers --------

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  // allow "export KEY=..." lines too
  const raw = fs.readFileSync(filePath, "utf8").replace(/^export\s+/gm, "");
  return dotenv.parse(raw);
}

function getTypeLabel(spec: EnvSchemaValue): string {
  // loadSchema() already validates specs are string or object
  if (typeof spec === "string") return spec;
  return (spec as any).type as string;
}

function defaultToEnvString(x: unknown): string {
  if (x === undefined || x === null) return "";
  if (typeof x === "string") return x;
  if (typeof x === "number" || typeof x === "boolean") return String(x);

  // Schema defaults come from JSON => JSON.stringify won't throw and won't return undefined
  return JSON.stringify(x) as string;
}

function needsQuoting(v: string): boolean {
  if (v === "") return true;
  return /[\s#\n"']/.test(v);
}

function formatEnvLine(key: string, value: string, comment?: string): string {
  const safe = needsQuoting(value) ? JSON.stringify(value) : value;
  return comment ? `${key}=${safe} # ${comment}` : `${key}=${safe}`;
}

function normalizeCommentText(s: string): string {
  return s
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDocCommentLines(description?: string, example?: string): string[] {
  const lines: string[] = [];

  if (typeof description === "string") {
    const d = normalizeCommentText(description);
    if (d) lines.push(`# ${d}`);
  }

  if (typeof example === "string") {
    const ex = normalizeCommentText(example);
    if (ex) lines.push(`# example: ${ex}`);
  }

  return lines;
}

function runGenerate(
  schema: EnvDoctorSchema,
  outPath: string,
  mode: "update" | "create",
  useDefaults: boolean,
  commentTypes: boolean,
  commentDocs: boolean,
  exampleValues: boolean,
  io: Io,
): number {
  const absOut = path.resolve(process.cwd(), outPath);

  if (mode === "create" && fs.existsSync(absOut)) {
    io.error(`Refusing to overwrite existing file: ${outPath}`);
    return 2;
  }

  const existing = mode === "update" ? readEnvFile(absOut) : {};
  const keys = Object.keys(schema).sort();

  const linesToAdd: string[] = [];
  let addedVars = 0;

  for (const key of keys) {
    if (existing[key] !== undefined) continue; // do not overwrite existing values (even empty)

    const spec = schema[key];
    const ns = normalizeSpec(spec);
    const typeLabel = commentTypes ? getTypeLabel(spec) : undefined;

    let val = "";

    if (exampleValues && ns.example !== undefined) {
      val = ns.example;
    } else if (useDefaults) {
      if (ns.defaultValue !== undefined) {
        val = defaultToEnvString(ns.defaultValue);
      }
    }

    if (commentDocs) {
      linesToAdd.push(...getDocCommentLines(ns.description, ns.example));
    }

    linesToAdd.push(formatEnvLine(key, val, typeLabel));
    addedVars++;
  }

  if (addedVars === 0) {
    io.log("✅ No missing variables. Nothing to generate.");
    return 0;
  }

  if (mode === "create") {
    fs.writeFileSync(absOut, linesToAdd.join("\n") + "\n", "utf8");
    io.log(`✅ Created ${outPath} with ${addedVars} variables.`);
    return 0;
  }

  // update mode: append
  const prefix = fs.existsSync(absOut) ? "\n" : "";
  fs.appendFileSync(absOut, prefix + linesToAdd.join("\n") + "\n", "utf8");
  io.log(`✅ Updated ${outPath}. Added ${addedVars} missing variables.`);
  return 0;
}

function redactIssueMessage(message: string): string {
  const sep = ", got ";
  const i = message.indexOf(sep);
  if (i >= 0) {
    return `${message.slice(0, i)}, got "<redacted>"`;
  }
  return `invalid value, got "<redacted>"`;
}

function isSecretKey(schema: EnvDoctorSchema, key: string): boolean {
  const spec = schema[key];
  if (spec === undefined) return false;

  try {
    const ns = normalizeSpec(spec);
    return ns.secret === true;
  } catch {
    return false;
  }
}

function getIssueMessage(
  issue: EnvDoctorError["issues"][number],
  schema: EnvDoctorSchema,
): string {
  const redact = issue.kind === "invalid" && isSecretKey(schema, issue.key);
  return redact ? redactIssueMessage(issue.message) : issue.message;
}

function escapeGithubCommandData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeGithubCommandProperty(value: string): string {
  return escapeGithubCommandData(value)
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

function formatValidationErrorForCli(
  err: EnvDoctorError,
  schema: EnvDoctorSchema,
  format: CheckOutputFormat,
): string[] {
  const issues = err.issues.map((issue) => {
    const message = getIssueMessage(issue, schema);
    return { key: issue.key, kind: issue.kind, message };
  });

  if (format === "github") {
    const title = escapeGithubCommandProperty("ENV validation");
    return issues.map(
      (issue) =>
        `::error title=${title}::${escapeGithubCommandData(`${issue.key}: ${issue.message}`)}`,
    );
  }

  if (format === "json") {
    return [JSON.stringify({ error: "ENV validation failed", issues })];
  }

  const header = "ENV validation failed";
  const lines = issues.map((issue) => `- ${issue.key}: ${issue.message}`);
  return [[header, ...lines].join("\n")];
}

// -------- main --------

export function runCli(argv: string[], io: Io = console): number {
  const {
    cmd,
    schemaPath,
    envFile,
    checkFormat,
    invalidCheckFormat,
    useDotenv,
    outFile,
    mode,
    useDefaults,
    commentTypes,
    commentDocs,
    exampleValues,
  } = parseArgs(argv);

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    io.log(
      [
        "env-typed-checker",
        "",
        "Usage:",
        "  env-typed-checker check --schema <file> [--env-file <file>] [--no-dotenv] [--format pretty|json|github]",
        "  env-typed-checker generate --schema <file> [--out <file>] [--mode update|create] [--no-defaults] [--comment-types] [--comment-docs] [--example-values]",
        "",
        "Options:",
        "  --schema <file>       Path to schema JSON (required)",
        "  --env-file <file>     Env file path (default: .env) [check]",
        "  --no-dotenv           Do not load env file; use process.env only [check]",
        "  --format <name>       check output format: pretty|json|github (default: pretty) [check]",
        "  --out <file>          Output env file (default: .env) [generate]",
        "  --mode update|create  update appends missing keys; create fails if file exists (default: update)",
        "  --no-defaults         do not write schema defaults; write empty placeholders [generate]",
        "  --comment-types       add inline comments with type info [generate]",
        "  --comment-docs        add description/example comments above each key [generate]",
        "  --example-values      use schema example values when generating missing keys [generate]",
        "",
        "Exit codes:",
        "  0 = OK, 1 = validation failed, 2 = CLI error",
      ].join("\n"),
    );
    return 0;
  }

  if (!schemaPath) {
    io.error("Missing required option: --schema <file>");
    return 2;
  }

  if (cmd === "check" && invalidCheckFormat !== undefined) {
    io.error(
      `Invalid value for --format: "${invalidCheckFormat}". Expected: pretty, json, github`,
    );
    return 2;
  }

  try {
    const schema = loadSchema(schemaPath);

    if (cmd === "check") {
      const env = buildEnv(useDotenv, envFile);
      try {
        envDoctor(schema, { loadDotEnv: false, env });
      } catch (e) {
        if (e instanceof EnvDoctorError) {
          for (const line of formatValidationErrorForCli(e, schema, checkFormat)) {
            io.error(line);
          }
          return 1;
        }
        throw e;
      }
      io.log("✅ Environment is valid.");
      return 0;
    }

    if (cmd === "generate") {
      const out = outFile ?? ".env";
      const m = mode ?? "update";
      return runGenerate(
        schema,
        out,
        m,
        useDefaults,
        commentTypes,
        commentDocs,
        exampleValues,
        io,
      );
    }

    io.error(`Unknown command: ${cmd}`);
    return 2;
  } catch (e) {
    io.error(e instanceof Error ? e.message : String(e));
    return 2;
  }
}

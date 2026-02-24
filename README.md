# env-typed-checker

Validate and parse environment variables with a small schema, using either:

- TypeScript/Node API (`envDoctor`)
- CLI (`env-typed-checker check` and `generate`)

This package helps your app fail fast when config is wrong.
This README is the complete guide for installing, configuring, and using the package.

## Why use this

- Catch missing env vars early
- Parse types (`number`, `boolean`, `json`) safely
- Validate `url`, `email`, `enum`, and `regex` values
- Keep one schema for runtime + CI checks
- Generate `.env` / `.env.example` from schema
- Redact secret values in CLI validation output

## Install

```bash
npm install env-typed-checker
```

Or run directly:

```bash
npx env-typed-checker --help
```

Requirements:

- Node.js `>=18`

## Quick start (recommended): one schema for CLI + code

If you are new to this package, start with this pattern.

### 1) Create `env.schema.json`

```json
{
  "PORT": { "type": "number", "default": 3000, "description": "HTTP port", "example": "8080" },
  "DB_URL": { "type": "url", "description": "Primary database URL", "example": "postgres://user:pass@localhost:5432/app", "secret": true },
  "ADMIN_EMAIL": { "type": "email", "description": "Ops contact email", "example": "ops@example.com" },
  "DEBUG": "boolean?",
  "NODE_ENV": { "type": "enum", "values": ["dev", "prod"], "default": "dev" },
  "SLUG": { "type": "regex", "pattern": "^[a-z0-9-]+$", "flags": "i" },
  "FEATURE_FLAGS": { "type": "json", "default": { "beta": false } }
}
```

### 2) Reuse the same schema in app code

ESM (NodeNext / `"type": "module"`):

```ts
// src/config.ts
import { envDoctor, type EnvDoctorSchema } from "env-typed-checker";
import schema from "../env.schema.json" assert { type: "json" };

export const config = envDoctor(schema as EnvDoctorSchema, {
  loadDotEnv: true,
});
```

CommonJS (or TS compiling to CJS):

```ts
// src/config.ts
import { envDoctor, type EnvDoctorSchema } from "env-typed-checker";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const schema = require("../env.schema.json") as EnvDoctorSchema;

export const config = envDoctor(schema, { loadDotEnv: true });
```

TypeScript JSON import note:

```json
{
  "compilerOptions": {
    "resolveJsonModule": true,
    "esModuleInterop": true
  }
}
```

### 3) Validate env via CLI

```bash
npx env-typed-checker check --schema env.schema.json
```

### 4) Generate `.env.example` from the same schema

```bash
npx env-typed-checker generate --schema env.schema.json --out .env.example --comment-docs --example-values
```

Example output:

```env
# HTTP port
# example: 8080
PORT=8080

# Primary database URL
# example: postgres://user:pass@localhost:5432/app
DB_URL=postgres://user:pass@localhost:5432/app
```

### 5) Use in CI (GitHub Actions annotations)

```yml
- name: Validate env
  run: npx env-typed-checker check --schema env.schema.json --format github
```

## API quick reference

```ts
import { envDoctor } from "env-typed-checker";

const config = envDoctor(
  {
    PORT: "number",
    DEBUG: "boolean?",
    NODE_ENV: { type: "enum", values: ["dev", "prod"] },
  },
  {
    loadDotEnv: true,
    env: process.env,
  },
);
```

### Parsed output types

| Schema type | Parsed result |
| :--- | :--- |
| `string` | `string` |
| `number` | `number` |
| `boolean` | `boolean` |
| `json` | `unknown` |
| `url` | `string` |
| `email` | `string` |
| `enum` | one of listed values |
| `regex` | `string` |

## Schema reference

### Primitive shorthand

```json
{
  "PORT": "number",
  "DEBUG": "boolean?",
  "DB_URL": "url"
}
```

- Add `?` to mark optional keys.
- Missing optional keys become `undefined` (unless default exists).

### Object syntax

```json
{
  "PORT": { "type": "number", "default": 3000 },
  "DEBUG": { "type": "boolean", "optional": true },
  "NODE_ENV": { "type": "enum", "values": ["dev", "prod"] },
  "SLUG": { "type": "regex", "pattern": "^[a-z0-9-]+$", "flags": "i" }
}
```

### Defaults

- `number`: number or numeric string
- `boolean`: boolean or boolean-like string
- `url` / `email`: valid strings
- `json`: any JSON-like value

### Metadata fields (object syntax only)

```json
{
  "API_KEY": {
    "type": "string",
    "description": "External service token",
    "example": "sk_test_123",
    "secret": true
  }
}
```

- `description?: string` used by `generate --comment-docs`
- `example?: string` used in comments and optional generation values
- `secret?: boolean` redacts invalid raw values in CLI `check`

If you need metadata for a primitive shorthand key, wrap it in object syntax:

```json
{
  "PORT": { "type": "number", "description": "HTTP port" }
}
```

### Runtime behavior notes

- Empty strings (`""`) are treated as missing values.
- Validation errors are aggregated and returned together.
- CLI `check` merges `.env` values over current shell env when dotenv loading is enabled.

## CLI reference

### `check`

```bash
env-typed-checker check --schema <file> [--env-file <file>] [--no-dotenv] [--format pretty|json|github]
```

Flags:

- `--schema <file>` required schema file
- `--env-file <file>` env file path (default `.env`)
- `--no-dotenv` validate only current `process.env`
- `--format pretty|json|github` output style (default `pretty`)

### `check` output formats

`pretty` (default):

```text
ENV validation failed
- PORT: expected number, got "abc"
```

`json`:

```json
{"error":"ENV validation failed","issues":[{"key":"PORT","kind":"invalid","message":"expected number, got \"abc\""}]}
```

`github` (for workflow annotations):

```text
::error title=ENV validation::PORT: expected number, got "abc"
```

When a key has `secret: true`, CLI output redacts raw invalid values:

```text
SECRET_TOKEN: expected number, got "<redacted>"
```

### `generate`

```bash
env-typed-checker generate --schema <file> [--out <file>] [--mode update|create] [--no-defaults] [--comment-types] [--comment-docs] [--example-values]
```

Defaults:

- output file: `.env`
- mode: `update`
- behavior: append only missing keys

Flags:

- `--out <file>` custom output path
- `--mode create` fail if file already exists
- `--mode update` append missing keys only
- `--no-defaults` write empty values instead of defaults
- `--comment-types` add inline type comments
- `--comment-docs` add `description` and `example` comments above keys
- `--example-values` use schema `example` values as generated values

## Exit codes

- `0` success
- `1` validation failed
- `2` CLI usage error or unexpected error

## CI examples

GitHub Actions with annotations:

```yml
- name: Validate env
  run: npx env-typed-checker check --schema env.schema.json --format github
```

With custom env file:

```yml
- name: Validate env
  run: npx env-typed-checker check --schema env.schema.json --env-file .env.ci --format github
```

## Testing with custom env in code

```ts
import { envDoctor } from "env-typed-checker";

const cfg = envDoctor(
  { PORT: "number" },
  { loadDotEnv: false, env: { PORT: "3000" } },
);

console.log(cfg.PORT); // 3000
```

## Common mistakes

- Missing `--schema` in CLI commands
- Using shorthand string syntax when you need metadata (`description`, `example`, `secret`)
- Forgetting `resolveJsonModule` when importing `env.schema.json` in TypeScript

## Development

```bash
npm install
npm run lint
npm run typecheck
npm run test:coverage
npm run build
```

## License

MIT

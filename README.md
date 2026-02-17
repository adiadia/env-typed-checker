# env-typed-checker 

Validate and parse environment variables using a tiny schema — with both a **TypeScript/Node API** and a **CLI**.

It helps your app fail fast when configuration is wrong:

- ❌ Missing required variables
- ❌ Wrong types (e.g. `PORT="abc"`)
- ❌ Invalid URLs / emails / JSON
- ❌ Values not matching allowed enums or regex patterns
- ✅ Optional values + defaults
- ✅ CLI checks for CI + .env generation


---

## ✨ Features

- Simple schema syntax (`"number"`, `"boolean?"`, `"email"` `"url"`, `"json"`, `"string"`)
- Advanced specs: `enum` and `regex`
- Optional values with `?` and `optional: true`
- Defaults (typed + validated)
- CLI:
  - `check` → validate env
  - `generate` → generate/update `.env` from schema (no overwrite by default)
- Uses `.env` via `dotenv` (optional)
- Friendly aggregated errors (see everything that’s wrong at once)

---

## 📦 Install

```bash
npm install env-typed-checker
```

Or run via npx:

```bash
npx env-typed-checker --help
```

## 🚀 Quick Start (Code)

```ts
import { envDoctor } from "env-typed-checker";

export const config = envDoctor({
  PORT: "number",
  DB_URL: "url",
  ADMIN_EMAIL: "email",
  DEBUG: "boolean?",
});

```

### What you get

* PORT → `number`
* DB_URL → `string` (validated as URL)
* ADMIN_EMAIL → `string` (validated as email)
* DEBUG → `boolean` | `undefined` (optional)


### 🧩 Supported Types
| Type | Description |
| :--- | :--- |
| **string** | Any string value |
| **number** | A finite number (automatically parsed from string) |
| **boolean** | Supports `true` / `false`, `1` / `0`, and `yes` / `no` |
| **json** | Validates and parses a valid JSON string |
| **url** | Validates for a properly formatted URL |
| **email** | Validates for a properly formatted email |


### Optional Values
Add ? to make a variable optional:
```ts
envDoctor({ DEBUG: "boolean?" });
```

Or use object-style:

```ts
envDoctor({
  DEBUG: { type: "boolean", optional: true },
});
```
Missing optional vars become `undefined` unless you provide a default.

### 🎯 Defaults
Defaults can be provided in object-style specs.

```ts
import { envDoctor } from "env-typed-checker";

const config = envDoctor({
  PORT: { type: "number", default: 3000 },
  DEBUG: { type: "boolean", default: "false" }, // string is allowed (parsed)
  NODE_ENV: { type: "enum", values: ["dev", "prod"], default: "dev" },
});
```

### Notes:

- `number` default: number or string (string will be parsed)
- `boolean` default: boolean or string (string will be parsed)
- `url/email` defaults must be strings and must validate
- `json` defaults can be any JSON-like value

### ✅ Enum and Regex

### Enum

```ts
const config = envDoctor({
  NODE_ENV: { type: "enum", values: ["dev", "prod"] },
});
```

### Regex

```ts
const config = envDoctor({
  SLUG: { type: "regex", pattern: "^[a-z0-9-]+$", flags: "i" },
});
```

### ⚙️ Options

```ts
envDoctor(schema, {
  loadDotEnv: true,   // default: true (loads .env)
  env: process.env    // default: process.env (override for tests)
});
```


### 🧪 Testing with custom env

```ts
import { envDoctor } from "env-typed-checker";

const cfg = envDoctor(
  { PORT: "number" },
  { loadDotEnv: false, env: { PORT: "3000" } }
);

console.log(cfg.PORT); // 3000
```

### ❌ Error Example

Given a `.env` like:

```env
PORT=abc
DB_URL=not-a-url
NODE_ENV=staging
```

```ts
import { envDoctor } from "env-typed-checker";

envDoctor({
  PORT: "number",
  DB_URL: "url"
  NODE_ENV: { type: "enum", values: ["dev", "prod"] },
});
```

### Output:

```ts
ENV validation failed
- PORT: expected number, got "abc"
- DB_URL: expected url, got "not-a-url"
- NODE_ENV: must be one of [dev, prod]
```
All errors are shown together so you can fix them in one go.

# 🖥️ CLI

Validate your environment without writing code — perfect for CI pipelines.

## 1) Create a schema file

`env.schema.json`
```json
{
  "PORT": "number",
  "DB_URL": "url",
  "ADMIN_EMAIL": "email",
  "DEBUG": "boolean?",
  "NODE_ENV": { "type": "enum", "values": ["dev", "prod"] },
  "SLUG": { "type": "regex", "pattern": "^[a-z0-9-]+$", "flags": "i" }
}
```

## 2) Run the check

```bash
npx env-typed-checker check --schema env.schema.json
```

Useful flags

```bash
# Use a specific env file (instead of .env)
npx env-typed-checker check --schema env.schema.json --env-file .env.production

# Skip dotenv loading and validate only process.env
npx env-typed-checker check --schema env.schema.json --no-dotenv
```

### `generate` — generate or update `.env`

Generate values from schema (writes missing keys; does not overwrite existing values).

```bash
npx env-typed-checker generate --schema env.schema.json
```
### By default:

- output file: .env
- mode: update

### Flags

```bash
# Custom output file
npx env-typed-checker generate --schema env.schema.json --out .env.example

# Create mode: refuse to overwrite an existing file
npx env-typed-checker generate --schema env.schema.json --out .env --mode=create

# Update mode: append only missing keys (safe)
npx env-typed-checker generate --schema env.schema.json --out .env --mode=update

# Do not write defaults (leave blank values)
npx env-typed-checker generate --schema env.schema.json --no-defaults

# Add inline type comments (useful for .env.example)
npx env-typed-checker generate --schema env.schema.json --comment-types
```

### Exit codes

* `0` = OK
* `1` = validation failed
* `2` = CLI usage / unexpected error

## ✅ CI Example (GitHub Actions)

Add this to your workflow to fail the build if env is invalid:

```yml
- name: Validate env
  run: npx env-typed-checker check --schema env.schema.json
```
If you use a specific env file in CI:

```yml
- name: Validate env
  run: npx env-typed-checker check --schema env.schema.json --env-file .env.ci
```

## 🛠 Development
Clone the repo and install:
```bash
npm install
npm test
```
### Common scripts:
```bash
npm run build      # build package
npm run test       # run tests
npm run typecheck  # TypeScript check
npm run dev        # watch build
```

### 🤝 Contributing
PRs are welcome!

* Improve docs / examples
* Add more schema features
* Improve CLI output formatting
* Add integrations / templates


# 📝 License
MIT


---

```yml
::contentReference[oaicite:0]{index=0}
```
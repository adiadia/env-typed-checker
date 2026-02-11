# env-typed-checker 🩺

A tiny, developer-friendly library to **validate and parse environment variables** using a simple schema.

env-typed-checker prevents your application from starting with:

- ❌ missing environment variables  
- ❌ wrong types (e.g. PORT="abc")  
- ❌ invalid URLs or JSON  
- ❌ silent configuration mistakes  

---

## ✨ Features

- Simple schema syntax  
- Automatic `.env` loading  
- Type parsing (number, boolean, json, url)  
- Optional variables with `?`  
- Friendly aggregated error messages  
- TypeScript support out of the box  
- Zero dependencies except `dotenv`

---

## 📦 Installation

```bash
npm install env-typed-checker
```
### 🚀 Basic Usage

```ts
import { envDoctor } from "env-typed-checker";

export const config = envDoctor({
  PORT: "number",
  DB_URL: "url",
  DEBUG: "boolean?"
});
```
### Result
* **PORT** → `number` (e.g., `"3000"` becomes `3000`)
* **DB_URL** → `string` (validated as a proper URL string)
* **DEBUG** → `boolean | undefined` (optional field; parses `"true"`, `"1"`, etc.)

### 🧩 Supported Types
| Type | Description |
| :--- | :--- |
| **string** | Any string value |
| **number** | A finite number (automatically parsed from string) |
| **boolean** | Supports `true` / `false`, `1` / `0`, and `yes` / `no` |
| **json** | Validates and parses a valid JSON string |
| **url** | Validates for a properly formatted URL |

### Optional Values
Add ? to make a variable optional:
```ts
{ DEBUG: "boolean?" }
```
If missing → value will be undefined.

### ❌ Error Example
Given this .env:
```.env
PORT=abc
DB_URL=not-a-url
Code:
```
```ts
envDoctor({
  PORT: "number",
  DB_URL: "url"
});
```
### Output:

```ts
ENV validation failed
- PORT: expected number, got "abc"
- DB_URL: expected url, got "not-a-url"
```
All errors are shown together so you can fix them in one go.

### ⚙️ Options
```ts
envDoctor(schema, {
  loadDotEnv: true,   // auto load .env (default)
  env: process.env    // custom env source (useful for tests)
});
```
### 🧪 Example with Custom Env (Testing)

```ts
const cfg = envDoctor(
  { PORT: "number" },
  { loadDotEnv: false, env: { PORT: "3000" } }
);

console.log(cfg.PORT); // 3000 (number)
```
### 🛠 Development
Clone the repo and install:
```bash
npm install
```
### Available Scripts
```bash
npm run build      # build package
npm run test       # run tests
npm run typecheck  # TypeScript check
npm run dev        # watch build
```
### 🤝 Contributing
Contributions are welcome!

* Improve error messages
* Add more boolean variants
* Enhance URL validation
* Add JSON schema validation
* Write better docs & examples
* Please read CONTRIBUTING.md before opening a PR.

###  📌 Roadmap
#### v1 (current)
* Schema validation
* Type parsing
* Optional values
* Friendly errors

#### v2 (planned)
* CLI support
* .env.example generator
* Strict unknown variable check
* Framework integrations

# 📝 License
MIT


---

```yml
If you want, I can help you add:

- badges (npm version, CI, coverage)  
- a small logo  
- example project section  

Just tell me 👍
```



#!/usr/bin/env node
"use strict";

const { runCli } = require("../dist/cli/index.js");

const code = runCli(process.argv.slice(2), console);
process.exitCode = typeof code === "number" ? code : 1;

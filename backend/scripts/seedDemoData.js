#!/usr/bin/env node
/**
 * Operator-only demo database seeder for quickcheck_hub_demo.
 *
 * Default: help / dry-run (NO database connection or writes).
 * Mutating run requires ALL of:
 *   - --execute
 *   - --confirm DEMO_SEED_OK
 *   - --admin-email <address>  (Rabeel's real email — never invent it)
 *   - MONGO_URI pointing at database name quickcheck_hub_demo
 *   - password via hidden prompt or DEMO_SEED_PASSWORD env
 *
 * Never drops collections. Never overwrites existing Admin documents.
 * Never uses the project's real academic upload files.
 *
 * Usage:
 *   node scripts/seedDemoData.js
 *   node scripts/seedDemoData.js --dry-run --admin-email admin@example.com --confirm DEMO_SEED_OK
 *   $env:MONGO_URI="mongodb+srv://.../quickcheck_hub_demo"
 *   node scripts/seedDemoData.js --execute --admin-email admin@example.com --confirm DEMO_SEED_OK
 */
const readline = require("readline");
const {
  planDemoSeed,
  executeDemoSeed,
  demoPlan,
  APPROVED_DEMO_DB_NAMES,
} = require("./lib/demoSeedCore");

function printHelp() {
  console.log(
    [
      "QuickCheck Hub — demo database seeder (operator only)",
      "",
      "Approved database name(s): " + [...APPROVED_DEMO_DB_NAMES].join(", "),
      "Default mode is non-mutating (help / dry-run).",
      "This tool NEVER runs on app startup, install, or deploy.",
      "",
      "Dry-run (no database connection):",
      '  node scripts/seedDemoData.js --dry-run --admin-email "you@example.com" --confirm DEMO_SEED_OK',
      "",
      "Execute (requires MONGO_URI with DB name quickcheck_hub_demo):",
      '  $env:MONGO_URI = "mongodb+srv://USER:PASS@CLUSTER/quickcheck_hub_demo"',
      '  node scripts/seedDemoData.js --execute --admin-email "you@example.com" --confirm DEMO_SEED_OK',
      "",
      "Planned fictional demo users (emails are test-only):",
      ...demoPlan().teachers.map((t) => `  - ${t.role || "teacher"}: ${t.name} <${t.email}>`),
      ...demoPlan().students.map((s) => `  - student: ${s.name} <${s.email}>`),
      "",
      "Admin display name is fixed as \"Rabeel Ramzan\"; email must be supplied by the operator.",
      "Password is shared across newly created demo accounts for evaluation convenience.",
      "Existing matching emails are skipped. Collections are never dropped.",
      "",
      "Flags: --help | --dry-run | --execute | --admin-email <email> | --confirm DEMO_SEED_OK",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const out = {
    help: false,
    dryRun: false,
    execute: false,
    adminEmail: "",
    confirm: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--execute") out.execute = true;
    else if (arg === "--admin-email") out.adminEmail = String(argv[++i] || "");
    else if (arg === "--confirm") out.confirm = String(argv[++i] || "");
    else if (arg === "--password" || arg.startsWith("--password=")) {
      throw new Error(
        "Refused: do not pass the password as a CLI argument. Use the hidden prompt or DEMO_SEED_PASSWORD env."
      );
    }
  }
  return out;
}

function promptHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("No TTY for password prompt. Set DEMO_SEED_PASSWORD for non-interactive operators."));
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    let value = "";
    process.stdout.write(question);
    const onData = (char) => {
      const c = String(char);
      if (c === "\n" || c === "\r" || c === "\u0004") {
        stdin.setRawMode?.(false);
        stdin.removeListener("data", onData);
        rl.close();
        process.stdout.write("\n");
        resolve(value);
      } else if (c === "\u0003") {
        stdin.setRawMode?.(false);
        stdin.removeListener("data", onData);
        rl.close();
        reject(new Error("Cancelled."));
      } else if (c === "\u007f" || c === "\b") {
        value = value.slice(0, -1);
      } else {
        value += c;
      }
    };
    stdin.on("data", onData);
  });
}

async function resolvePassword() {
  if (process.env.DEMO_SEED_PASSWORD) return String(process.env.DEMO_SEED_PASSWORD);
  return promptHidden("Demo accounts password (hidden): ");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.dryRun && !args.execute)) {
    printHelp();
    process.exit(0);
  }

  if (args.execute && args.dryRun) {
    console.error("Choose either --dry-run or --execute, not both.");
    process.exit(1);
  }

  let password = "DryRunPassword1!";
  if (args.execute || args.dryRun) {
    try {
      password = args.execute ? await resolvePassword() : password;
      if (args.dryRun && process.env.DEMO_SEED_PASSWORD) {
        password = String(process.env.DEMO_SEED_PASSWORD);
      }
    } catch (error) {
      console.error(error.message || String(error));
      process.exit(1);
    }
  }

  if (args.dryRun) {
    const result = planDemoSeed({
      adminEmail: args.adminEmail,
      password,
      confirmToken: args.confirm,
      mongoUri: process.env.MONGO_URI || "",
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  const mongoUri = String(process.env.MONGO_URI || "").trim();
  if (!mongoUri) {
    console.error("MONGO_URI is required for --execute.");
    process.exit(1);
  }

  // Lazy-load mongoose/models only for execute paths.
  const mongoose = require("mongoose");
  const User = require("../models/User");
  const Assignment = require("../models/Assignment");

  const result = await executeDemoSeed({
    mongoUri,
    adminEmail: args.adminEmail,
    password,
    confirmToken: args.confirm,
    execute: true,
    deps: { mongoose, User, Assignment },
  });

  console.log(JSON.stringify({
    ok: result.ok,
    message: result.message,
    database: result.database,
    created: result.created,
    skipped: result.skipped,
    roles: result.roles,
  }, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || String(error));
    process.exit(1);
  });
}

module.exports = { parseArgs, printHelp };

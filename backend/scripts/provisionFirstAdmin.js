#!/usr/bin/env node
/**
 * Offline first-admin provisioning CLI.
 *
 * Default: help / dry-run only (no database writes).
 * Mutating run requires:
 *   - explicit --execute
 *   - MONGO_URI in the process environment (not printed)
 *   - --name and --email
 *   - password via hidden prompt (or ADMIN_PASSWORD env for non-TTY operators)
 *
 * Never pass the password as a normal CLI argument.
 * Does not load backend/.env automatically (avoids accidental local DB targeting).
 *
 * Usage:
 *   node scripts/provisionFirstAdmin.js
 *   node scripts/provisionFirstAdmin.js --dry-run --name "Admin Name" --email admin@example.com
 *   set MONGO_URI=mongodb+srv://...   (PowerShell: $env:MONGO_URI="...")
 *   node scripts/provisionFirstAdmin.js --execute --name "Admin Name" --email admin@example.com
 */
const readline = require("readline");

const {
  planFirstAdminProvision,
  provisionFirstAdmin,
  FIRST_ADMIN_MIN_PASSWORD_LENGTH,
} = require("./lib/provisionFirstAdminCore");

function printHelp() {
  const lines = [
    "QuickCheck Hub — offline first-admin provisioning",
    "",
    "This tool NEVER runs on app startup, install, or deploy.",
    "It NEVER exposes an HTTP endpoint.",
    "Default mode is non-mutating (help / dry-run).",
    "",
    "Dry-run (no database connection):",
    '  node scripts/provisionFirstAdmin.js --dry-run --name "Full Name" --email admin@example.com',
    "",
    "Execute (requires MONGO_URI in the environment):",
    "  # PowerShell:",
    '  $env:MONGO_URI = "mongodb+srv://USER:PASS@CLUSTER/DB"',
    '  node scripts/provisionFirstAdmin.js --execute --name "Full Name" --email admin@example.com',
    "",
    "Password:",
    "  - Entered via hidden prompt (preferred).",
    "  - Or set ADMIN_PASSWORD in the environment for non-interactive operators.",
    "  - Never pass --password on the command line.",
    `  - Minimum length for first admin: ${FIRST_ADMIN_MIN_PASSWORD_LENGTH} characters.`,
    "",
    "Safeguards:",
    "  - Refuses if any admin already exists.",
    "  - Refuses if the email is already registered.",
    "  - Hashes the password exactly once with the approved auth helper.",
    "  - Does not print passwords, hashes, or connection strings.",
    "",
    "Flags: --help | --dry-run | --execute | --name <text> | --email <text>",
  ];
  console.log(lines.join("\n"));
}

function parseArgs(argv) {
  const out = {
    help: false,
    dryRun: false,
    execute: false,
    name: "",
    email: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--execute") out.execute = true;
    else if (arg === "--name") out.name = String(argv[++i] || "");
    else if (arg === "--email") out.email = String(argv[++i] || "");
    else if (arg === "--password" || arg.startsWith("--password=")) {
      throw new Error(
        "Refused: do not pass the password as a CLI argument. Use the hidden prompt or ADMIN_PASSWORD env."
      );
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }

  return out;
}

function readHiddenPassword(promptText) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(
        new Error(
          "No TTY for hidden password entry. Set ADMIN_PASSWORD in the environment for non-interactive use."
        )
      );
      return;
    }

    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = "";

    stdout.write(promptText);
    stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");

    const onData = (char) => {
      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(value);
        return;
      }
      if (char === "\u0003") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        reject(new Error("Cancelled."));
        return;
      }
      if (char === "\u007f" || char === "\b") {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    };

    stdin.on("data", onData);
  });
}

async function promptPassword() {
  if (process.env.ADMIN_PASSWORD) {
    return String(process.env.ADMIN_PASSWORD);
  }
  return readHiddenPassword("Admin password (hidden): ");
}

async function confirmExecute() {
  if (!process.stdin.isTTY) {
    if (String(process.env.PROVISION_CONFIRM || "").trim() === "CREATE_FIRST_ADMIN") {
      return true;
    }
    throw new Error(
      'Non-interactive execute requires PROVISION_CONFIRM=CREATE_FIRST_ADMIN in the environment.'
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise((resolve) => {
    rl.question(
      'Type CREATE_FIRST_ADMIN to confirm writing one admin user (anything else cancels): ',
      resolve
    );
  });
  rl.close();
  return String(answer || "").trim() === "CREATE_FIRST_ADMIN";
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  if (args.help || (!args.dryRun && !args.execute && !args.name && !args.email)) {
    printHelp();
    return;
  }

  if (args.execute && args.dryRun) {
    console.error("Choose either --dry-run or --execute, not both.");
    process.exitCode = 1;
    return;
  }

  if (!args.name || !args.email) {
    console.error("--name and --email are required for dry-run and execute.");
    process.exitCode = 1;
    return;
  }

  let password;
  try {
    password = await promptPassword();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  if (!args.execute) {
    const plan = planFirstAdminProvision({
      name: args.name,
      email: args.email,
      password,
    });
    if (!plan.ok) {
      console.error(plan.message);
      process.exitCode = 1;
      return;
    }
    console.log(plan.message);
    console.log(
      `Planned admin: name=${plan.planned.name}; email=${plan.planned.email}; role=${plan.planned.role}; passwordLength=${plan.planned.passwordLength}`
    );
    return;
  }

  let confirmed;
  try {
    confirmed = await confirmExecute();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  if (!confirmed) {
    console.error("Cancelled. No database changes were made.");
    process.exitCode = 1;
    return;
  }

  // Lazy-load mongoose/User only for execute so dry-run/help stay light and test-friendly.
  const mongoose = require("mongoose");
  const User = require("../models/User");

  const result = await provisionFirstAdmin({
    mongoUri: process.env.MONGO_URI,
    name: args.name,
    email: args.email,
    password,
    execute: true,
    deps: { mongoose, User },
  });

  if (!result.ok) {
    console.error(result.message);
    process.exitCode = 1;
    return;
  }

  console.log(result.message);
  console.log(
    `Admin id=${result.admin.id}; email=${result.admin.email}; role=${result.admin.role}`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : "Unexpected failure.");
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  printHelp,
  main,
};

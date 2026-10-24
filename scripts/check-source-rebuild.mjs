import { spawnSync } from "node:child_process";
import {
  copyFileSync, lstatSync, mkdirSync, mkdtempSync, openSync,
  closeSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: node scripts/check-source-rebuild.mjs [--keep]\n" +
  "       node scripts/check-source-rebuild.mjs --compare LEFT RIGHT";
const args = process.argv.slice(2);
const compareOnly = args.length === 3 && args[0] === "--compare";
if (args.length === 1 && args[0] === "--help") {
  console.log(usage);
  process.exit(0);
}
if ((!compareOnly && !(args.length === 0 || (args.length === 1 && args[0] === "--keep"))) ||
    process.versions.bun || process.versions.node.split(".")[0] !== "24") {
  console.error(`${usage}\nRequires Node 24. Exit codes: 0 equal, 1 different, 2 usage/runtime, 3 execution failure.`);
  process.exit(2);
}

function files(directory) {
  const result = new Map();
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) result.set(relative(directory, path).split(sep).join("/"), readFileSync(path));
      else throw new Error("Artifact tree must contain only regular files and directories");
    }
  }
  walk(directory);
  if (!result.size) throw new Error("Artifact tree is empty");
  return result;
}

function compare(left, right) {
  const a = files(left);
  const b = files(right);
  const missing = [...a.keys()].filter(path => !b.has(path)).sort();
  const extra = [...b.keys()].filter(path => !a.has(path)).sort();
  const changed = [...a.keys()].filter(path => b.has(path) && !a.get(path).equals(b.get(path))).sort();
  return { equal: !missing.length && !extra.length && !changed.length, files: a.size, missing, extra, changed };
}

let scratch;
try {
  if (compareOnly) {
    const result = compare(resolve(args[1]), resolve(args[2]));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.equal ? 0 : 1;
  } else {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    scratch = mkdtempSync(join(tmpdir(), "ytpt-source-rebuild-"));
    const full = join(scratch, "working-tree");
    const extracted = join(scratch, "extracted-source");
    const home = join(scratch, "home");
    for (const directory of [full, extracted, home]) mkdirSync(directory);
    const env = {
      HOME: home,
      PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`,
      NO_COLOR: "1",
    };
    for (const key of ["TMPDIR", "SystemRoot", "SYSTEMROOT"]) {
      if (process.env[key]) env[key] = process.env[key];
    }
    const commands = [];
    function run(label, cwd, executable, argv) {
      const log = join(scratch, `${label}.log`);
      const fd = openSync(log, "w");
      let result;
      try {
        result = spawnSync(executable, argv, {
          cwd, env, stdio: ["ignore", fd, fd], timeout: 180_000,
        });
      } finally {
        closeSync(fd);
      }
      commands.push({ label, cwd, executable, argv, status: result.status, error: result.error?.code });
      writeFileSync(join(scratch, "commands.json"), JSON.stringify(commands, null, 2) + "\n");
      if (result.error || result.status !== 0) throw new Error(`${label} failed. See ${log}`);
      console.log(`${label}: ok`);
      return readFileSync(log, "utf8").trim();
    }

    const paths = run("source-paths", root, "git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
      .split("\0").filter(Boolean);
    const privateName = name => name.startsWith(".env") ||
      [".npmrc", ".netrc", ".aws", ".ssh", ".gnupg", ".git", "node_modules", ".output", ".wxt"].includes(name);
    for (const path of new Set(paths)) {
      if (path.split("/").some(privateName)) continue;
      const source = resolve(root, path);
      if (!source.startsWith(root + sep)) throw new Error("Source path escapes the checkout");
      const entry = lstatSync(source, { throwIfNoEntry: false });
      if (!entry) continue;
      if (!entry.isFile()) throw new Error("Source snapshot requires regular files");
      const destination = join(full, path);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(source, destination);
    }
    const expectedBun = JSON.parse(readFileSync(join(full, "package.json"), "utf8")).packageManager;
    const bunVersion = run("bun-version", full, "bun", ["--version"]);
    if (`bun@${bunVersion}` !== expectedBun) throw new Error(`Install Bun matching packageManager (${expectedBun})`);
    run("working-tree-install", full, "bun", ["install", "--frozen-lockfile"]);
    const cli = "node_modules/wxt/bin/wxt.mjs";
    run("working-tree-chrome", full, process.execPath, [cli, "build"]);
    run("working-tree-firefox-zip", full, process.execPath, [cli, "zip", "-b", "firefox"]);
    const archives = readdirSync(join(full, ".output")).filter(name => name.endsWith("-sources.zip"));
    if (archives.length !== 1) throw new Error("Expected exactly one WXT source ZIP");
    const archive = join(full, ".output", archives[0]);
    const entries = run("extract-source", scratch, "python3", ["-c", `
import json, pathlib, stat, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    entries = archive.infolist()
    for entry in entries:
        path = pathlib.PurePosixPath(entry.filename)
        if (path.is_absolute() or ".." in path.parts or "\\\\" in entry.filename
            or any(part.startswith(".env") or part in
                   {".npmrc", ".netrc", ".aws", ".ssh", ".gnupg", ".git", "node_modules", ".output", ".wxt"}
                   for part in path.parts)
            or stat.S_ISLNK(entry.external_attr >> 16)):
            raise SystemExit("Unsafe source archive entry")
    archive.extractall(sys.argv[2])
    print(json.dumps(sorted(entry.filename for entry in entries)))
`, archive, extracted]);
    writeFileSync(join(scratch, "archive-paths.json"), entries + "\n");
    run("extracted-source-install", extracted, "bun", ["install", "--frozen-lockfile"]);
    const comparisons = {};
    for (const browser of ["chrome", "firefox"]) {
      run(`extracted-source-${browser}`, extracted, process.execPath, [cli, "build", "-b", browser]);
      comparisons[browser] = compare(join(full, ".output", `${browser}-mv3`), join(extracted, ".output", `${browser}-mv3`));
      console.log(`${browser}: ${comparisons[browser].equal ? "equal" : "DIFFERENT"} (${comparisons[browser].files} files)`);
    }
    writeFileSync(join(scratch, "comparison.json"), JSON.stringify({
      node: process.version, executable: process.execPath, bun: bunVersion, comparisons,
    }, null, 2) + "\n");
    process.exitCode = Object.values(comparisons).every(result => result.equal) ? 0 : 1;
    if (args.includes("--keep") || process.exitCode) console.log(`Evidence: ${scratch}`);
    else rmSync(scratch, { recursive: true, force: true });
  }
} catch (error) {
  console.error(error.message);
  if (scratch) console.error(`Evidence: ${scratch}`);
  process.exitCode = 3;
}

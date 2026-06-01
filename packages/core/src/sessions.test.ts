import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Sessions } from "../src/sessions";
import type { SSOSession } from "../src/types";

const execFileAsync = promisify(execFile);

describe("Sessions", () => {
  let tempDir: string;
  let sessions: ReturnType<typeof Sessions.create>;

  beforeEach(async () => {
    tempDir = path.join(import.meta.dir, ".tmp-sessions-test-" + Date.now());
    await fs.mkdir(tempDir, { recursive: true });
    sessions = Sessions.create({ dir: tempDir });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const sampleSession: SSOSession = {
    name: "my-sso",
    startUrl: "https://my-sso.awsapps.com/start",
    ssoRegion: "us-east-1",
    defaultRegion: "us-east-1",
  };

  describe("save", () => {
    test("writes session to JSON file", async () => {
      await sessions.save(sampleSession);

      const filePath = path.join(tempDir, "my-sso.json");
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain('"name": "my-sso"');
      expect(content).toContain('"startUrl": "https://my-sso.awsapps.com/start"');
    });

    test("creates directory if it doesn't exist", async () => {
      const nestedDir = path.join(tempDir, "nested", "sessions");
      const nestedSessions = Sessions.create({ dir: nestedDir });

      await nestedSessions.save(sampleSession);

      const filePath = path.join(nestedDir, "my-sso.json");
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    test("overwrites existing session", async () => {
      await sessions.save(sampleSession);
      await sessions.save({ ...sampleSession, defaultRegion: "eu-west-1" });

      const loaded = await sessions.load("my-sso");
      expect(loaded?.defaultRegion).toBe("eu-west-1");
    });
  });

  describe("load", () => {
    test("returns undefined for non-existent session", async () => {
      const result = await sessions.load("nonexistent");
      expect(result).toBeUndefined();
    });

    test("loads existing session", async () => {
      await sessions.save(sampleSession);

      const result = await sessions.load("my-sso");
      expect(result).toEqual(sampleSession);
    });
  });

  describe("exists", () => {
    test("returns true for existing session", async () => {
      await sessions.save(sampleSession);
      expect(await sessions.exists("my-sso")).toBe(true);
    });

    test("returns false for non-existent session", async () => {
      expect(await sessions.exists("nonexistent")).toBe(false);
    });
  });

  describe("remove", () => {
    test("removes existing session file", async () => {
      await sessions.save(sampleSession);
      await sessions.remove("my-sso");

      const result = await sessions.load("my-sso");
      expect(result).toBeUndefined();
    });

    test("does nothing if session doesn't exist", async () => {
      await expect(sessions.remove("nonexistent")).resolves.toBeUndefined();
    });
  });

  describe("list", () => {
    test("returns empty array when no sessions", async () => {
      const result = await sessions.list();
      expect(result).toEqual([]);
    });

    test("returns all sessions", async () => {
      await sessions.save({ ...sampleSession, name: "session-a" });
      await sessions.save({ ...sampleSession, name: "session-b" });
      await sessions.save({ ...sampleSession, name: "session-c" });

      const result = await sessions.list();
      expect(result).toHaveLength(3);
      expect(result.map((s) => s.name).sort()).toEqual(["session-a", "session-b", "session-c"]);
    });

    test("ignores non-JSON files", async () => {
      await fs.writeFile(path.join(tempDir, "readme.txt"), "not a session");
      await sessions.save(sampleSession);

      const result = await sessions.list();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("my-sso");
    });

    test("works when consumed from Node runtime", async () => {
      await sessions.save({ ...sampleSession, name: "node-only" });

      const buildDir = path.join(tempDir, "node-build");
      await fs.mkdir(buildDir, { recursive: true });

      const buildResult = await Bun.build({
        entrypoints: [path.join(import.meta.dir, "..", "src", "sessions.ts")],
        outdir: buildDir,
        format: "esm",
        target: "node",
      });

      expect(buildResult.success).toBe(true);

      const bundlePath = path.join(buildDir, "sessions.js");
      const nodeScript = [
        "import { pathToFileURL } from 'node:url'",
        "const { Sessions } = await import(pathToFileURL(process.argv[1]).href)",
        "const sessions = Sessions.create({ dir: process.argv[2] })",
        "const list = await sessions.list()",
        "const count = await sessions.count()",
        "process.stdout.write(JSON.stringify({ names: list.map((x) => x.name).sort(), count }))",
      ].join("; ");

      const { stdout } = await execFileAsync("node", [
        "--input-type=module",
        "--eval",
        nodeScript,
        bundlePath,
        tempDir,
      ]);

      const result = JSON.parse(stdout) as { names: string[]; count: number };
      expect(result.names).toEqual(["node-only"]);
      expect(result.count).toBe(1);
    });
  });

  describe("count", () => {
    test("returns 0 when no sessions", async () => {
      expect(await sessions.count()).toBe(0);
    });

    test("returns correct count", async () => {
      await sessions.save({ ...sampleSession, name: "a" });
      await sessions.save({ ...sampleSession, name: "b" });

      expect(await sessions.count()).toBe(2);
    });
  });
});

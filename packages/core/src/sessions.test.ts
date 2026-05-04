import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import { Sessions } from "../src/sessions";
import type { SSOSession } from "../src/types";

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
      const content = await Bun.file(filePath).text();
      expect(content).toContain('"name": "my-sso"');
      expect(content).toContain('"startUrl": "https://my-sso.awsapps.com/start"');
    });

    test("creates directory if it doesn't exist", async () => {
      const nestedDir = path.join(tempDir, "nested", "sessions");
      const nestedSessions = Sessions.create({ dir: nestedDir });

      await nestedSessions.save(sampleSession);

      const filePath = path.join(nestedDir, "my-sso.json");
      const exists = await Bun.file(filePath).exists();
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
      await Bun.write(path.join(tempDir, "readme.txt"), "not a session");
      await sessions.save(sampleSession);

      const result = await sessions.list();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("my-sso");
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

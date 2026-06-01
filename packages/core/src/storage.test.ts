import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import { Storage } from "../src/storage";

describe("Storage", () => {
  let tempDir: string;
  let storage: ReturnType<typeof Storage.create>;

  beforeEach(async () => {
    tempDir = path.join(import.meta.dir, ".tmp-storage-test-" + Date.now());
    await fs.mkdir(tempDir, { recursive: true });
    storage = Storage.create({ dir: tempDir });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("read", () => {
    test("returns undefined for non-existent key", async () => {
      const result = await storage.read("nonexistent");
      expect(result).toBeUndefined();
    });

    test("reads written data", async () => {
      const data = { foo: "bar", count: 42 };
      await storage.write("test-key", data);

      const result = await storage.read<typeof data>("test-key");
      expect(result).toEqual(data);
    });
  });

  describe("write", () => {
    test("writes JSON file to correct location", async () => {
      await storage.write("my-key", { hello: "world" });

      const filePath = path.join(tempDir, "my-key.json");
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain('"hello": "world"');
    });

    test("creates nested directories", async () => {
      await storage.write("nested/deep/key", { value: 123 });

      const filePath = path.join(tempDir, "nested", "deep", "key.json");
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain('"value": 123');
    });

    test("overwrites existing key", async () => {
      await storage.write("key", { version: 1 });
      await storage.write("key", { version: 2 });

      const result = await storage.read("key");
      expect(result).toEqual({ version: 2 });
    });
  });

  describe("update", () => {
    test("creates new data if key doesn't exist", async () => {
      const result = await storage.update<Record<string, number>>("counter", (existing) => ({
        ...existing,
        count: 1,
      }));

      expect(result).toEqual({ count: 1 });
    });

    test("merges with existing data", async () => {
      await storage.write("prefs", { theme: "dark" });

      const result = await storage.update<{ theme: string; lang?: string }>("prefs", (existing) => ({
        ...existing,
        lang: "en",
      }));

      expect(result).toEqual({ theme: "dark", lang: "en" });
    });

    test("writes updated data to file", async () => {
      await storage.write("data", { a: 1 });

      await storage.update("data", (draft: { a: number; b?: number }) => {
        draft.b = 2;
        return draft;
      });

      const result = await storage.read("data");
      expect(result).toEqual({ a: 1, b: 2 });
    });
  });

  describe("remove", () => {
    test("removes existing key", async () => {
      await storage.write("to-remove", { data: true });
      await storage.remove("to-remove");

      const result = await storage.read("to-remove");
      expect(result).toBeUndefined();
    });

    test("does nothing if key doesn't exist", async () => {
      await expect(storage.remove("nonexistent")).resolves.toBeUndefined();
    });
  });

  describe("list", () => {
    test("returns empty array for non-existent directory", async () => {
      const results = await storage.list("empty-prefix");
      expect(results).toEqual([]);
    });

    test("lists all keys under a prefix", async () => {
      await storage.write("tokens/token-a", { name: "a" });
      await storage.write("tokens/token-b", { name: "b" });
      await storage.write("tokens/token-c", { name: "c" });
      await storage.write("other/data", { name: "other" });

      const results = await storage.list("tokens");
      expect(results).toEqual(["token-a", "token-b", "token-c"]);
    });

    test("returns sorted results", async () => {
      await storage.write("items/zebra", {});
      await storage.write("items/alpha", {});
      await storage.write("items/middle", {});

      const results = await storage.list("items");
      expect(results).toEqual(["alpha", "middle", "zebra"]);
    });
  });

  describe("exists", () => {
    test("returns true for existing key", async () => {
      await storage.write("exists-key", {});
      expect(await storage.exists("exists-key")).toBe(true);
    });

    test("returns false for non-existent key", async () => {
      expect(await storage.exists("missing-key")).toBe(false);
    });
  });
});

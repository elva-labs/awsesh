import { describe, expect, test } from "bun:test";
import { Keybind } from "../cli/cmd/tui/util/keybind";
import type { ParsedKey } from "@opentui/core";

describe("Keybind", () => {
  describe("parse", () => {
    test("parses simple key", () => {
      const result = Keybind.parse("j");
      expect(result).toEqual({ ctrl: false, shift: false, meta: false, leader: false, name: "j" });
    });

    test("parses uppercase as shift", () => {
      const result = Keybind.parse("R");
      expect(result).toEqual({ ctrl: false, shift: true, meta: false, leader: false, name: "r" });
    });

    test("parses ctrl modifier", () => {
      const result = Keybind.parse("ctrl+c");
      expect(result).toEqual({ ctrl: true, shift: false, meta: false, leader: false, name: "c" });
    });

    test("parses leader prefix", () => {
      const result = Keybind.parse("<leader>+k");
      expect(result).toEqual({ ctrl: false, shift: false, meta: false, leader: true, name: "k" });
    });

    test("parses meta modifier", () => {
      const result = Keybind.parse("meta+p");
      expect(result).toEqual({ ctrl: false, shift: false, meta: true, leader: false, name: "p" });
    });

    test("parses cmd as meta", () => {
      const result = Keybind.parse("cmd+d");
      expect(result).toEqual({ ctrl: false, shift: false, meta: true, leader: false, name: "d" });
    });

    test("parses space", () => {
      const result = Keybind.parse("space");
      expect(result).toEqual({ ctrl: false, shift: false, meta: false, leader: false, name: "space" });
    });

    test("parses shift+key explicitly", () => {
      const result = Keybind.parse("shift+tab");
      expect(result).toEqual({ ctrl: false, shift: true, meta: false, leader: false, name: "tab" });
    });

    test("parses multi-modifier combination", () => {
      const result = Keybind.parse("ctrl+shift+k");
      expect(result).toEqual({ ctrl: true, shift: true, meta: false, leader: false, name: "k" });
    });

    test("parses enter key", () => {
      const result = Keybind.parse("enter");
      expect(result).toEqual({ ctrl: false, shift: false, meta: false, leader: false, name: "enter" });
    });

    test("parses escape key", () => {
      const result = Keybind.parse("escape");
      expect(result).toEqual({ ctrl: false, shift: false, meta: false, leader: false, name: "escape" });
    });

    test("case insensitive modifiers", () => {
      const result = Keybind.parse("CTRL+C");
      expect(result.ctrl).toBe(true);
      expect(result.name).toBe("c");
    });
  });

  describe("match", () => {
    test("matches identical keybinds", () => {
      const a = Keybind.parse("ctrl+c");
      const b = Keybind.parse("ctrl+c");
      expect(Keybind.match(a, b)).toBe(true);
    });

    test("does not match different keys", () => {
      const a = Keybind.parse("ctrl+c");
      const b = Keybind.parse("ctrl+d");
      expect(Keybind.match(a, b)).toBe(false);
    });

    test("does not match missing modifier", () => {
      const a = Keybind.parse("ctrl+c");
      const b = Keybind.parse("c");
      expect(Keybind.match(a, b)).toBe(false);
    });

    test("matches leader keybinds", () => {
      const a = Keybind.parse("<leader>+k");
      const b: Keybind.Info = { ctrl: false, shift: false, meta: false, leader: true, name: "k" };
      expect(Keybind.match(a, b)).toBe(true);
    });

    test("does not match when leader differs", () => {
      const a = Keybind.parse("<leader>+k");
      const b = Keybind.parse("k");
      expect(Keybind.match(a, b)).toBe(false);
    });

    test("matches shift key (uppercase)", () => {
      const a = Keybind.parse("R");
      const b = Keybind.parse("R");
      expect(Keybind.match(a, b)).toBe(true);
    });
  });

  describe("format", () => {
    test("formats simple key", () => {
      expect(Keybind.format({ ctrl: false, shift: false, meta: false, leader: false, name: "j" })).toBe("j");
    });

    test("formats ctrl combination", () => {
      expect(Keybind.format({ ctrl: true, shift: false, meta: false, leader: false, name: "c" })).toBe("ctrl+c");
    });

    test("formats uppercase single char with shift", () => {
      expect(Keybind.format({ ctrl: false, shift: true, meta: false, leader: false, name: "r" })).toBe("R");
    });

    test("formats shift+long key name", () => {
      expect(Keybind.format({ ctrl: false, shift: true, meta: false, leader: false, name: "tab" })).toBe("shift+tab");
    });

    test("formats leader keybind", () => {
      expect(Keybind.format({ ctrl: false, shift: false, meta: false, leader: true, name: "k" })).toBe("<leader>+k");
    });

    test("formats meta keybind", () => {
      expect(Keybind.format({ ctrl: false, shift: false, meta: true, leader: false, name: "p" })).toBe("meta+p");
    });

    test("formats space key", () => {
      expect(Keybind.format({ ctrl: false, shift: false, meta: false, leader: false, name: " " })).toBe("space");
    });

    test("formats multi-modifier with shift uppercase", () => {
      expect(Keybind.format({ ctrl: true, shift: true, meta: false, leader: false, name: "k" })).toBe("ctrl+K");
    });

    test("formats multi-modifier with long name", () => {
      expect(Keybind.format({ ctrl: true, shift: true, meta: false, leader: false, name: "tab" })).toBe("ctrl+shift+tab");
    });
  });

  describe("toShortString", () => {
    test("short format for simple key", () => {
      expect(Keybind.toShortString({ ctrl: false, shift: false, meta: false, leader: false, name: "j" })).toBe("j");
    });

    test("short format for ctrl", () => {
      expect(Keybind.toShortString({ ctrl: true, shift: false, meta: false, leader: false, name: "c" })).toBe("C-c");
    });

    test("short format for shift", () => {
      expect(Keybind.toShortString({ ctrl: false, shift: true, meta: false, leader: false, name: "r" })).toBe("S-r");
    });

    test("short format for meta", () => {
      expect(Keybind.toShortString({ ctrl: false, shift: false, meta: true, leader: false, name: "p" })).toBe("M-p");
    });

    test("short format for combo", () => {
      expect(Keybind.toShortString({ ctrl: true, shift: true, meta: true, leader: false, name: "k" })).toBe("C-S-M-k");
    });
  });

  describe("fromParsedKey", () => {
    test("converts ParsedKey to Info", () => {
      const parsed = { name: "c", ctrl: true, shift: false, meta: false } as ParsedKey;
      const result = Keybind.fromParsedKey(parsed);
      expect(result).toEqual({ ctrl: true, shift: false, meta: false, leader: false, name: "c" });
    });

    test("converts space name", () => {
      const parsed = { name: " ", ctrl: false, shift: false, meta: false } as ParsedKey;
      const result = Keybind.fromParsedKey(parsed);
      expect(result.name).toBe("space");
    });

    test("respects leader flag", () => {
      const parsed = { name: "k", ctrl: false, shift: false, meta: false } as ParsedKey;
      const result = Keybind.fromParsedKey(parsed, true);
      expect(result.leader).toBe(true);
    });
  });
});

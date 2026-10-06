import { describe, expect, test } from "bun:test";
import { Config, defaultConfig, type KeybindsConfig } from "./config";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { bundledThemes, loadThemes, mapThemeColors, resolveTheme, type ThemeMode } from "@awsesh/themes";
import { configureAppearance, prepareThemeDirectory } from "../../../desktop/bridge/appearance";

describe("Config", () => {
  describe("getDefaultKeybind", () => {
    test("returns copy of default keybind", () => {
      const result = Config.getDefaultKeybind("quit");
      expect(result).toEqual(["ctrl+c"]);
      expect(result).not.toBe(defaultConfig.keybinds.quit);
    });

    test("returns copy for all key types", () => {
      expect(Config.getDefaultKeybind("back")).toEqual(["escape"]);
      expect(Config.getDefaultKeybind("help")).toEqual(["?"]);
      expect(Config.getDefaultKeybind("filter")).toEqual(["/", "<leader>+f"]);
      expect(Config.getDefaultKeybind("refresh")).toEqual(["R"]);
      expect(Config.getDefaultKeybind("settings")).toEqual([","]);
    });
  });

  describe("isDefaultKeybind", () => {
    test("returns true for default keybind", () => {
      expect(Config.isDefaultKeybind("quit", ["ctrl+c"])).toBe(true);
    });

    test("returns false for non-default keybind", () => {
      expect(Config.isDefaultKeybind("quit", ["q"])).toBe(false);
    });

    test("returns false for different length", () => {
      expect(Config.isDefaultKeybind("quit", ["ctrl+c", "q"])).toBe(false);
    });

    test("returns false for different order", () => {
      expect(Config.isDefaultKeybind("filter", ["<leader>+f", "/"])).toBe(false);
    });
  });

  describe("getDefaults", () => {
    test("returns copy of default config", () => {
      const result = Config.getDefaults();
      expect(result).toEqual(defaultConfig);
      expect(result).not.toBe(defaultConfig);
    });
  });

  describe("getDefaultKeybinds", () => {
    test("returns copy of default keybinds", () => {
      const result = Config.getDefaultKeybinds();
      expect(result).toEqual(defaultConfig.keybinds);
      expect(result).not.toBe(defaultConfig.keybinds);
    });
  });

  describe("defaultConfig", () => {
    test("has expected default values", () => {
      expect(defaultConfig.theme).toBe("system");
      expect(defaultConfig.dateFormat).toBe("dd/mm/yyyy");
      expect(defaultConfig.timeFormat).toBe("24h");
      expect(defaultConfig.autoAssumeRole).toBe(true);
      expect(defaultConfig.cacheAccountDuration).toBe(15);
      expect(defaultConfig.defaultRegion).toBe("us-east-1");
      expect(defaultConfig.mouseEdgeScroll).toBe(false);
    });

    test("has all keybind categories defined", () => {
      const keybinds = defaultConfig.keybinds;
      expect(keybinds.quit).toBeDefined();
      expect(keybinds.back).toBeDefined();
      expect(keybinds.help).toBeDefined();
      expect(keybinds.filter).toBeDefined();
      expect(keybinds.refresh).toBeDefined();
      expect(keybinds.settings).toBeDefined();
      expect(keybinds.browser_open).toBeDefined();
      expect(keybinds.profile_set).toBeDefined();
      expect(keybinds.profile_clear).toBeDefined();
      expect(keybinds.region_set).toBeDefined();
      expect(keybinds.role_list).toBeDefined();
      expect(keybinds.session_add).toBeDefined();
      expect(keybinds.session_edit).toBeDefined();
      expect(keybinds.session_delete).toBeDefined();
      expect(keybinds.credentials).toBeDefined();
      expect(keybinds.session_kill).toBeDefined();
      expect(keybinds.credentials_cleanup).toBeDefined();
      expect(keybinds.nav_up).toBeDefined();
      expect(keybinds.nav_down).toBeDefined();
      expect(keybinds.nav_left).toBeDefined();
      expect(keybinds.nav_right).toBeDefined();
      expect(keybinds.nav_page_up).toBeDefined();
      expect(keybinds.nav_page_down).toBeDefined();
      expect(keybinds.select).toBeDefined();
      expect(keybinds.leader).toBeDefined();
      expect(keybinds.command_list).toBeDefined();
    });
  });

  describe("shared themes", () => {
    test("resolves every bundled theme in both modes and maps rendering colors", () => {
      for (const definition of Object.values(bundledThemes)) {
        const modes: ThemeMode[] = ["light", "dark"];
        for (const mode of modes) {
          const resolved = resolveTheme(definition, mode);
          expect(resolved.background).toMatch(/^#[\da-f]{6}(?:[\da-f]{2})?$/i);
          expect(mapThemeColors(resolved, (color) => color).text).toBe(resolved.text);
          expect(resolved.backgroundMenu).toBeDefined();
        }
      }
    });

    test("validates references, variants, transparency, ANSI values and optional tokens", () => {
      const baseline = resolveTheme(bundledThemes.opencode, "dark");
      const definition = {
        defs: { blue: "#123", alias: "blue" },
        theme: {
          ...baseline,
          primary: { dark: "alias", light: "#fff" },
          secondary: "primary",
          text: 255,
          background: "transparent",
          backgroundMenu: undefined,
          selectedListItemText: undefined,
        },
      };
      const resolved = resolveTheme(definition, "dark");
      expect(resolved.primary).toBe("#112233");
      expect(resolved.secondary).toBe(resolved.primary);
      expect(resolved.text).toBe("#eeeeee");
      expect(resolved.background).toBe("#00000000");
      expect(resolved.backgroundMenu).toBe(resolved.backgroundElement);
      expect(resolved.hasSelectedListItemText).toBe(false);
      expect(resolveTheme(definition, "light").primary).toBe("#ffffff");
      expect(() => resolveTheme({ theme: { ...baseline, primary: "secondary", secondary: "primary" } }, "dark")).toThrow("Circular");
      expect(() => resolveTheme({ theme: { ...baseline, primary: "missing" } }, "dark")).toThrow("not found");
      expect(() => resolveTheme({ theme: { ...baseline, primary: { dark: "#000000" } } }, "light")).toThrow("Theme colors");
      expect(() => resolveTheme({ theme: { ...baseline, primary: 256 } }, "dark")).toThrow("ANSI");
      expect(() => resolveTheme({ theme: { ...baseline, subtleOpacity: 2 } }, "dark")).toThrow("subtleOpacity");
      expect(() => resolveTheme({ theme: { ...baseline, primary: "toString" } }, "dark")).toThrow("not found");
    });

    test("shares custom definitions while keeping desktop and TUI preferences separate", async () => {
      const directory = await mkdtemp(path.join(import.meta.dir, ".tmp-themes-"));
      const config = path.join(directory, "config");
      const data = path.join(directory, "data");
      try {
        expect((await configureAppearance(config, data)).theme).toBe("system");
        const themes = await prepareThemeDirectory(config);
        const example = path.join(themes, "theme.json.example");
        expect(resolveTheme(await Bun.file(example).json(), "light")).toEqual(resolveTheme(bundledThemes.github, "light"));
        expect(resolveTheme(await Bun.file(example).json(), "dark")).toEqual(resolveTheme(bundledThemes.github, "dark"));
        const content = `${await Bun.file(example).text()}\n`;
        await Bun.write(example, content);
        await prepareThemeDirectory(config);
        expect(await Bun.file(example).text()).toBe(content);
        const terminal = JSON.stringify({ theme: "nord", theme_mode: "dark" });
        await Bun.write(path.join(config, "config.json"), terminal);
        await Bun.write(path.join(config, "themes", "organization.json"), JSON.stringify(bundledThemes.dracula));
        await Bun.write(path.join(config, "themes", "invalid.json"), "{invalid");
        const catalog = await loadThemes(config);
        expect(catalog.themes.organization).toBeDefined();
        expect(Object.keys(catalog.themes)).toHaveLength(Object.keys(bundledThemes).length + 1);
        expect(catalog.warnings).toHaveLength(1);
        const selected = await configureAppearance(config, data, { theme: "organization" });
        expect(selected.themes).toContain("organization");
        expect(selected.palettes?.dark.primary).toBe(resolveTheme(bundledThemes.dracula, "dark").primary);
        expect((await configureAppearance(config, data, { mode: "light" })).theme).toBe("organization");
        expect((await configureAppearance(config, data)).mode).toBe("light");
        expect(await Bun.file(path.join(config, "config.json")).text()).toBe(terminal);
        await expect(configureAppearance(config, data, { theme: "unknown" })).rejects.toThrow("Theme not found");
        await expect(configureAppearance(config, data, { mode: "invalid" })).rejects.toThrow("Appearance");
        expect((await configureAppearance(config, data)).theme).toBe("organization");
        await rm(path.join(config, "themes", "organization.json"));
        expect((await configureAppearance(config, data)).theme).toBe("system");
        expect((await configureAppearance(config, data, { mode: "dark" })).mode).toBe("dark");
        expect(JSON.parse(await Bun.file(path.join(config, "desktop.json")).text()).theme).toBe("organization");
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });

    test("retains the desktop's previous appearance without using the SDK", async () => {
      const directory = await mkdtemp(path.join(import.meta.dir, ".tmp-appearance-"));
      try {
        await Bun.write(path.join(directory, "data", "storage", "preference", "desktop-appearance.json"), JSON.stringify({ appearance: "dark" }));
        const appearance = await configureAppearance(path.join(directory, "config"), path.join(directory, "data"));
        expect(appearance.mode).toBe("dark");
        expect(appearance.theme).toBe("system");
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });

    test("persists desktop preferences independently of the selected theme", async () => {
      const directory = await mkdtemp(path.join(import.meta.dir, ".tmp-translucency-"));
      const config = path.join(directory, "config");
      const data = path.join(directory, "data");
      try {
        await Bun.write(path.join(config, "desktop.json"), JSON.stringify({ theme: "nord", mode: "dark" }));
        const initial = await configureAppearance(config, data);
        expect(initial.translucency).toBe(10);
        expect(initial.dithering).toBe(false);
        expect(initial.sidebarVisible).toBe(true);
        expect(initial.sidebarWidth).toBe(216);
        expect(initial.shortcuts).toEqual({});
        const shortcuts = { search: "alt-cmd-f", commands: "" };
        const selected = await configureAppearance(config, data, { translucency: 5, dithering: true, sidebarVisible: false, sidebarWidth: 320, shortcuts });
        expect(selected.theme).toBe("nord");
        expect(selected.mode).toBe("dark");
        const changed = await configureAppearance(config, data, { theme: "github", mode: "light" });
        expect(changed.translucency).toBe(5);
        expect(changed.dithering).toBe(true);
        expect(changed.sidebarVisible).toBe(false);
        expect(changed.sidebarWidth).toBe(320);
        expect(changed.shortcuts).toEqual(shortcuts);
        await configureAppearance(config, data, { translucency: 0 });
        const persisted = await configureAppearance(config, data);
        expect(persisted.translucency).toBe(0);
        expect(persisted.dithering).toBe(true);
        expect(persisted.theme).toBe("github");
        expect(persisted.shortcuts).toEqual(shortcuts);
        for (const translucency of [-1, 101, NaN, Infinity, "5"]) {
          await expect(configureAppearance(config, data, { translucency })).rejects.toThrow("Translucency");
        }
        await expect(configureAppearance(config, data, { dithering: "true" })).rejects.toThrow("boolean");
        await expect(configureAppearance(config, data, { sidebarVisible: "false" })).rejects.toThrow("boolean");
        for (const sidebarWidth of [191, 401, NaN, Infinity, "216"]) {
          await expect(configureAppearance(config, data, { sidebarWidth })).rejects.toThrow("Sidebar width");
        }
        for (const shortcuts of [null, [], "cmd-f", { search: 4 }, { "invalid action": "cmd-f" }, { search: "cmd-f cmd-k" }]) {
          await expect(configureAppearance(config, data, { shortcuts })).rejects.toThrow(/shortcut/i);
        }
        expect(await Bun.file(path.join(config, "desktop.json")).json()).toEqual({
          theme: "github", mode: "light", translucency: 0, dithering: true, sidebarVisible: false, sidebarWidth: 320, shortcuts,
        });
        expect((await configureAppearance(config, data, { shortcuts: {} })).shortcuts).toEqual({});
        expect((await configureAppearance(config, data, { translucency: 10 })).translucency).toBe(10);
        expect((await configureAppearance(config, data, { translucency: 100 })).translucency).toBe(100);
        expect((await configureAppearance(config, data)).translucency).toBe(100);
        await Bun.write(path.join(config, "desktop.json"), JSON.stringify({ theme: "nord", mode: "dark", translucent: true, translucency: 47, dithering: true }));
        const legacy = await configureAppearance(config, data);
        expect(legacy.translucency).toBe(47);
        expect(legacy.dithering).toBe(true);
        await Bun.write(path.join(config, "desktop.json"), JSON.stringify({ theme: "nord", mode: "dark", translucent: false, translucency: 47 }));
        expect((await configureAppearance(config, data)).translucency).toBe(0);
        await configureAppearance(config, data, { mode: "light" });
        expect(await Bun.file(path.join(config, "desktop.json")).json()).toEqual({
          theme: "nord", mode: "light", translucency: 0, dithering: false, sidebarVisible: true, sidebarWidth: 216, shortcuts: {},
        });
        await Bun.write(path.join(config, "desktop.json"), JSON.stringify({ theme: "nord", mode: "dark", translucent: true }));
        expect((await configureAppearance(config, data)).translucency).toBe(10);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  });
});

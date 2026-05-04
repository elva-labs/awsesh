import { describe, expect, test } from "bun:test";
import { Config, defaultConfig, type KeybindsConfig } from "./config";

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
});

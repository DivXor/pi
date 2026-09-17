import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadThemeFromPath, type ThemeJson } from "../src/modes/interactive/theme/theme.ts";
import { validateThemeJson } from "../src/modes/interactive/theme/theme-json.ts";

describe("appBg theme token", () => {
	let tempRoot: string;

	beforeEach(() => {
		tempRoot = mkdtempSync(join(tmpdir(), "pi-theme-app-bg-"));
	});

	afterEach(() => {
		rmSync(tempRoot, { recursive: true, force: true });
	});

	function writeTheme(colors: Partial<ThemeJson["colors"]>, name = "app-bg-test"): string {
		const darkTheme = JSON.parse(
			readFileSync(new URL("../src/modes/interactive/theme/dark.json", import.meta.url), "utf-8"),
		) as ThemeJson;
		const theme: ThemeJson = { ...darkTheme, name, colors: { ...darkTheme.colors, ...colors } };
		const themePath = join(tempRoot, `${name}.json`);
		writeFileSync(themePath, JSON.stringify(theme));
		return themePath;
	}

	it("resolves appBg to a truecolor background SGR", () => {
		const themePath = writeTheme({ appBg: "#000000" });
		const theme = loadThemeFromPath(themePath);
		expect(theme.getBackgroundAnsi()).toBe("\x1b[48;2;0;0;0m");
		expect(theme.bg("appBg", "text")).toBe("\x1b[48;2;0;0;0mtext\x1b[49m");
	});

	it("falls back to the nearest 256-color index in 256color mode", () => {
		const themePath = writeTheme({ appBg: "#000000" });
		const theme = loadThemeFromPath(themePath, "256color");
		expect(theme.getBackgroundAnsi()).toBe("\x1b[48;5;16m");
	});

	it("resolves appBg variable references", () => {
		const darkTheme = JSON.parse(
			readFileSync(new URL("../src/modes/interactive/theme/dark.json", import.meta.url), "utf-8"),
		) as ThemeJson;
		const theme: ThemeJson = {
			...darkTheme,
			name: "app-bg-var",
			vars: { ...(darkTheme.vars ?? {}), canvas: "#101010" },
			colors: { ...darkTheme.colors, appBg: "canvas" },
		};
		const themePath = join(tempRoot, "app-bg-var.json");
		writeFileSync(themePath, JSON.stringify(theme));
		const loaded = loadThemeFromPath(themePath);
		expect(loaded.getBackgroundAnsi()).toBe("\x1b[48;2;16;16;16m");
	});

	it("returns undefined when appBg is omitted", () => {
		const theme = loadThemeFromPath(writeTheme({}));
		expect(theme.getBackgroundAnsi()).toBeUndefined();
	});

	it("returns undefined when appBg is the explicit terminal default", () => {
		const theme = loadThemeFromPath(writeTheme({ appBg: "" }));
		expect(theme.getBackgroundAnsi()).toBeUndefined();
	});

	it("is accepted by the theme schema with and without a value", () => {
		const base = JSON.parse(
			readFileSync(new URL("../src/modes/interactive/theme/dark.json", import.meta.url), "utf-8"),
		) as unknown;

		expect(() => validateThemeJson("with-app-bg", base)).not.toThrow();
		const withAppBg = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
		(withAppBg.colors as Record<string, unknown>).appBg = "#000000";
		expect(() => validateThemeJson("with-app-bg", withAppBg)).not.toThrow();
		expect(validateThemeJson("with-app-bg", withAppBg).colors.appBg).toBe("#000000");

		const badAppBg = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
		(badAppBg.colors as Record<string, unknown>).appBg = true;
		expect(() => validateThemeJson("bad-app-bg", badAppBg)).toThrow();
	});
});

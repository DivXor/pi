import assert from "node:assert";
import { describe, it } from "node:test";
import { Text } from "../src/components/text.ts";
import { TuiAltScreen } from "../src/tui-alt-screen.ts";
import { TuiMainScreen } from "../src/tui-main-screen.ts";
import { VirtualTerminal } from "./virtual-terminal.ts";

const BLACK_BG = "\x1b[48;5;232m";
const RED_BG = "\x1b[48;5;52m";

class RecordingTerminal extends VirtualTerminal {
	readonly writes: string[] = [];
	startCount = 0;
	stopCount = 0;

	override start(onInput: (data: string) => void, onResize: () => void): void {
		this.startCount += 1;
		super.start(onInput, onResize);
	}

	override write(data: string): void {
		this.writes.push(data);
		super.write(data);
	}

	override stop(): void {
		this.stopCount += 1;
		super.stop();
	}

	joinedWrites(): string {
		return this.writes.join("");
	}
}

/** Emits a line with a full SGR reset mid-line, like the editor's fake cursor does. */
class MidLineResetText {
	invalidate(): void {}

	render(): string[] {
		return ["before\x1b[0mafter"];
	}
}

describe("TuiAltScreen background", () => {
	it("emits the background SGR before screen and line erases", async () => {
		const terminal = new RecordingTerminal(20, 4);
		const tui = new TuiAltScreen(terminal, undefined, undefined, { backgroundAnsi: BLACK_BG });
		tui.addChild(new Text("hello", 0, 0));
		tui.start();
		await terminal.waitForRender();

		const writes = terminal.joinedWrites();
		// Entering the alt screen clears with the theme background (BCE).
		assert.ok(
			writes.includes(`${BLACK_BG}\x1b[2J`),
			"alt-screen enter clear must be prefixed with the background SGR",
		);
		// Every painted row erases the line with the theme background before writing content.
		assert.ok(writes.includes(`${BLACK_BG}\x1b[2K`), "row erase must be prefixed with the background SGR");
		assert.ok(!writes.includes(RED_BG));

		tui.stop();
	});

	it("keeps the render output free of background SGRs when none is configured", async () => {
		const terminal = new RecordingTerminal(20, 4);
		const tui = new TuiAltScreen(terminal);
		tui.addChild(new Text("hello", 0, 0));
		tui.start();
		await terminal.waitForRender();
		tui.stop();

		assert.ok(!terminal.joinedWrites().includes("\x1b[48;"));
	});

	it("repaints fully with the new background after setBackgroundAnsi", async () => {
		const terminal = new RecordingTerminal(20, 4);
		const tui = new TuiAltScreen(terminal, undefined, undefined, { backgroundAnsi: BLACK_BG });
		tui.addChild(new Text("hello", 0, 0));
		tui.start();
		await terminal.waitForRender();
		const fullRedrawsBefore = tui.fullRedraws;

		tui.setBackgroundAnsi(RED_BG);
		await terminal.waitForRender();

		assert.strictEqual(tui.fullRedraws, fullRedrawsBefore + 1);
		const writes = terminal.joinedWrites();
		assert.ok(writes.includes(`${RED_BG}\x1b[2J`), "full repaint must clear the screen with the new background");

		tui.stop();
	});

	it("ignores repeated setBackgroundAnsi calls with the same value", async () => {
		const terminal = new RecordingTerminal(20, 4);
		const tui = new TuiAltScreen(terminal, undefined, undefined, { backgroundAnsi: BLACK_BG });
		tui.addChild(new Text("hello", 0, 0));
		tui.start();
		await terminal.waitForRender();
		const fullRedrawsBefore = tui.fullRedraws;

		tui.setBackgroundAnsi(BLACK_BG);
		await terminal.waitForRender();
		assert.strictEqual(tui.fullRedraws, fullRedrawsBefore);

		tui.stop();
	});

	it("re-injects the background after mid-line SGR resets", async () => {
		const terminal = new RecordingTerminal(20, 4);
		const tui = new TuiAltScreen(terminal, undefined, undefined, { backgroundAnsi: BLACK_BG });
		tui.addChild(new MidLineResetText());
		tui.start();
		await terminal.waitForRender();

		const writes = terminal.joinedWrites();
		assert.ok(
			writes.includes(`before\x1b[0m${BLACK_BG}after`),
			"cells after a mid-line reset must keep the theme background",
		);

		tui.stop();
	});
});

describe("TuiMainScreen background", () => {
	it("erases each full render line and erases down with the background SGR", async () => {
		const terminal = new RecordingTerminal(20, 4);
		const tui = new TuiMainScreen(terminal, undefined, undefined, { backgroundAnsi: BLACK_BG });
		tui.addChild(new Text("hello", 0, 0));
		tui.start();
		await terminal.waitForRender();

		const writes = terminal.joinedWrites();
		assert.ok(writes.includes(`${BLACK_BG}\x1b[2K`), "full render lines must erase with the background SGR");
		assert.ok(writes.includes(`${BLACK_BG}\x1b[J`), "rows below content must be painted via erase-down");

		tui.stop();
	});

	it("keeps the render output free of background SGRs when none is configured", async () => {
		const terminal = new RecordingTerminal(20, 4);
		const tui = new TuiMainScreen(terminal);
		tui.addChild(new Text("hello", 0, 0));
		tui.start();
		await terminal.waitForRender();

		assert.ok(!terminal.joinedWrites().includes("\x1b[48;"));
		assert.ok(!terminal.joinedWrites().includes("\x1b[J"));

		tui.stop();
	});

	it("erases changed lines with the background SGR in differential renders", async () => {
		const terminal = new RecordingTerminal(20, 6);
		const tui = new TuiMainScreen(terminal, undefined, undefined, { backgroundAnsi: BLACK_BG });
		const text = new Text("one", 0, 0);
		tui.addChild(text);
		tui.start();
		await terminal.waitForRender();
		const writesBefore = terminal.joinedWrites();

		text.setText("two");
		tui.requestRender();
		await terminal.waitForRender();

		const differentialWrites = terminal.joinedWrites().slice(writesBefore.length);
		assert.ok(
			differentialWrites.includes(`${BLACK_BG}\x1b[2K`),
			"differential line erase must be prefixed with the background SGR",
		);

		tui.stop();
	});

	it("repaints viewport rows that did not change after setBackgroundAnsi", async () => {
		const terminal = new RecordingTerminal(20, 6);
		const tui = new TuiMainScreen(terminal);
		tui.addChild(new Text("static content", 0, 0));
		tui.start();
		await terminal.waitForRender();
		const writesBefore = terminal.joinedWrites();

		tui.setBackgroundAnsi(BLACK_BG);
		await terminal.waitForRender();

		const repaintWrites = terminal.joinedWrites().slice(writesBefore.length);
		assert.ok(
			repaintWrites.includes(`${BLACK_BG}\x1b[2K`),
			"unchanged viewport rows must be rewritten with the new background",
		);
		assert.ok(repaintWrites.includes("static content"), "viewport repaint must rewrite static content");

		tui.stop();
	});

	it("repaints only once for a background change without content changes", async () => {
		const terminal = new RecordingTerminal(20, 6);
		const tui = new TuiMainScreen(terminal);
		tui.addChild(new Text("static content", 0, 0));
		tui.start();
		await terminal.waitForRender();

		tui.setBackgroundAnsi(BLACK_BG);
		await terminal.waitForRender();
		const writesAfterRepaint = terminal.joinedWrites().length;

		tui.requestRender();
		await terminal.waitForRender();
		assert.strictEqual(terminal.joinedWrites().length, writesAfterRepaint);

		tui.stop();
	});
});

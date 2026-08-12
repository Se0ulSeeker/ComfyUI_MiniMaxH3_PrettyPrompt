import assert from "node:assert/strict";
import test from "node:test";

import {
    createPromptHistory,
    insertPlainText,
    installPromptPersistence,
    replaceTextRange,
    spaceDelimitedInsertion,
} from "../web/editor_model.js";

test("inserts a complete speech scaffold with the caret inside the dialogue", () => {
    const result = replaceTextRange("Before after", { anchor: 7, focus: 7 }, "(S1)<d></d>", 7);

    assert.equal(result.value, "Before (S1)<d></d>after");
    assert.deepEqual(result.selection, { anchor: 14, focus: 14 });
    assert.equal(result.value.slice(result.selection.anchor), "</d>after");
});

test("separates adjacent timecode and N/A launcher tokens in either order", () => {
    const afterTime = spaceDelimitedInsertion(
        "00:00.000",
        { anchor: 9, focus: 9 },
        "N/A",
    );
    const timeThenNone = replaceTextRange(
        "00:00.000",
        { anchor: 9, focus: 9 },
        afterTime.text,
        afterTime.caretOffset,
    );
    assert.equal(timeThenNone.value, "00:00.000 N/A");

    const afterNone = spaceDelimitedInsertion("N/A", { anchor: 3, focus: 3 }, "00:00.000");
    const noneThenTime = replaceTextRange(
        "N/A",
        { anchor: 3, focus: 3 },
        afterNone.text,
        afterNone.caretOffset,
    );
    assert.equal(noneThenTime.value, "N/A 00:00.000");
});

test("preserves raw prompt undo and redo across chip-decoration rebuilds", () => {
    const history = createPromptHistory();
    const original = { value: "Start", selection: { anchor: 5, focus: 5 } };
    const decoratedEdit = {
        value: "Start [Shot 2]",
        selection: { anchor: 14, focus: 14 },
    };

    history.reset(original);
    history.record(decoratedEdit);

    assert.deepEqual(history.undo(), original);
    assert.deepEqual(history.redo(), decoratedEdit);
});

test("coalesces continuous typing but starts a new branch after undo", () => {
    const history = createPromptHistory(100, 1000);
    history.reset({ value: "", selection: { anchor: 0, focus: 0 } });
    history.record({ value: "a", selection: { anchor: 1, focus: 1 } }, "typing", 0);
    history.record({ value: "ab", selection: { anchor: 2, focus: 2 } }, "typing", 500);

    assert.equal(history.undo().value, "");
    assert.equal(history.redo().value, "ab");
    assert.equal(history.undo().value, "");

    history.record({ value: "x", selection: { anchor: 1, focus: 1 } }, "typing", 600);
    assert.equal(history.redo(), null);
    assert.equal(history.undo().value, "");
});

test("inserts newlines as literal text so chip decoration cannot collapse the line", () => {
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const originalInputEvent = globalThis.InputEvent;
    let execCommandCalled = false;
    let insertedNode = null;
    let dispatchedInput = null;

    const parentElement = {
        dispatchEvent(event) {
            dispatchedInput = event;
        },
    };
    const selection = {
        rangeCount: 1,
        getRangeAt: () => ({
            deleteContents() {},
            insertNode(node) { insertedNode = node; },
            setStartAfter() {},
            collapse() {},
        }),
        removeAllRanges() {},
        addRange() {},
    };

    globalThis.document = {
        execCommand() {
            execCommandCalled = true;
            return true;
        },
        createTextNode(data) {
            return { data, parentElement };
        },
    };
    globalThis.window = { getSelection: () => selection };
    globalThis.InputEvent = class InputEvent {
        constructor(type, options) {
            this.type = type;
            Object.assign(this, options);
        }
    };

    try {
        insertPlainText("\n");
        assert.equal(execCommandCalled, false);
        assert.equal(insertedNode.data, "\n");
        assert.equal(dispatchedInput.type, "input");
        assert.equal(dispatchedInput.data, "\n");
    } finally {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
        if (originalWindow === undefined) delete globalThis.window;
        else globalThis.window = originalWindow;
        if (originalInputEvent === undefined) delete globalThis.InputEvent;
        else globalThis.InputEvent = originalInputEvent;
    }
});

test("copies the current prompt through LiteGraph serialize/configure lifecycle", () => {
    const originalWidget = { name: "prompt", value: "template" };
    const originalNode = { properties: {}, widgets: [originalWidget] };
    let originalEditorValue = "custom <Picture 9> [Shot 4]";

    installPromptPersistence(originalNode, originalWidget, {
        readPrompt: () => originalEditorValue,
        writePrompt: (value) => { originalEditorValue = value; },
    });

    const serialized = { properties: {}, widgets_values: [] };
    originalNode.onSerialize(serialized);

    assert.equal(serialized.properties.h3Prompt, originalEditorValue);
    assert.equal(serialized.widgets_values[0], originalEditorValue);
    assert.equal(originalWidget.value, originalEditorValue);

    const cloneWidget = { name: "prompt", value: "template" };
    const cloneNode = {
        properties: { ...serialized.properties },
        widgets: [cloneWidget],
    };
    let cloneEditorValue = "template";

    installPromptPersistence(cloneNode, cloneWidget, {
        readPrompt: () => cloneEditorValue,
        writePrompt: (value) => {
            cloneEditorValue = value;
            cloneWidget.value = value;
        },
    });

    cloneWidget.value = serialized.widgets_values[0];
    cloneNode.onConfigure(serialized);

    assert.equal(cloneEditorValue, originalEditorValue);
    assert.equal(cloneWidget.value, originalEditorValue);
});

test("falls back to the configured widget for workflows without prompt backup", () => {
    const promptWidget = { name: "prompt", value: "saved legacy prompt" };
    const node = { properties: {}, widgets: [promptWidget] };
    let editorValue = "template";

    installPromptPersistence(node, promptWidget, {
        readPrompt: () => editorValue,
        writePrompt: (value) => { editorValue = value; },
    });
    node.onConfigure({ widgets_values: [promptWidget.value] });

    assert.equal(editorValue, "saved legacy prompt");
});

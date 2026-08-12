import { app } from "../../scripts/app.js";
import {
    countWords,
    currentSelectionOffsets,
    createPromptHistory,
    domRichTokenSignature,
    editorPlainText,
    insertPlainText,
    installPromptPersistence,
    replaceTextRange,
    restoreSelection,
    selectedPlainText,
    spaceDelimitedInsertion,
} from "./editor_model.js";
import { renderPromptMarkup, richTokenSignature } from "./token_rendering.js";

const EXTENSION_NAME = "minimaxh3-prettyprompt.editor";
const NODE_CLASS = "MiniMaxH3PrettyPrompt";
const STYLESHEET_ID = "minimaxh3-prettyprompt-styles";
const DEFAULT_NODE_WIDTH = 610;
const DEFAULT_NODE_HEIGHT = 350;
const DEFAULT_FONT_SIZE = 12;
const MIN_FONT_SIZE = 9;
const MAX_FONT_SIZE = 22;
const INSERT_TOKENS = [
    { raw: "<Picture 1>", label: "Picture reference", row: 0 },
    { raw: "[Shot 1]", label: "Shot", row: 0 },
    { raw: "(S1)", label: "Speaker", row: 0 },
    { raw: "<d>", label: "Open dialogue", row: 0 },
    { raw: "</d>", label: "Close dialogue", row: 0 },
    { raw: "[English]", label: "Language", row: 1 },
    { raw: "<scenetrans>", label: "Scene transition", row: 1 },
    { raw: "<cutoff>", label: "Speech cutoff", row: 1 },
    { raw: "00:00.000", label: "Timecode", separate: true, row: 1 },
    { raw: "N/A", label: "Not applicable", separate: true, row: 1 },
];

function clampFontSize(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return DEFAULT_FONT_SIZE;
    return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(numericValue)));
}

function loadStylesheet() {
    if (document.getElementById(STYLESHEET_ID)) return;

    const link = document.createElement("link");
    link.id = STYLESHEET_ID;
    link.rel = "stylesheet";
    link.href = new URL("./h3_prompt_editor.css", import.meta.url).href;
    document.head.append(link);
}

function hideAuthoritativeWidget(widget) {
    // ComfyUI still owns and serializes this widget; only its stock control is hidden.
    widget.type = "hidden";
    widget.computeSize = () => [0, -4];

    for (const element of [widget.inputEl, widget.element]) {
        element?.classList?.add("h3-authoritative-widget--hidden");
    }
}

function createEditor(node, promptWidget) {
    const root = document.createElement("div");
    root.className = "h3-prompt-editor";

    const surface = document.createElement("div");
    surface.className = "h3-prompt-editor__surface";

    const editor = document.createElement("div");
    editor.className = "h3-prompt-editor__content";
    editor.contentEditable = "true";
    editor.spellcheck = false;
    editor.dataset.placeholder = "Describe the H3 video…  Try <Picture 1>";
    editor.setAttribute("role", "textbox");
    editor.setAttribute("aria-label", "MiniMax H3 prompt");
    editor.setAttribute("aria-multiline", "true");

    const characterCount = document.createElement("span");
    characterCount.className = "h3-prompt-editor__count";
    characterCount.setAttribute("aria-hidden", "true");

    const fontControls = document.createElement("div");
    fontControls.className = "h3-prompt-editor__font-controls";
    fontControls.setAttribute("aria-label", "Prompt font size");

    const decreaseFont = document.createElement("button");
    decreaseFont.type = "button";
    decreaseFont.textContent = "−";
    decreaseFont.title = "Decrease font size";
    decreaseFont.setAttribute("aria-label", "Decrease prompt font size");

    const fontSizeValue = document.createElement("span");
    fontSizeValue.className = "h3-prompt-editor__font-size";

    const increaseFont = document.createElement("button");
    increaseFont.type = "button";
    increaseFont.textContent = "+";
    increaseFont.title = "Increase font size";
    increaseFont.setAttribute("aria-label", "Increase prompt font size");

    fontControls.append(decreaseFont, fontSizeValue, increaseFont);

    const toolbar = document.createElement("div");
    toolbar.className = "h3-prompt-editor__toolbar";
    const toolbarLabel = document.createElement("span");
    toolbarLabel.className = "h3-prompt-editor__toolbar-label";
    toolbarLabel.textContent = "Text Size";
    toolbar.append(toolbarLabel, fontControls, characterCount);

    const insertBar = document.createElement("div");
    insertBar.className = "h3-prompt-editor__insert-bar";
    insertBar.setAttribute("aria-label", "Insert prompt tokens");
    const insertRows = [0, 1].map(() => {
        const row = document.createElement("div");
        row.className = "h3-prompt-editor__insert-row";
        insertBar.append(row);
        return row;
    });

    const speechButton = document.createElement("button");
    speechButton.type = "button";
    speechButton.className = "h3-prompt-editor__speech-button";
    speechButton.dataset.insert = "(S1)<d></d>";
    speechButton.dataset.caretOffset = String("(S1)<d>".length);
    const speechIcon = document.createElement("span");
    speechIcon.className = "h3-prompt-editor__insert-emoji";
    speechIcon.textContent = "💬";
    speechIcon.setAttribute("aria-hidden", "true");
    const speechLabel = document.createElement("span");
    speechLabel.textContent = "Insert speech";
    speechButton.append(speechIcon, speechLabel);
    speechButton.title = "Insert (S1)<d></d> and place the caret inside the dialogue";
    insertRows[0].append(speechButton);

    for (const token of INSERT_TOKENS) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "h3-prompt-editor__token-button";
        if (token.raw === "<d>" || token.raw === "</d>") {
            button.classList.add("h3-prompt-editor__token-button--compact");
        }
        button.dataset.insert = token.raw;
        if (token.separate) button.dataset.separate = "true";
        button.title = `Insert ${token.raw}`;
        button.setAttribute("aria-label", `Insert ${token.label}: ${token.raw}`);

        const preview = document.createElement("span");
        preview.innerHTML = renderPromptMarkup(token.raw);
        const chip = [...preview.querySelectorAll(".h3-chip")]
            .find((element) => element.dataset.h3Raw === token.raw);
        if (chip) button.append(chip.cloneNode(true));
        else button.textContent = token.raw;
        insertRows[token.row].append(button);
    }

    surface.append(editor);
    root.append(toolbar, insertBar, surface);

    const controller = new AbortController();
    const { signal } = controller;
    const history = createPromptHistory();
    let separateNextInput = false;
    const decorate = (value, selection = null) => {
        editor.innerHTML = renderPromptMarkup(value);
        restoreSelection(editor, selection);
    };

    const updateTextCount = (value) => {
        const words = countWords(value);
        const wordLabel = words === 1 ? "word" : "words";
        const characterLabel = value.length === 1 ? "character" : "characters";
        characterCount.textContent = `${words} ${wordLabel} / ${value.length} ${characterLabel}`;
    };

    const setFontSize = (value, notify = false) => {
        const fontSize = clampFontSize(value);
        root.style.setProperty("--h3-editor-font-size", `${fontSize}px`);
        fontSizeValue.textContent = String(fontSize);
        node.properties ??= {};
        node.properties.h3FontSize = fontSize;
        decreaseFont.disabled = fontSize <= MIN_FONT_SIZE;
        increaseFont.disabled = fontSize >= MAX_FONT_SIZE;
        if (notify) node.graph?.setDirtyCanvas?.(true, true);
    };

    const notifyWidget = (value) => {
        promptWidget.callback?.(value, app.canvas, node, app.canvas?.graph_mouse);
        node.graph?.setDirtyCanvas?.(true, true);
    };

    const historyState = (value = editorPlainText(editor), selection = currentSelectionOffsets(editor)) => ({
        value,
        selection,
    });

    const applyHistoryState = (state) => {
        if (!state) return false;
        decorate(state.value, state.selection);
        promptWidget.value = state.value;
        node.properties ??= {};
        node.properties.h3Prompt = state.value;
        updateTextCount(state.value);
        notifyWidget(state.value);
        return true;
    };

    const historyGroupForInput = (event, previous, next) => {
        if (separateNextInput || !next.selection) return null;
        if (next.selection.anchor !== next.selection.focus) return null;

        if (event.inputType === "insertText" && event.data && !/[\r\n]/.test(event.data)) {
            if (!previous?.selection) return "typing";
            if (previous.selection.anchor !== previous.selection.focus) return null;
            return next.selection.anchor === previous.selection.anchor + event.data.length
                ? "typing"
                : null;
        }
        if (event.inputType === "deleteContentBackward") {
            if (!previous?.selection) return "delete-backward";
            if (previous.selection.anchor !== previous.selection.focus) return null;
            return next.selection.anchor < previous.selection.anchor ? "delete-backward" : null;
        }
        if (event.inputType === "deleteContentForward") {
            if (!previous?.selection) return "delete-forward";
            if (previous.selection.anchor !== previous.selection.focus) return null;
            return next.selection.anchor === previous.selection.anchor ? "delete-forward" : null;
        }
        return null;
    };

    const replaceSelectedRange = (replacement) => {
        const offsets = currentSelectionOffsets(editor);
        if (!offsets || offsets.anchor === offsets.focus) return false;
        const value = editorPlainText(editor);
        const next = replaceTextRange(value, offsets, replacement);
        decorate(next.value, next.selection);
        promptWidget.value = next.value;
        node.properties ??= {};
        node.properties.h3Prompt = next.value;
        updateTextCount(next.value);
        notifyWidget(next.value);
        history.record(historyState(next.value, next.selection));
        separateNextInput = false;
        return true;
    };

    const insertAtCaret = (text, caretOffset = text.length, ensureSeparation = false) => {
        const value = editorPlainText(editor);
        const offsets = currentSelectionOffsets(editor);
        const insertion = ensureSeparation
            ? spaceDelimitedInsertion(value, offsets, text, caretOffset)
            : { text, caretOffset };
        const next = replaceTextRange(value, offsets, insertion.text, insertion.caretOffset);

        editor.focus({ preventScroll: true });
        decorate(next.value, next.selection);
        promptWidget.value = next.value;
        node.properties ??= {};
        node.properties.h3Prompt = next.value;
        updateTextCount(next.value);
        notifyWidget(next.value);
        history.record(historyState(next.value, next.selection));
    };

    const syncFromEditor = (notify = false, inputEvent = null) => {
        const value = editorPlainText(editor);
        const selection = currentSelectionOffsets(editor);
        const nextSignature = richTokenSignature(value);
        const nextHistoryState = historyState(value, selection);
        const historyGroup = inputEvent
            ? historyGroupForInput(inputEvent, history.current(), nextHistoryState)
            : null;

        promptWidget.value = value;
        node.properties ??= {};
        node.properties.h3Prompt = value;
        updateTextCount(value);
        if (nextSignature !== domRichTokenSignature(editor)) decorate(value, selection);
        if (notify) notifyWidget(value);
        history.record(nextHistoryState, historyGroup);
        separateNextInput = false;
        return value;
    };

    const setValue = (value, notify = false) => {
        const nextValue = String(value ?? "");
        if (
            editorPlainText(editor) !== nextValue
            || domRichTokenSignature(editor) !== richTokenSignature(nextValue)
        ) {
            decorate(nextValue);
        }
        promptWidget.value = nextValue;
        node.properties ??= {};
        node.properties.h3Prompt = nextValue;
        updateTextCount(nextValue);
        history.reset(historyState(nextValue, null));
        if (notify) notifyWidget(nextValue);
    };

    editor.addEventListener("beforeinput", (event) => {
        if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
            event.preventDefault();
            applyHistoryState(event.inputType === "historyUndo" ? history.undo() : history.redo());
            return;
        }
        if (event.inputType !== "insertParagraph" && event.inputType !== "insertLineBreak") return;
        event.preventDefault();
        separateNextInput = true;
        if (!replaceSelectedRange("\n")) insertPlainText("\n");
    }, { signal });

    editor.addEventListener("input", (event) => syncFromEditor(true, event), { signal });
    editor.addEventListener("keydown", (event) => {
        const modifier = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        const wantsUndo = modifier && !event.altKey && key === "z" && !event.shiftKey;
        const wantsRedo = modifier && !event.altKey && (key === "y" || (key === "z" && event.shiftKey));

        if (wantsUndo || wantsRedo) {
            event.preventDefault();
            event.stopPropagation();
            applyHistoryState(wantsUndo ? history.undo() : history.redo());
            return;
        }

        const isCanvasEnterShortcut = event.key === "Enter" && (event.ctrlKey || event.metaKey);
        const canvas = app.canvas?.canvas;

        if (isCanvasEnterShortcut && canvas) {
            event.preventDefault();
            event.stopPropagation();
            canvas.dispatchEvent(new KeyboardEvent("keydown", {
                bubbles: true,
                cancelable: true,
                composed: true,
                view: window,
                key: event.key,
                code: event.code,
                location: event.location,
                repeat: event.repeat,
                ctrlKey: event.ctrlKey,
                shiftKey: event.shiftKey,
                altKey: event.altKey,
                metaKey: event.metaKey,
            }));
            return;
        }

        event.stopPropagation();
    }, { signal });
    editor.addEventListener("paste", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const text = event.clipboardData?.getData("text/plain") ?? "";
        separateNextInput = true;
        if (!replaceSelectedRange(text)) insertPlainText(text);
    }, { signal });
    editor.addEventListener("copy", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const selectedText = selectedPlainText(editor);
        if (!selectedText) return;
        event.clipboardData?.setData("text/plain", selectedText);
    }, { signal });
    editor.addEventListener("cut", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const selectedText = selectedPlainText(editor);
        if (!selectedText) return;
        event.clipboardData?.setData("text/plain", selectedText);
        replaceSelectedRange("");
    }, { signal });
    editor.addEventListener("dblclick", (event) => {
        const chip = event.target.closest?.(".h3-chip");
        if (!chip) return;
        event.preventDefault();
        const raw = chip.dataset.h3Raw ?? "";
        const textNode = document.createTextNode(raw);
        chip.replaceWith(textNode);
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(textNode);
        selection?.removeAllRanges();
        selection?.addRange(range);
    }, { signal });
    editor.addEventListener("blur", () => {
        const value = editorPlainText(editor);
        if (richTokenSignature(value) !== domRichTokenSignature(editor)) decorate(value);
    }, { signal });

    insertBar.addEventListener("pointerdown", (event) => {
        if (event.target.closest?.("button")) event.preventDefault();
    }, { signal });
    insertBar.addEventListener("click", (event) => {
        const button = event.target.closest?.("button[data-insert]");
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        const text = button.dataset.insert ?? "";
        const caretOffset = button.dataset.caretOffset === undefined
            ? text.length
            : Number(button.dataset.caretOffset);
        insertAtCaret(text, caretOffset, button.dataset.separate === "true");
    }, { signal });

    const forwardedPointerEvents = new WeakSet();
    let activePanPointerId = null;

    const forwardPointerToCanvas = (event) => {
        const canvas = app.canvas?.canvas;
        if (!canvas) return false;

        const forwardedEvent = new PointerEvent(event.type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            detail: event.detail,
            screenX: event.screenX,
            screenY: event.screenY,
            clientX: event.clientX,
            clientY: event.clientY,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
            button: event.button,
            buttons: event.buttons,
            relatedTarget: event.relatedTarget,
            pointerId: event.pointerId,
            width: event.width,
            height: event.height,
            pressure: event.pressure,
            tangentialPressure: event.tangentialPressure,
            tiltX: event.tiltX,
            tiltY: event.tiltY,
            twist: event.twist,
            pointerType: event.pointerType,
            isPrimary: event.isPrimary,
        });
        forwardedPointerEvents.add(forwardedEvent);
        canvas.dispatchEvent(forwardedEvent);
        return true;
    };

    root.addEventListener("pointerdown", (event) => {
        if (event.button === 1 && forwardPointerToCanvas(event)) {
            activePanPointerId = event.pointerId;
            event.preventDefault();
        }
        event.stopPropagation();
    }, { signal });

    const forwardActivePan = (event) => {
        if (forwardedPointerEvents.has(event) || event.pointerId !== activePanPointerId) return;
        event.preventDefault();
        event.stopPropagation();
        forwardPointerToCanvas(event);
        if (event.type === "pointerup" || event.type === "pointercancel") {
            activePanPointerId = null;
        }
    };

    window.addEventListener("pointermove", forwardActivePan, { capture: true, signal });
    window.addEventListener("pointerup", forwardActivePan, { capture: true, signal });
    window.addEventListener("pointercancel", forwardActivePan, { capture: true, signal });
    root.addEventListener("auxclick", (event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        event.stopPropagation();
    }, { signal });

    root.addEventListener("wheel", (event) => {
        const canvas = app.canvas?.canvas;
        if (!canvas) return;

        event.preventDefault();
        event.stopPropagation();
        canvas.dispatchEvent(new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            view: window,
            detail: event.detail,
            screenX: event.screenX,
            screenY: event.screenY,
            clientX: event.clientX,
            clientY: event.clientY,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
            button: event.button,
            buttons: event.buttons,
            relatedTarget: event.relatedTarget,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            deltaZ: event.deltaZ,
            deltaMode: event.deltaMode,
        }));
    }, { signal, passive: false });
    decreaseFont.addEventListener(
        "click",
        () => setFontSize((node.properties?.h3FontSize ?? DEFAULT_FONT_SIZE) - 1, true),
        { signal },
    );
    increaseFont.addEventListener(
        "click",
        () => setFontSize((node.properties?.h3FontSize ?? DEFAULT_FONT_SIZE) + 1, true),
        { signal },
    );

    const requiredEditorHeight = () => Math.max(202, 150 + insertBar.scrollHeight);
    const domWidget = node.addDOMWidget("h3_prompt_editor", "h3_prompt_editor", root, {
        getValue: () => String(promptWidget.value ?? ""),
        setValue: (value) => setValue(value, false),
        getMinHeight: requiredEditorHeight,
        getHeight: () => Math.max(
            requiredEditorHeight(),
            (node.size?.[1] ?? DEFAULT_NODE_HEIGHT) - 54,
        ),
        hideOnZoom: false,
    });
    domWidget.serialize = false;
    installPromptPersistence(node, promptWidget, {
        readPrompt: () => editorPlainText(editor),
        writePrompt: (value) => setValue(value, false),
    });

    const resizeObserver = typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            const requiredNodeHeight = requiredEditorHeight() + 54;
            const currentHeight = node.size?.[1] ?? 0;
            if (currentHeight < requiredNodeHeight) {
                node.setSize?.([node.size?.[0] ?? DEFAULT_NODE_WIDTH, requiredNodeHeight]);
            }
            node.graph?.setDirtyCanvas?.(true, true);
        });
    resizeObserver?.observe(insertBar);

    const originalRemoved = node.onRemoved;
    node.onRemoved = function () {
        resizeObserver?.disconnect();
        controller.abort();
        return originalRemoved?.apply(this, arguments);
    };

    setValue(promptWidget.value ?? "", false);
    setFontSize(node.properties?.h3FontSize ?? DEFAULT_FONT_SIZE, false);
    node.__h3PromptEditor = { editor, setValue, setFontSize };
    return domWidget;
}

app.registerExtension({
    name: EXTENSION_NAME,

    async setup() {
        loadStylesheet();
    },

    async nodeCreated(node) {
        if (node?.comfyClass !== NODE_CLASS || node.__h3PromptEditor) return;

        const promptWidget = node.widgets?.find((widget) => widget.name === "prompt");
        if (!promptWidget) return;

        hideAuthoritativeWidget(promptWidget);
        createEditor(node, promptWidget);
        node.setSize?.([
            Math.max(node.size?.[0] ?? 0, DEFAULT_NODE_WIDTH),
            Math.max(node.size?.[1] ?? 0, DEFAULT_NODE_HEIGHT),
        ]);
    },

    loadedGraphNode(node) {
        if (node?.comfyClass !== NODE_CLASS) return;
        node.__h3PromptEditor?.setFontSize(
            node.properties?.h3FontSize ?? DEFAULT_FONT_SIZE,
            false,
        );
    },
});

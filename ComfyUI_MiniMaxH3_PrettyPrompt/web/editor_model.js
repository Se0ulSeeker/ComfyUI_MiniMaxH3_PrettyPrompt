function isChip(node) {
    return node?.nodeType === Node.ELEMENT_NODE && node.classList.contains("h3-chip");
}

function plainTextForNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.data;
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    if (isChip(node)) return node.dataset.h3Raw ?? "";
    if (node.tagName === "BR") return "\n";

    let text = [...node.childNodes].map(plainTextForNode).join("");
    if ((node.tagName === "DIV" || node.tagName === "P") && node.nextSibling && !text.endsWith("\n")) {
        text += "\n";
    }
    return text;
}

export function editorPlainText(editor) {
    return [...editor.childNodes].map(plainTextForNode).join("");
}

export function domRichTokenSignature(editor) {
    return [...editor.querySelectorAll("[data-h3-kind]")]
        .map((element) => {
            const kind = element.dataset.h3Kind;
            const raw = isChip(element) ? element.dataset.h3Raw ?? "" : element.textContent ?? "";
            return `${kind}:${raw}`;
        })
        .join("\u001f");
}

function nodeTextLength(node) {
    return plainTextForNode(node).length;
}

function pointToTextOffset(root, target, targetOffset) {
    let total = 0;
    let found = false;

    const visit = (node) => {
        if (found) return;
        if (isChip(node) && (node === target || node.contains(target))) {
            const rawLength = nodeTextLength(node);
            if (node === target) {
                total += targetOffset > 0 ? rawLength : 0;
            } else {
                const chipRange = document.createRange();
                chipRange.selectNodeContents(node);
                chipRange.setEnd(target, targetOffset);
                const visibleLength = node.textContent?.length ?? 0;
                const visibleOffset = chipRange.toString().length;
                total += visibleLength > 0 && visibleOffset >= visibleLength / 2 ? rawLength : 0;
            }
            found = true;
            return;
        }
        if (node === target) {
            if (node.nodeType === Node.TEXT_NODE) {
                total += Math.min(targetOffset, node.data.length);
            } else {
                const children = [...node.childNodes];
                for (let index = 0; index < Math.min(targetOffset, children.length); index += 1) {
                    total += nodeTextLength(children[index]);
                }
            }
            found = true;
            return;
        }

        if (isChip(node) || node.nodeType === Node.TEXT_NODE) {
            total += nodeTextLength(node);
            return;
        }

        if (node.nodeType === Node.ELEMENT_NODE && node.contains(target)) {
            for (const child of node.childNodes) visit(child);
            return;
        }

        total += nodeTextLength(node);
    };

    visit(root);
    return total;
}

export function currentSelectionOffsets(editor) {
    const selection = window.getSelection();
    if (!selection?.anchorNode || !selection.focusNode) return null;
    if (!editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) return null;

    return {
        anchor: pointToTextOffset(editor, selection.anchorNode, selection.anchorOffset),
        focus: pointToTextOffset(editor, selection.focusNode, selection.focusOffset),
    };
}

export function selectedPlainText(editor) {
    const offsets = currentSelectionOffsets(editor);
    if (!offsets || offsets.anchor === offsets.focus) return "";
    const value = editorPlainText(editor);
    return value.slice(
        Math.min(offsets.anchor, offsets.focus),
        Math.max(offsets.anchor, offsets.focus),
    );
}

export function replaceTextRange(value, selection, replacement, caretOffset = replacement.length) {
    const text = String(value ?? "");
    const inserted = String(replacement ?? "");
    const anchor = selection?.anchor ?? text.length;
    const focus = selection?.focus ?? anchor;
    const start = Math.min(anchor, focus);
    const end = Math.max(anchor, focus);
    const requestedCaret = Number(caretOffset);
    const relativeCaret = Number.isFinite(requestedCaret)
        ? Math.min(inserted.length, Math.max(0, requestedCaret))
        : inserted.length;
    const caret = start + relativeCaret;

    return {
        value: `${text.slice(0, start)}${inserted}${text.slice(end)}`,
        selection: { anchor: caret, focus: caret },
    };
}

/** Add spaces around a standalone launcher token only where adjacent text needs them. */
export function spaceDelimitedInsertion(value, selection, insertion, caretOffset = insertion.length) {
    const text = String(value ?? "");
    const inserted = String(insertion ?? "");
    const anchor = selection?.anchor ?? text.length;
    const focus = selection?.focus ?? anchor;
    const start = Math.min(anchor, focus);
    const end = Math.max(anchor, focus);
    const leading = start > 0 && !/\s/.test(text[start - 1]) ? " " : "";
    const trailing = end < text.length && !/\s/.test(text[end]) ? " " : "";

    return {
        text: `${leading}${inserted}${trailing}`,
        caretOffset: leading.length + Math.min(inserted.length, Math.max(0, caretOffset)),
    };
}

function pointForTextOffset(root, requestedOffset) {
    const targetOffset = Math.max(0, requestedOffset);

    const find = (container, remaining) => {
        const children = [...container.childNodes];
        for (let index = 0; index < children.length; index += 1) {
            const child = children[index];
            const length = nodeTextLength(child);

            if (remaining === 0) return { node: container, offset: index };
            if (remaining < length) {
                if (child.nodeType === Node.TEXT_NODE) return { node: child, offset: remaining };
                if (isChip(child)) {
                    return { node: container, offset: index + (remaining >= length / 2 ? 1 : 0) };
                }
                return find(child, remaining);
            }
            if (remaining === length) return { node: container, offset: index + 1 };
            remaining -= length;
        }
        return { node: container, offset: children.length };
    };

    return find(root, Math.min(targetOffset, nodeTextLength(root)));
}

export function restoreSelection(editor, offsets) {
    if (!offsets) return;
    const selection = window.getSelection();
    const anchor = pointForTextOffset(editor, offsets.anchor);
    const focus = pointForTextOffset(editor, offsets.focus);
    selection?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
}

export function insertPlainText(text) {
    // Chromium may turn an inserted newline into a DIV/BR block. That block is
    // later rebuilt when a token becomes a chip, which can collapse the line
    // boundary. Insert multiline text as a literal text node so pre-wrap keeps
    // the prompt's exact newline characters through decoration.
    if (!/[\r\n]/.test(text) && document.execCommand("insertText", false, text)) return;

    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    textNode.parentElement?.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text,
    }));
}

function cloneHistoryState(state) {
    return {
        value: String(state?.value ?? ""),
        selection: state?.selection
            ? { anchor: state.selection.anchor, focus: state.selection.focus }
            : null,
    };
}

/** Raw-text undo history that remains valid when chip decoration rebuilds the DOM. */
export function createPromptHistory(limit = 100, mergeWindowMs = 1000) {
    const maxEntries = Math.max(2, Math.trunc(limit) || 100);
    let entries = [];
    let index = -1;
    let lastRecord = null;

    const reset = (state) => {
        entries = [cloneHistoryState(state)];
        index = 0;
        lastRecord = null;
    };

    const current = () => index >= 0 ? cloneHistoryState(entries[index]) : null;

    const record = (state, group = null, timestamp = Date.now()) => {
        const next = cloneHistoryState(state);
        const active = entries[index];
        if (active?.value === next.value) {
            entries[index] = next;
            return;
        }

        entries.splice(index + 1);
        const canMerge = group
            && lastRecord?.group === group
            && timestamp - lastRecord.timestamp <= mergeWindowMs
            && index === entries.length - 1;

        if (canMerge) {
            entries[index] = next;
        } else {
            entries.push(next);
            index += 1;
            if (entries.length > maxEntries) {
                entries.shift();
                index -= 1;
            }
        }
        lastRecord = { group, timestamp };
    };

    const step = (direction) => {
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= entries.length) return null;
        index = nextIndex;
        lastRecord = null;
        return current();
    };

    return {
        reset,
        current,
        record,
        undo: () => step(-1),
        redo: () => step(1),
    };
}

/** Keep a custom editor synchronized with LiteGraph clone/workflow lifecycles. */
export function installPromptPersistence(node, promptWidget, { readPrompt, writePrompt }) {
    const originalConfigured = node.onConfigure;
    node.onConfigure = function (serializedNode) {
        originalConfigured?.apply(this, arguments);
        const configuredValue = typeof this.properties?.h3Prompt === "string"
            ? this.properties.h3Prompt
            : promptWidget.value;
        writePrompt(configuredValue);
    };

    const originalSerialized = node.onSerialize;
    node.onSerialize = function (serializedNode) {
        originalSerialized?.apply(this, arguments);
        const value = String(readPrompt() ?? "");
        promptWidget.value = value;
        this.properties ??= {};
        this.properties.h3Prompt = value;
        serializedNode.properties ??= {};
        serializedNode.properties.h3Prompt = value;

        const promptIndex = this.widgets?.indexOf(promptWidget) ?? -1;
        if (promptIndex >= 0) {
            serializedNode.widgets_values ??= [];
            serializedNode.widgets_values[promptIndex] = value;
        }
    };
}

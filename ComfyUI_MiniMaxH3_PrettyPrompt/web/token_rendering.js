const H3_FIELD_KEYS = Object.freeze([
    "integrated_multimodal_description",
    "overall_soundscape",
    "non_diegetic_music",
]);

const FIELD_TOKEN_SOURCE = `^(?:${H3_FIELD_KEYS.join("|")}):`;
const RENDER_TOKEN_SOURCE = new RegExp(
    [
        "<Picture [1-9]\\d*>",
        "\\bPicture [1-9]\\d*\\b",
        "\\[Shot [1-9]\\d*\\]",
        "\\(S[1-9]\\d*(?:,S[1-9]\\d*)*\\)",
        "<scenetrans>",
        "<cutoff>",
        "<d>",
        "<\\/d>",
        "\\[[A-Z][A-Za-z-]{1,24}\\]",
        "\\b\\d{2}:\\d{2}\\.\\d{3}\\b",
        "\\bN\\/A\\b",
        FIELD_TOKEN_SOURCE,
    ].join("|"),
    "gm",
);
const FIELD_TOKENS = new Set(H3_FIELD_KEYS.map((key) => `${key}:`));

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderEmoji(emoji) {
    return emoji
        ? `<span class="h3-chip__emoji" aria-hidden="true">${emoji}</span>`
        : "";
}

function chipStart(raw, classes, kind) {
    const escapedRaw = escapeHtml(raw);
    return `<span class="h3-chip ${classes}" data-h3-kind="${kind}" data-h3-raw="${escapedRaw}" contenteditable="false" aria-label="${escapedRaw}" title="${escapedRaw}">`;
}

function renderPictureReference(raw) {
    const pictureMatch = raw.match(/^<?Picture ([1-9]\d*)>?$/);
    const label = `Picture ${pictureMatch[1]}`;
    return [
        chipStart(raw, "h3-reference-chip", "reference"),
        '<span class="h3-chip__visual h3-reference-chip__visual">',
        renderEmoji("🖼️"),
        `<span>${escapeHtml(label)}</span>`,
        "</span>",
        "</span>",
    ].join("");
}

function renderShot(raw) {
    const shotNumber = raw.match(/\d+/)[0];
    return [
        chipStart(raw, "h3-shot-chip", "shot"),
        '<span class="h3-chip__visual h3-shot-chip__visual">',
        renderEmoji("📹"),
        `<span>Shot ${shotNumber}</span>`,
        "</span>",
        "</span>",
    ].join("");
}

function renderDialogue(raw, quote, kind) {
    return [
        chipStart(raw, "h3-syntax-chip h3-syntax-chip--dialogue", kind),
        '<span class="h3-chip__visual h3-syntax-chip__visual">',
        `<span class="h3-dialogue-mark">${escapeHtml(quote)}</span>`,
        "</span>",
        "</span>",
    ].join("");
}

function renderSyntaxChip(raw, label, kind, emoji = null) {
    return [
        chipStart(raw, `h3-syntax-chip h3-syntax-chip--${kind}`, kind),
        '<span class="h3-chip__visual h3-syntax-chip__visual">',
        renderEmoji(emoji),
        `<span>${escapeHtml(label)}</span>`,
        "</span>",
        "</span>",
    ].join("");
}

function renderField(raw) {
    return `<span class="h3-field-token" data-h3-kind="field">${escapeHtml(raw)}</span>`;
}

function tokenKind(raw) {
    if (/^<?Picture \d+>?$/.test(raw)) return "reference";
    if (/^\[Shot \d+\]$/.test(raw)) return "shot";
    if (/^\(S\d+/.test(raw)) return "speaker";
    if (raw === "<d>") return "dialogue-open";
    if (raw === "</d>") return "dialogue-close";
    if (raw === "<scenetrans>") return "transition";
    if (raw === "<cutoff>") return "cutoff";
    if (/^\[[A-Z][A-Za-z-]+\]$/.test(raw)) return "language";
    if (/^\d{2}:\d{2}\.\d{3}$/.test(raw)) return "time";
    if (raw === "N/A") return "none";
    if (FIELD_TOKENS.has(raw)) return "field";
    return null;
}

function renderToken(raw, kind) {
    switch (kind) {
        case "reference": return renderPictureReference(raw);
        case "shot": return renderShot(raw);
        case "speaker": return renderSyntaxChip(raw, raw.slice(1, -1), "speaker", "🗣️");
        case "dialogue-open": return renderDialogue(raw, "\u201c", kind);
        case "dialogue-close": return renderDialogue(raw, "\u201d", kind);
        case "transition": return renderSyntaxChip(raw, "Transition", "transition", "🌀");
        case "cutoff": return renderSyntaxChip(raw, "Cutoff", "cutoff", "✂️");
        case "language": return renderSyntaxChip(raw, raw.slice(1, -1), "language", "🌐");
        case "time": return renderSyntaxChip(raw, raw, "time");
        case "none": return renderSyntaxChip(raw, "N/A", "none");
        case "field": return renderField(raw);
        default: return escapeHtml(raw);
    }
}

function collectRichTokens(prompt) {
    const text = String(prompt ?? "");
    const matcher = new RegExp(RENDER_TOKEN_SOURCE.source, RENDER_TOKEN_SOURCE.flags);
    const tokens = [];

    for (const match of text.matchAll(matcher)) {
        const raw = match[0];
        const kind = tokenKind(raw);
        tokens.push({ raw, kind, index: match.index });
    }

    return tokens;
}

/** Return safe rich-editor markup. The canonical prompt remains plain text. */
export function renderPromptMarkup(prompt) {
    const text = String(prompt ?? "");
    let markup = "";
    let cursor = 0;

    for (const token of collectRichTokens(text)) {
        markup += escapeHtml(text.slice(cursor, token.index));
        markup += token.kind ? renderToken(token.raw, token.kind) : escapeHtml(token.raw);
        cursor = token.index + token.raw.length;
    }

    return `${markup}${escapeHtml(text.slice(cursor))}`;
}

/** Signature used to avoid rebuilding the editable DOM during ordinary typing. */
export function richTokenSignature(prompt) {
    return collectRichTokens(prompt)
        .filter((token) => token.kind)
        .map((token) => `${token.kind}:${token.raw}`)
        .join("\u001f");
}

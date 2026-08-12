import assert from "node:assert/strict";
import test from "node:test";

import { renderPromptMarkup, richTokenSignature } from "../web/token_rendering.js";

test("recognizes only supported positive-integer picture references", () => {
    const prompt = [
        "<Picture 1>",
        "<Picture 42>",
        "Picture 3",
        "Picture 27",
        "<Picture 0>",
        "<Picture -1>",
        "<Picture1>",
        "<d>[English] Hello!</d>",
        "<scenetrans>",
        "<cutoff>",
    ].join(" ");

    const markup = renderPromptMarkup(prompt);
    assert.equal((markup.match(/h3-reference-chip__visual/g) ?? []).length, 4);
    assert.match(markup, /&lt;Picture 0&gt;/);
    assert.match(markup, /&lt;Picture -1&gt;/);
    assert.match(markup, /&lt;Picture1&gt;/);
});

test("renders references and exact H3 structural markup as distinct chips", () => {
    const markup = renderPromptMarkup(
        "[Shot 1] <Picture 1> says <d>[English] Hi!</d> <scenetrans>",
    );

    assert.match(markup, /h3-reference-chip/);
    assert.match(markup, />Picture 1</);
    assert.match(markup, />🖼️</);
    assert.match(markup, />📹</);
    assert.doesNotMatch(markup, />💬</);
    assert.match(markup, />🌀</);
    assert.doesNotMatch(markup, /h3-reference-chip__icon/);
    assert.match(markup, /data-h3-raw="&lt;Picture 1&gt;"/);
    assert.match(markup, /h3-shot-chip/);
    assert.equal((markup.match(/h3-syntax-chip--dialogue/g) ?? []).length, 2);
    assert.doesNotMatch(markup, /h3-dialogue-label/);
    assert.match(markup, /h3-syntax-chip--language/);
    assert.match(markup, /h3-syntax-chip--transition/);
    assert.equal((markup.match(/h3-reference-chip__visual/g) ?? []).length, 1);
});

test("keeps the three core H3 field labels as ordinary editable text", () => {
    const markup = renderPromptMarkup(
        "integrated_multimodal_description:\n\noverall_soundscape:\n\nnon_diegetic_music:",
    );

    assert.doesNotMatch(markup, /h3-structure-label/);
    assert.match(markup, /integrated_multimodal_description:/);
    assert.match(markup, /overall_soundscape:/);
    assert.match(markup, /non_diegetic_music:/);
});

test("recognizes positive-integer shot markers as a separate chip type", () => {
    const prompt = "[Shot 1] Intro [Shot 2] Action [Shot 12] End [Shot 0] [Shot A]";

    const markup = renderPromptMarkup(prompt);
    assert.equal((markup.match(/h3-shot-chip__visual/g) ?? []).length, 3);
    assert.match(markup, />Shot 1</);
    assert.match(markup, /\[Shot 0\]/);
});

test("recognizes speaker IDs including compound speakers", () => {
    const prompt = "A woman (S1) and child (S2) speak; then (S1,S2) sing. (S0)";

    const markup = renderPromptMarkup(prompt);
    assert.equal((markup.match(/h3-syntax-chip--speaker/g) ?? []).length, 3);
    assert.equal((markup.match(/>🗣️</g) ?? []).length, 3);
});

test("chips guide timecodes, cutoff, N/A, and bare Picture references", () => {
    const markup = renderPromptMarkup(
        "Picture 2 starts [Shot 2] At 00:03.500. <cutoff>\nnon_diegetic_music: N/A",
    );

    assert.match(markup, /h3-reference-chip/);
    assert.match(markup, /h3-syntax-chip--time/);
    assert.match(markup, /h3-syntax-chip--cutoff/);
    assert.match(markup, />✂️</);
    assert.match(markup, /h3-syntax-chip--none/);
    assert.match(markup, /h3-field-token/);
});

test("renders bracketed language names consistently with or without dialogue wrappers", () => {
    const markup = renderPromptMarkup(
        "Keep [English] ordinary, then <d>[English] Hello.</d>",
    );

    assert.equal((markup.match(/h3-syntax-chip--language/g) ?? []).length, 2);
    assert.equal((markup.match(/>🌐</g) ?? []).length, 2);
    assert.doesNotMatch(markup, /Keep \[English\] ordinary/);
});

test("all rich token types use the shared chip geometry contract", () => {
    const markup = renderPromptMarkup(
        "<Picture 1> [Shot 1] (S1) <d>[English] Hi.</d> <scenetrans> <cutoff> 00:01.000 N/A",
    );
    const outerCount = (markup.match(/class="h3-chip /g) ?? []).length;
    const visualCount = (markup.match(/class="h3-chip__visual /g) ?? []).length;
    const rawCount = (markup.match(/data-h3-raw=/g) ?? []).length;

    assert.equal(outerCount, 10);
    assert.equal(visualCount, outerCount);
    assert.equal(rawCount, outerCount);
    assert.doesNotMatch(markup, /h3-chip__measure/);
});

test("structural signatures change only when rich tokens change", () => {
    const first = richTokenSignature("A woman (S1) says <d>[English] Hi.</d>");
    const shifted = richTokenSignature("Suddenly, a woman (S1) says <d>[English] Hi.</d>");
    const changed = richTokenSignature("A woman (S2) says <d>[English] Hi.</d>");

    assert.equal(first, shifted);
    assert.notEqual(first, changed);
    assert.match(richTokenSignature("Keep [English] plain"), /language:\[English\]/);
});

test("handles plain, multiple, picture, and mixed multiline prompts", () => {
    const cases = [
        ["A woman walks through a room.", []],
        ["A woman looks toward <Picture 1>.", ["<Picture 1>"]],
        [
            "<Picture 1> shows the woman while <Picture 2> shows the room.",
            ["<Picture 1>", "<Picture 2>"],
        ],
        [
            "At 0.00 seconds, <Picture 1> is fully referenced.",
            ["<Picture 1>"],
        ],
        [
            "[Shot 1] <Picture 3>\nThe woman says: <d>[English] Look.</d>\n<cutoff>",
            ["<Picture 3>"],
        ],
    ];

    for (const [prompt, expected] of cases) {
        const markup = renderPromptMarkup(prompt);
        assert.equal(
            (markup.match(/h3-reference-chip__visual/g) ?? []).length,
            expected.length,
        );
    }
});

test("escapes ordinary prompt text before inserting editor markup", () => {
    const markup = renderPromptMarkup('<script>alert("x")</script> <Picture 2>');

    assert.doesNotMatch(markup, /<script>/);
    assert.match(markup, /&lt;script&gt;/);
    assert.match(markup, /Picture 2/);
});

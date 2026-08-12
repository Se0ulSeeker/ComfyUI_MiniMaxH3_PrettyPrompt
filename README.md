# ComfyUI MiniMax H3 Pretty Prompt

A simple ComfyUI node that makes MiniMax H3 video prompts easier to read and write.

It turns supported parts of the prompt into clear, colored chips. This gives you a richer preview of the prompt, similar in spirit to the prompt editors found in closed video-model interfaces such as Seedance 2.

<img width="1684" height="1078" alt="Screenshot 2026-08-12 113636" src="https://github.com/user-attachments/assets/434ee7e5-4f46-4c38-9d46-6dea4c9360fc" />

## What is this? What does it do?

https://github.com/user-attachments/assets/ca5fa577-6860-4bd7-a05c-7229d776bb8f


**MiniMax H3 Pretty Prompt** is a visual prompt editor for ComfyUI.

It helps you see the structure of a MiniMax H3 prompt more clearly. Picture references, shots, speakers, dialogue, transitions, cutoffs, languages, timecodes, and other supported syntax are shown as colored 'chips'.

The node does not generate a video or change the meaning of your prompt. It simply makes the prompt easier to look at and easier to write.

The output is always the original plain-text prompt. For example, the editor may show a chip named `🌀 Transition`, but the node still outputs the correct raw token:

```text
<scenetrans>
```

## Why?

Because structured video prompts can become hard to read.

A wall of tags and speaker labels is easy to lose track of. Colored chips make those parts stand out, so you can understand the prompt faster and make fewer formatting mistakes.

It's also prettier :D

## Features

- A rich text-style editor inside a normal ComfyUI node
- Colored chips for supported MiniMax H3 prompt syntax
- Quick-insert buttons for common prompt tokens
- An **Insert speech** button that creates a complete speech block
- Adjustable prompt text size from 9 px to 22 px
- Character count
- Correct prompt content when duplicating or copying the node
- No Python dependencies, JavaScript packages, models, or external services

## Supported chips

| Raw prompt text | What the editor shows |
| --- | --- |
| `<Picture 1>` or `Picture 1` | `Picture 1 Chip` |
| `[Shot 1]` | `Shot 1 Chip` |
| `(S1)` | `S1 Chip` |
| `(S1,S2)` | `S1,S2 Chip` |
| dwdw<d> | `Opening quotation mark Chip` |
| `</d>` | `Closing quotation mark Chip` |
| `[English]` | `English Chip` |
| `<scenetrans>` | `Transition Chip` |
| `<cutoff>` | `Cutoff Chip` |
| `00:00.000` | `Timecode Chip` |
| `N/A` | `N/A Chip` |

The editor also gives a lighter treatment to these main H3 fields:

```text
integrated_multimodal_description:
overall_soundscape:
non_diegetic_music:
```

Other text stays as normal editable text.

## Quick-insert controls

The buttons above the editor insert their raw prompt syntax at the current caret position.

The **Insert speech** button inserts:

```text
(S1)<d></d>
```

It then places the caret between `<d>` and `</d>` so you can start typing the dialogue immediately.

## Installation

### Option 1: Download the repository

1. Download this repository as a ZIP file.
2. Extract it into your ComfyUI `custom_nodes` folder.
3. Make sure the final folder is named:

   ```text
   ComfyUI/custom_nodes/ComfyUI_MiniMaxH3_PrettyPrompt
   ```

4. Restart ComfyUI.
5. Hard-refresh the browser with `Ctrl + F5` if ComfyUI was already open.

### Option 2: Clone with Git

Open a terminal inside `ComfyUI/custom_nodes` and run:

```bash
git clone https://github.com/YOUR_USERNAME/ComfyUI_MiniMaxH3_PrettyPrompt.git
```

## How to use it

1. Open ComfyUI.
2. Add **MiniMax H3 Pretty Prompt** from the `prompt/H3` category.
3. Write or paste your MiniMax H3 prompt into the editor.
4. Use the buttons at the top to insert common prompt tokens.
5. Connect the node's `prompt` output to any node that accepts the finished prompt string.

New nodes start with the default recommended MiniMax H3 FL2VA prompt structure:

```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.

integrated_multimodal_description:

overall_soundscape:

non_diegetic_music:
```

You can resize the node like any other ComfyUI node.

## How was it made?

The node has two small parts:

1. A Python node passes the prompt through without changing it.
2. A browser extension replaces the normal prompt box with a custom visual editor.

The visual editor reads the plain prompt and looks for supported MiniMax H3 syntax. When it finds a known token, it draws a colored chip in its place.

Each chip remembers the exact raw text behind it. This means ComfyUI still saves and sends a normal prompt string. The colors, emojis, and chip shapes are only a visual layer in the browser.

When a workflow is loaded, the editor reads the saved plain text and builds the chips again.

## Troubleshooting

### A token stays as plain text

The syntax must match a supported form. For example:

```text
[Shot 1]
<Picture 1>
(S1)
<scenetrans>
```

Unsupported or incomplete tags remain normal text.

## Notes

This is an independent community project. MiniMax, H3, Seedance, and ComfyUI belong to their respective owners. Seedance 2 is mentioned only as visual inspiration for the editing experience.

"""MiniMax H3 rich prompt editor for ComfyUI."""

from comfy_api.latest import ComfyExtension, io


DEFAULT_H3_PROMPT = """For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.


integrated_multimodal_description:


overall_soundscape:


non_diegetic_music:"""


class MiniMaxH3PrettyPrompt(io.ComfyNode):
    """Pass a prompt through unchanged; the rich presentation lives in the browser."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="MiniMaxH3PrettyPrompt",
            display_name="MiniMax H3 Pretty Prompt",
            category="prompt/H3",
            description=(
                "Edit a MiniMax H3 prompt with visual chips for <Picture N> references. "
                "The output is always the original plain text."
            ),
            inputs=[
                io.String.Input(
                    "prompt",
                    multiline=True,
                    default=DEFAULT_H3_PROMPT,
                )
            ],
            outputs=[io.String.Output(display_name="prompt")],
        )

    @classmethod
    def execute(cls, prompt: str) -> io.NodeOutput:
        return io.NodeOutput(prompt)


class RichH3PromptExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [MiniMaxH3PrettyPrompt]


async def comfy_entrypoint() -> RichH3PromptExtension:
    return RichH3PromptExtension()


WEB_DIRECTORY = "./web"

__all__ = ["WEB_DIRECTORY", "comfy_entrypoint"]

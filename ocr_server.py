"""
Qari OCR local server
---------------------
Exposes a Gradio interface at http://localhost:7860 so that the Next.js
route at /api/digitize can call POST /api/predict.

Usage:
    pip install gradio transformers torch pillow qwen-vl-utils accelerate
    python ocr_server.py

Set the GRADIO_URL env-var in .env.local if you change the port:
    GRADIO_URL=http://localhost:7860
"""

import os
import uuid
from typing import Any, cast
import torch
import gradio as gr
from PIL import Image
from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
from qwen_vl_utils import process_vision_info

# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------
MODEL_NAME = "oddadmix/Qari-OCR-0.1-VL-2B-Instruct"
MAX_TOKENS = 2000

device = "cuda" if torch.cuda.is_available() else "cpu"
torch_dtype = torch.float16 if device == "cuda" else torch.float32

print(f"Loading model on {device} …")

model: Qwen2VLForConditionalGeneration = (
    Qwen2VLForConditionalGeneration.from_pretrained(
        MODEL_NAME,
        torch_dtype=torch_dtype,
        device_map=device,
    )
)
processor = AutoProcessor.from_pretrained(MODEL_NAME)

print("Model ready.")

# ---------------------------------------------------------------------------
# OCR function
# ---------------------------------------------------------------------------
PROMPT = (
    "Below is the image of one page of a document, as well as some raw textual "
    "content that was previously extracted for it. Just return the plain text "
    "representation of this document as if you were reading it naturally. "
    "Do not hallucinate."
)


def perform_ocr(image) -> str:
    """
    Parameters
    ----------
    image : np.ndarray
        RGB image array provided by Gradio after decoding the incoming
        data-URL (sent by the Next.js route).

    Returns
    -------
    str
        Extracted text.
    """
    pil_image = Image.fromarray(image)
    tmp_path = f"{uuid.uuid4()}.png"
    pil_image.save(tmp_path)

    try:
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": f"file://{os.path.abspath(tmp_path)}"},
                    {"type": "text", "text": PROMPT},
                ],
            }
        ]

        text = processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        image_inputs, video_inputs, _ = process_vision_info(messages)
        inputs = processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt",
        ).to(device)

        generated_ids = cast(Any, model).generate(
            **inputs,
            max_new_tokens=MAX_TOKENS,
            use_cache=True,
        )
        generated_ids_trimmed = [
            out_ids[len(in_ids) :]
            for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
        ]
        output_text = processor.batch_decode(
            generated_ids_trimmed,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )[0]
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    print(output_text)
    return output_text


# ---------------------------------------------------------------------------
# Gradio interface
# ---------------------------------------------------------------------------
iface = gr.Interface(
    fn=perform_ocr,
    inputs=gr.Image(type="numpy"),
    outputs=gr.Textbox(),
    title="Qari Arabic OCR",
    description="Upload an image to extract Arabic text.",
)

if __name__ == "__main__":
    port = int(os.environ.get("OCR_PORT", 7860))
    # share=False keeps the server local; queue=False matches the original behaviour.
    iface.launch(server_port=port, share=False)

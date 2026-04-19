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
import time
from typing import Any, cast
import torch
import gradio as gr
from PIL import Image
from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
from qwen_vl_utils import process_vision_info

# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Model loading (Corrected for Adapter/LoRA)
# ---------------------------------------------------------------------------
BASE_MODEL = "Qwen/Qwen2-VL-2B-Instruct"
ADAPTER_MODEL = "oddadmix/Qari-OCR-0.1-VL-2B-Instruct"
MAX_TOKENS = 2000

device = "cuda" if torch.cuda.is_available() else "cpu"
torch_dtype = torch.float16 if device == "cuda" else torch.float32

print(f"\n[INFO] Initializing: Loading Base Model ({BASE_MODEL})...")

try:
    # 1. Load the Base Model
    model = Qwen2VLForConditionalGeneration.from_pretrained(
        BASE_MODEL, torch_dtype=torch_dtype, device_map=device, trust_remote_code=True
    )

    # 2. Load the Arabic OCR Adapter weights onto the base model
    print(f"[INFO] Applying Arabic OCR Adapter ({ADAPTER_MODEL})...")
    model.load_adapter(ADAPTER_MODEL)

    # 3. Load the Processor (from the adapter or base)
    processor = AutoProcessor.from_pretrained(ADAPTER_MODEL, trust_remote_code=True)

    print("[SUCCESS] Full model with Arabic OCR weights is ready.")

except Exception as e:
    print(f"\n[ERROR] Loading failed: {e}")
    print("Ensure you have 'peft' installed: pip install peft")
    exit(1)

print("[SUCCESS] Model is ready and listening for requests.\n")

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
    # 1. Tracking Request Start
    request_id = str(uuid.uuid4())[:8]
    start_time = time.time()
    print(f"--- [NEW REQUEST: {request_id}] ---")

    if image is None:
        print(f"[ERROR: {request_id}] No image received.")
        return "Error: No image provided."

    # 2. Save temporary file
    pil_image = Image.fromarray(image)
    tmp_path = f"{uuid.uuid4()}.png"
    pil_image.save(tmp_path)
    print(f"[{request_id}] Image processed. Saved to temporary path: {tmp_path}")

    try:
        print(f"[{request_id}] Preparing model inputs...")
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
        # qwen_vl_utils changed return shape across versions:
        # some return (images, videos), others return (images, videos, metadata).
        vision_info = cast(Any, process_vision_info(messages))
        if not isinstance(vision_info, (tuple, list)):
            raise ValueError("process_vision_info did not return a tuple/list")

        if len(vision_info) == 2:
            image_inputs, video_inputs = vision_info[0], vision_info[1]
        elif len(vision_info) == 3:
            image_inputs, video_inputs = vision_info[0], vision_info[1]
        else:
            raise ValueError(
                f"Unexpected process_vision_info return size: {len(vision_info)}"
            )
        inputs = processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt",
        ).to(device)

        # 3. Generation Logging
        print(f"[{request_id}] Starting inference (this may take a moment)...")
        generated_ids = cast(Any, model).generate(
            **inputs,
            max_new_tokens=MAX_TOKENS,
            use_cache=True,
        )

        print(f"[{request_id}] Decoding output...")
        generated_ids_trimmed = [
            out_ids[len(in_ids) :]
            for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
        ]
        output_text = processor.batch_decode(
            generated_ids_trimmed,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )[0]

        # 4. Success Logging
        duration = time.time() - start_time
        print(f"[{request_id}] SUCCESS in {duration:.2f} seconds.")

    except Exception as e:
        print(f"[CRITICAL ERROR: {request_id}] {str(e)}")
        output_text = f"An error occurred during OCR: {str(e)}"

    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
            print(f"[{request_id}] Cleaned up temp file.")

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
    print(f"[INFO] Launching Gradio server on port {port}...")
    iface.launch(server_port=port, share=False)

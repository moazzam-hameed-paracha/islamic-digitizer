import base64
import asyncio
import io
import time
import torch
from threading import Thread
from PIL import Image
from typing import Any, cast
from fastapi import HTTPException
from transformers import (
    Qwen2VLForConditionalGeneration,
    AutoProcessor,
    TextIteratorStreamer,
)

# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------
BASE_MODEL = "Qwen/Qwen2-VL-2B-Instruct"
ADAPTER_MODEL = "NAMAA-Space/Qari-OCR-0.2.2.1-VL-2B-Instruct"
MAX_TOKENS = 2000

# Qwen2-VL image-size bounds (in pixels, multiples of 28).
# Larger MAX → better accuracy on dense pages, slower inference.
MIN_PIXELS = 256 * 28 * 28      # ~200K px
MAX_PIXELS = 1280 * 28 * 28     # ~1M px — good sweet spot for full pages

device = "cuda" if torch.cuda.is_available() else "cpu"
torch_dtype = torch.float16 if device == "cuda" else torch.float32

try:
    model = Qwen2VLForConditionalGeneration.from_pretrained(
        BASE_MODEL, torch_dtype=torch_dtype, device_map=device, trust_remote_code=True
    )
    model.load_adapter(ADAPTER_MODEL)
    model.eval()  # disable dropout, etc.
    processor = AutoProcessor.from_pretrained(
        ADAPTER_MODEL,
        trust_remote_code=True,
        min_pixels=MIN_PIXELS,
        max_pixels=MAX_PIXELS,
    )
    print("[SUCCESS] Model Ready.")
except Exception as e:
    print(f"[ERROR] Loading failed: {e}")
    exit(1)


# Better prompt: explicit about structure, paragraphs, headers, and what NOT to do.
PROMPT = (
    "You are an expert Arabic OCR system. Transcribe the text in this document "
    "image exactly as it appears.\n\n"
    "Rules:\n"
    "- Output ONLY the text from the document — no commentary, no translation, "
    "no explanations.\n"
    "- Preserve the original paragraph structure: insert a blank line between "
    "separate paragraphs.\n"
    "- Place headers, titles, and centered text on their own lines, separated "
    "from body text by a blank line.\n"
    "- Preserve diacritics (tashkeel) exactly as they appear.\n"
    "- Preserve punctuation, quotation marks, and Quranic verse markers.\n"
    "- Ignore decorative borders, page numbers, and ornamental patterns.\n"
    "- If a word is unclear, transcribe your best guess — do not invent words "
    "or skip sections."
)


async def _run_ocr(data_url: str, request_id: str) -> dict:
    """Core OCR logic. Returns result dict or raises HTTPException."""
    start_time = time.time()

    # 1. Decode Base64
    try:
        if "," in data_url:
            _, encoded = data_url.split(",", 1)
        else:
            encoded = data_url
        image_data = base64.b64decode(encoded)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Base64 string.")

    # 2. Load image — pass PIL Image directly to the processor (no disk I/O).
    try:
        img = Image.open(io.BytesIO(image_data)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image preprocessing failed: {e}")

    print(f"--- [NEW REQUEST: {request_id}] image={img.size} ---", flush=True)

    try:
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": img},  # PIL Image — no temp file
                    {"type": "text", "text": PROMPT},
                ],
            }
        ]

        text = processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )

        # Build inputs directly — no need for qwen_vl_utils when passing PIL Images.
        inputs = processor(
            text=[text],
            images=[img],
            padding=True,
            return_tensors="pt",
        ).to(device)

        streamer = TextIteratorStreamer(
            processor.tokenizer, skip_special_tokens=True, skip_prompt=True
        )
        generation_error: Exception | None = None
        generation_start = time.time()

        # Generation kwargs tuned for OCR:
        # - do_sample=False  → greedy decoding (deterministic, no hallucination from sampling)
        # - repetition_penalty=1.05 → small nudge against repeating phrases (common Qwen2-VL failure)
        # - num_beams=1 → greedy (beam search rarely helps OCR and is much slower)
        gen_kwargs = dict(
            **inputs,
            max_new_tokens=MAX_TOKENS,
            do_sample=False,
            num_beams=1,
            repetition_penalty=1.05,
            use_cache=True,
            streamer=streamer,
            pad_token_id=processor.tokenizer.pad_token_id,
            eos_token_id=processor.tokenizer.eos_token_id,
        )

        def run_generation() -> None:
            nonlocal generation_error
            try:
                with torch.inference_mode():
                    cast(Any, model).generate(**gen_kwargs)
            except Exception as err:
                generation_error = err

        generation_thread = Thread(target=run_generation, daemon=True)
        generation_thread.start()

        output_tokens: list[str] = []
        token_count = 0
        for token in streamer:
            output_tokens.append(token)
            token_count += 1
            elapsed = time.time() - generation_start
            tok_per_sec = token_count / elapsed if elapsed > 0 else 0.0
            print(
                f"\r[{request_id}]  generating  {token_count} tokens  "
                f"{tok_per_sec:.1f} tok/s  {elapsed:.1f}s",
                end="",
                flush=True,
            )
            if token_count % 10 == 0:
                await asyncio.sleep(0)

        generation_thread.join()
        if generation_error is not None:
            print(flush=True)
            raise generation_error

        generation_duration = time.time() - generation_start
        tok_per_sec = token_count / generation_duration if generation_duration > 0 else 0.0
        print(
            f"\r[{request_id}]  done        {token_count} tokens  "
            f"{tok_per_sec:.1f} tok/s  {generation_duration:.1f}s  ✓",
            flush=True,
        )

        output_text = "".join(output_tokens).strip()
        max_tokens_reached = token_count >= MAX_TOKENS
        duration = time.time() - start_time

        if max_tokens_reached:
            print(
                f"[{request_id}] MAX TOKENS REACHED ({token_count}/{MAX_TOKENS})",
                flush=True,
            )
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "MAX_TOKENS_REACHED",
                    "message": f"Output truncated at {MAX_TOKENS} tokens.",
                    "tokenCount": token_count,
                    "maxTokens": MAX_TOKENS,
                },
            )

        return {
            "id": request_id,
            "text": output_text,
            "duration": round(duration, 2),
            "tokenCount": token_count,
            "maxTokens": MAX_TOKENS,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[CRITICAL ERROR: {request_id}] {e}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))
import base64
import asyncio
import io
import os
import uuid
import time
import torch
from threading import Thread
from PIL import Image
from typing import Any, cast
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import Qwen2VLForConditionalGeneration, AutoProcessor, TextIteratorStreamer
from qwen_vl_utils import process_vision_info

app = FastAPI(title="Qari OCR API")

# --- Schema for JSON Payload ---
class OCRRequest(BaseModel):
    dataUrl: str  # This matches your JSON.stringify({ dataUrl })

# ---------------------------------------------------------------------------
# Model loading (Kept same as your original)
# ---------------------------------------------------------------------------
BASE_MODEL = "Qwen/Qwen2-VL-2B-Instruct"
ADAPTER_MODEL = "oddadmix/Qari-OCR-0.1-VL-2B-Instruct"
MAX_TOKENS = 2000

device = "cuda" if torch.cuda.is_available() else "cpu"
torch_dtype = torch.float16 if device == "cuda" else torch.float32

try:
    model = Qwen2VLForConditionalGeneration.from_pretrained(
        BASE_MODEL, torch_dtype=torch_dtype, device_map=device, trust_remote_code=True
    )
    model.load_adapter(ADAPTER_MODEL)
    processor = AutoProcessor.from_pretrained(ADAPTER_MODEL, trust_remote_code=True)
    print("[SUCCESS] Model Ready.")
except Exception as e:
    print(f"[ERROR] Loading failed: {e}")
    exit(1)

PROMPT = (
    "Below is the image of one page of a document. Just return the plain text "
    "representation of this document as if you were reading it naturally. "
    "Do not hallucinate."
)


def log_progress(request_id: str, start_time: float, percent: int, stage: str) -> None:
    elapsed = time.time() - start_time
    print(f"[{request_id}] {percent:>3}% | {stage} | {elapsed:.2f}s", flush=True)


# ---------------------------------------------------------------------------
# API Endpoint
# ---------------------------------------------------------------------------

@app.post("/api/digitize")
async def digitize_image(payload: OCRRequest):
    request_id = str(uuid.uuid4())[:8]
    start_time = time.time()
    
    # 1. Decode Base64 string
    try:
        # Splits 'data:image/png;base64,iVBOR...' into metadata and actual data
        if "," in payload.dataUrl:
            header, encoded = payload.dataUrl.split(",", 1)
        else:
            encoded = payload.dataUrl

        image_data = base64.b64decode(encoded)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Base64 string.")

    # 2. Convert to monochrome (grayscale → back to RGB so model pipeline stays consistent)
    try:
        img = Image.open(io.BytesIO(image_data)).convert("L").convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        image_data = buf.getvalue()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image preprocessing failed: {e}")

    # 3. Save to temporary file (Required for file:// URI)
    tmp_path = f"temp_{request_id}.png"
    with open(tmp_path, "wb") as f:
        f.write(image_data)

    try:
        print(f"--- [NEW REQUEST: {request_id}] ---", flush=True)
        
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": f"file://{os.path.abspath(tmp_path)}"},
                    {"type": "text", "text": PROMPT},
                ],
            }
        ]

        # --- Inference Logic ---
        text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        vision_info = cast(Any, process_vision_info(messages))
        
        image_inputs, video_inputs = vision_info[0], vision_info[1]

        inputs = processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt",
        ).to(device)

        streamer = TextIteratorStreamer(processor.tokenizer, skip_special_tokens=True, skip_prompt=True)
        generation_error: Exception | None = None
        generation_start = time.time()

        def run_generation() -> None:
            nonlocal generation_error
            try:
                cast(Any, model).generate(
                    **inputs,
                    max_new_tokens=MAX_TOKENS,
                    use_cache=True,
                    streamer=streamer,
                )
            except Exception as err:
                generation_error = err

        generation_thread = Thread(target=run_generation, daemon=True)
        generation_thread.start()

        output_tokens: list[str] = []
        token_count = 0
        for token in streamer:
            output_tokens.append(token)
            token_count += 1
            elapsed_generation = time.time() - generation_start
            tok_per_sec = token_count / elapsed_generation if elapsed_generation > 0 else 0.0
            print(
                f"\r[{request_id}]  generating  {token_count} tokens  {tok_per_sec:.1f} tok/s  {elapsed_generation:.1f}s elapsed",
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
            f"\r[{request_id}]  done        {token_count} tokens  {tok_per_sec:.1f} tok/s  {generation_duration:.1f}s  ✓",
            flush=True,
        )
        output_text = "".join(output_tokens)
        max_tokens_reached = token_count >= MAX_TOKENS

        duration = time.time() - start_time

        if max_tokens_reached:
            print(f"[{request_id}] MAX TOKENS REACHED ({token_count}/{MAX_TOKENS}), aborting.", flush=True)
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "MAX_TOKENS_REACHED",
                    "message": f"Output was truncated: the model hit the {MAX_TOKENS}-token limit before finishing.",
                    "tokenCount": token_count,
                    "maxTokens": MAX_TOKENS,
                }
            )

        return {
            "id": request_id,
            "text": output_text,
            "duration": round(duration, 2),
            "tokenCount": token_count,
            "maxTokens": MAX_TOKENS,
        }

    except Exception as e:
        print(f"[CRITICAL ERROR: {request_id}] {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
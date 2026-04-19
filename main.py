import base64
import os
import uuid
import time
import torch
from typing import Any, cast
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
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

    # 2. Save to temporary file (Required for file:// URI)
    tmp_path = f"temp_{request_id}.png"
    with open(tmp_path, "wb") as f:
        f.write(image_data)

    try:
        print(f"--- [NEW REQUEST: {request_id}] ---")
        
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

        duration = time.time() - start_time
        return {
            "id": request_id,
            "text": output_text,
            "duration": round(duration, 2)
        }

    except Exception as e:
        print(f"[CRITICAL ERROR] {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
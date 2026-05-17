import modal

app = modal.App("qari-ocr")

# Shared job store — persists across all containers so any gateway replica
# can answer a poll for a job started by any other replica.
job_store = modal.Dict.from_name("ocr-jobs", create_if_missing=True)

# Persistent volume caches HuggingFace model weights (~4 GB).
volume = modal.Volume.from_name("qari-ocr-models", create_if_missing=True)

# Heavy image: PyTorch (CUDA 12.6) + all ML deps + main.py
gpu_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "torch",
        "torchvision",
        "torchaudio",
        extra_index_url="https://download.pytorch.org/whl/cu126",
    )
    .pip_install(
        "transformers>=5.5.4",
        "peft>=0.19.1",
        "qwen-vl-utils>=0.0.14",
        "pillow>=12.2.0",
        "fastapi>=0.136.0",
        "accelerate>=1.13.0",
        "python-multipart>=0.0.26",
    )
    .add_local_python_source("main")
)

# Lightweight image: just enough to run the FastAPI gateway (no torch/CUDA).
gateway_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("fastapi>=0.136.0", "uvicorn>=0.44.0")
)


@app.function(
    image=gpu_image,
    gpu="T4",
    volumes={"/cache": volume},
    timeout=300,
)
def run_ocr_job(job_id: str, data_url: str) -> None:
    """Runs OCR inference and writes the result to job_store.

    Spawned as a fire-and-forget Modal function so it runs to completion
    independently of any HTTP container lifecycle.
    """
    import asyncio
    import os
    from fastapi import HTTPException

    os.environ["HF_HOME"] = "/cache"
    from orc_modal.main import _run_ocr  # triggers model loading on first import

    try:
        result = asyncio.run(_run_ocr(data_url, job_id))
        job_store[job_id] = {"status": "done", **result}
    except HTTPException as exc:
        detail = exc.detail
        if isinstance(detail, dict) and detail.get("code") == "MAX_TOKENS_REACHED":
            job_store[job_id] = {
                "status": "error",
                "error": "MAX_TOKENS_REACHED",
                "tokenCount": detail.get("tokenCount"),
                "maxTokens": detail.get("maxTokens"),
            }
        else:
            job_store[job_id] = {"status": "error", "error": str(detail)}
    except Exception as exc:
        job_store[job_id] = {"status": "error", "error": str(exc)}


@app.function(image=gateway_image, min_containers=0)
@modal.asgi_app()
def gateway() -> object:
    """Lightweight HTTP gateway — no GPU required.

    POST /api/digitize  → spawns run_ocr_job, returns {jobId} immediately
    GET  /api/digitize/{jobId} → returns job status / result from job_store
    """
    import uuid
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel

    gw = FastAPI(title="Qari OCR Gateway")

    class OCRRequest(BaseModel):
        dataUrl: str

    @gw.post("/api/digitize")
    async def submit_job(payload: OCRRequest):
        job_id = str(uuid.uuid4())[:8]
        job_store[job_id] = {"status": "pending"}
        run_ocr_job.spawn(job_id, payload.dataUrl)
        return {"jobId": job_id}

    @gw.get("/api/digitize/{job_id}")
    async def poll_job(job_id: str):
        result = job_store.get(job_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Job not found")
        return result

    return gw

import modal

app = modal.App("qari-ocr")

# ---------------------------------------------------------------------------
# Persistent storage
# ---------------------------------------------------------------------------
# Shared job store — persists across all containers.
job_store = modal.Dict.from_name("ocr-jobs", create_if_missing=True)

# Persistent volume caches HuggingFace model weights (~4 GB).
volume = modal.Volume.from_name("qari-ocr-models", create_if_missing=True)

# ---------------------------------------------------------------------------
# Images
# ---------------------------------------------------------------------------
HF_CACHE = "/cache"

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
        "pillow>=12.2.0",
        "fastapi>=0.136.0",
        "accelerate>=1.13.0",
        "python-multipart>=0.0.26",
    )
    # Bake cache path into the image so transformers picks it up on import.
    .env(
        {
            "HF_HOME": HF_CACHE,
            "TRANSFORMERS_CACHE": HF_CACHE,
            "HF_XET_HIGH_PERFORMANCE": "1",  # faster model downloads
        }
    )
    .add_local_python_source("ocr")
)

gateway_image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "fastapi>=0.136.0", "uvicorn>=0.44.0"
)


# ---------------------------------------------------------------------------
# OCR worker — class-based so model loads ONCE per container
# ---------------------------------------------------------------------------
@app.cls(
    image=gpu_image,
    gpu="A10G",
    volumes={HF_CACHE: volume},
    timeout=300,
    scaledown_window=5,  # keep warm for 5 secs after last request
    min_containers=0,  # set to 1 if you want zero cold starts (costs more)
)
@modal.concurrent(max_inputs=2)  # 2 concurrent requests share one warm GPU
class OCRWorker:
    @modal.enter()
    def load(self) -> None:
        """Runs ONCE when container starts. Loads model into GPU memory."""
        # Import here so module load doesn't happen on the gateway image.
        import ocr  # noqa: F401 — triggers model load

        print("[OCRWorker] Model loaded and ready", flush=True)

    @modal.method()
    def run(self, job_id: str, data_url: str) -> None:
        """Run OCR and write result to shared job_store."""
        import asyncio
        from fastapi import HTTPException
        from ocr import _run_ocr

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


# ---------------------------------------------------------------------------
# Gateway — lightweight HTTP layer, no GPU
# ---------------------------------------------------------------------------
@app.function(image=gateway_image, min_containers=0)
@modal.asgi_app()
def gateway() -> object:
    import uuid
    import time
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel

    gw = FastAPI(title="Qari OCR Gateway")

    class OCRRequest(BaseModel):
        dataUrl: str

    @gw.post("/api/digitize")
    async def submit_job(payload: OCRRequest):
        job_id = str(uuid.uuid4())  # full UUID — no collision risk
        await job_store.put.aio(
            job_id,
            {"status": "pending", "createdAt": time.time()},
        )
        try:
            await OCRWorker().run.spawn.aio(job_id, payload.dataUrl)  # type: ignore
        except Exception as exc:
            await job_store.put.aio(job_id, {"status": "error", "error": str(exc)})
        return {"jobId": job_id}

    @gw.get("/api/digitize/{job_id}")
    async def poll_job(job_id: str):
        result = await job_store.get.aio(job_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Job not found")

        # Mark stuck jobs (pending > 5 min) as errored — guards against
        # crashed worker containers that never wrote a final state.
        if result.get("status") == "pending":
            created = result.get("createdAt", 0)
            if time.time() - created > 300:
                result = {"status": "error", "error": "Job timed out"}
                await job_store.pop.aio(job_id)
                return result
            return result

        # Terminal state — clean up.
        await job_store.pop.aio(job_id)
        return result

    return gw

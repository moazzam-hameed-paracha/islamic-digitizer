import modal

app = modal.App("qari-ocr")

# Install PyTorch (CUDA 12.6) first, then all other deps separately so pip
# resolves the CUDA index before the rest of the packages.
image = (
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
        "uvicorn>=0.44.0",
        "accelerate>=1.13.0",
        "python-multipart>=0.0.26",
    )
    .add_local_python_source("main")
)

# Persistent volume stores the HuggingFace model weights (~4 GB).
# Created on first deploy; survives container restarts so weights
# are never re-downloaded after the first cold start.
volume = modal.Volume.from_name("qari-ocr-models", create_if_missing=True)


@app.function(
    image=image,
    gpu="T4",
    volumes={"/cache": volume},
    timeout=300,
    min_containers=0,
)
@modal.asgi_app()
def fastapi_app():
    import os
    # Point HuggingFace at the persistent volume so weights are cached
    # between container restarts instead of being re-downloaded each time.
    os.environ["HF_HOME"] = "/cache"
    from main import app as _app
    return _app

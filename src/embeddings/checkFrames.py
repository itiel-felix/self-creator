import torch
import open_clip
from PIL import Image
import sys
import json
import numpy as np
import os
import hashlib
import time
import base64
from io import BytesIO

CACHE_DIR = "cache/text_embeddings"

def log(msg):
    print(f"PYTHON------> {msg}", file=sys.stderr, flush=True)

def _cache_path_for_query(q: str) -> str:
    key = hashlib.md5(q.encode("utf-8")).hexdigest()
    return os.path.join(CACHE_DIR, f"{key}.npy")

def load_text_embedding_from_cache(q: str):
    path = _cache_path_for_query(q)
    if os.path.exists(path):
        return np.load(path).astype(np.float32)
    return None

def save_text_embedding_to_cache(q: str, vec: np.ndarray):
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = _cache_path_for_query(q)
    np.save(path, vec.astype(np.float32))


# ---------------------
# LOAD MODEL ONCE
# ---------------------

start_time = time.time()

device = "mps" if torch.backends.mps.is_available() else "cpu"

model, _, preprocess = open_clip.create_model_and_transforms(
    "ViT-B-32",
    pretrained="laion2b_s34b_b79k",
)

tokenizer = open_clip.get_tokenizer("ViT-B-32")

model = model.to(device)
model.eval()

log(f"Model loaded in {time.time() - start_time:.2f}s")

print("READY", flush=True)


# ---------------------
# JOB FUNCTION
# ---------------------

def run_job(job):

    queries = job["queries"]
    type = job.get("type", "frames")
    frame_images_b64 = job.get("frameImagesBase64")

    if isinstance(queries, str):
        queries = [queries]

    # frames y thumbnails: solo JPEG en memoria (Node manda frameImagesBase64). Sin carpetas en disco.
    if type == "frames":
        threshold = float(os.getenv("THRESHOLD_SIMILARITY", 0.25))
    elif type == "thumbnails":
        threshold = float(os.getenv("THRESHOLD_SIMILARITY_THUMBNAIL", 0.35))
    else:
        raise ValueError(f"type desconocido: {type}")

    if not frame_images_b64:
        raise ValueError(
            f"type={type} requiere frameImagesBase64 (imágenes JPEG en memoria desde Node)."
        )

    # ----------------
    # TEXT EMBEDDINGS
    # ----------------

    cached_vecs = {}
    missing_queries = []
    missing_indices = []

    for idx, q in enumerate(queries):
        vec = load_text_embedding_from_cache(q)

        if vec is not None:
            cached_vecs[idx] = vec
        else:
            missing_queries.append(q)
            missing_indices.append(idx)

    text_vecs = [None] * len(queries)

    for idx, vec in cached_vecs.items():
        text_vecs[idx] = vec

    if missing_queries:

        text_tokens = tokenizer(missing_queries).to(device)

        with torch.no_grad():
            log("Encoding text batch...")
            text_features = model.encode_text(text_tokens)
            text_features /= text_features.norm(dim=-1, keepdim=True)

        text_features_np = text_features.cpu().numpy().astype(np.float32)

        for i, q_idx in enumerate(missing_indices):
            vec = text_features_np[i]
            text_vecs[q_idx] = vec
            save_text_embedding_to_cache(queries[q_idx], vec)

    text_vecs = np.stack(text_vecs, axis=0)

    # ----------------
    # FRAME PROCESSING
    # ----------------

    batch_size = int(os.getenv("CLIP_BATCH_SIZE", "32"))

    if type == "frames":
        frame_files = [f"frame_{i+1:04d}.jpg" for i in range(len(frame_images_b64))]
    else:
        frame_files = [f"thumbnail_{i+1:04d}.jpg" for i in range(len(frame_images_b64))]

    results = []

    for start_idx in range(0, len(frame_files), batch_size):

        batch_files = frame_files[start_idx:start_idx + batch_size]

        images = []

        for j, f in enumerate(batch_files):

            raw = base64.b64decode(frame_images_b64[start_idx + j])
            img = Image.open(BytesIO(raw))

            with img:
                img = img.convert("RGB")
                tensor = preprocess(img)
                images.append(tensor)

        batch = torch.stack(images).to(device)

        with torch.no_grad():

            image_features = model.encode_image(batch)
            image_features /= image_features.norm(dim=-1, keepdim=True)

        image_vecs = image_features.cpu().numpy().astype(np.float32)

        for j, image_vec in enumerate(image_vecs):

            frame_name = batch_files[j]

            sims = np.dot(text_vecs, image_vec)

            best_sim = float(sims.max())

            results.append((frame_name, best_sim))

            if best_sim > threshold:

                log(f"Frame {frame_name} GOOD {best_sim}")

                return [[frame_name, best_sim]]

    results.sort(key=lambda x: x[1], reverse=True)

    return results[:10]


# ---------------------
# WORKER LOOP
# ---------------------

for line in sys.stdin:

    line = line.strip()

    if not line:
        continue

    try:

        job = json.loads(line)

        result = run_job(job)

        print(json.dumps(result), flush=True)

    except Exception as e:

        log(str(e))

        print(json.dumps({"error": str(e)}), flush=True)
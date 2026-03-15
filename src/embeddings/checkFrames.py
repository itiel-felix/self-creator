import torch
import open_clip
from PIL import Image
import sys
import json
import numpy as np
import os
import hashlib
import time

raw_queries = sys.argv[1]
video_id = sys.argv[2]
type = sys.argv[3]
if type == "frames":
    frames_folder = os.path.join(".", "frames", video_id)
elif type == "thumbnails":
    frames_folder = os.path.join(".", "temp", "thumbnails", video_id)

try:
    queries = json.loads(raw_queries)
    if isinstance(queries, str):
        queries = [queries]
except Exception:
    # Fallback: single string
    queries = [raw_queries]

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


start_time = time.time()
device = "mps" if torch.backends.mps.is_available() else "cpu"
model, _, preprocess = open_clip.create_model_and_transforms(
    "ViT-B-32",
    pretrained="laion2b_s34b_b79k",
)
model = model.to(device)
model.eval()
log(f'Model loaded in {time.time() - start_time:.2f}s')

# Encode all queries (5 words) at once; use cache per query
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
    tokenizer = open_clip.get_tokenizer("ViT-B-32")
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
    log(f"Text features batch encoded for {len(missing_queries)} queries in {time.time() - start_time:.2f}s")
else:
    log("All text features loaded from cache")

text_vecs = np.stack(text_vecs, axis=0)  # shape: (num_queries, dim)

if type == "frames":
    threshold = float(os.getenv("THRESHOLD_SIMILARITY", 0.25))
elif type == "thumbnails":
    threshold = float(os.getenv("THRESHOLD_SIMILARITY_THUMBNAIL", 0.35))
results = []

batch_size = int(os.getenv("CLIP_BATCH_SIZE", "32"))
frame_files = sorted(f for f in os.listdir(frames_folder) if f.endswith(".jpg"))

start_time = time.time()
def process_batch(images, start_index, file_names):
    batch = torch.stack(images).to(device)

    with torch.no_grad():
        image_features = model.encode_image(batch)
        image_features /= image_features.norm(dim=-1, keepdim=True)

    image_vecs = image_features.cpu().numpy().astype(np.float32)

    for j, image_vec in enumerate(image_vecs):
        frame_name = file_names[start_index + j]
        # similarity vs each query
        sims = np.dot(text_vecs, image_vec)  # (num_queries,)
        best_sim = float(sims.max())
        log(f"Frame {frame_name} best similarity {best_sim}")
        results.append((frame_name, best_sim))
        if best_sim > threshold:
            log(f"Frame {frame_name} with similarity GOOD {best_sim} found")
            log(f'Time taken: {time.time() - start_time:.2f}s')
            print(json.dumps([[frame_name, best_sim]]), flush=True)
            sys.exit(0)


for start_idx in range(0, len(frame_files), batch_size):
    batch_files = frame_files[start_idx : start_idx + batch_size]
    images = []
    for f in batch_files:
        img = Image.open(os.path.join(frames_folder, f)).convert("RGB")
        tensor = preprocess(img)
        images.append(tensor)
    process_batch(images, start_idx, frame_files)

results.sort(key=lambda x: x[1], reverse=True)
log(f"Total time taken: {time.time() - start_time:.2f}s")
print(json.dumps(results[:10]), flush=True)

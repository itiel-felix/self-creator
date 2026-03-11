import torch
import open_clip
from PIL import Image
import sys
import json
import numpy as np
import os
import hashlib

query = sys.argv[1]
video_id = sys.argv[2]
frames_folder = os.path.join(".", "frames", video_id)

CACHE_DIR = "cache/text_embeddings"

def log(msg):
    print(f'PYTHON------> {msg}', file=sys.stderr, flush=True)

def _cache_path_for_query(q):
    key = hashlib.md5(q.encode("utf-8")).hexdigest()
    return os.path.join(CACHE_DIR, f"{key}.npy")

def load_text_embedding_from_cache(q):
    path = _cache_path_for_query(q)
    if os.path.exists(path):
        return np.load(path).astype(np.float32)
    return None

def save_text_embedding_to_cache(q, vec):
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = _cache_path_for_query(q)
    np.save(path, vec.astype(np.float32))


import time
start_time = time.time()
device = "mps" if torch.backends.mps.is_available() else "cpu"
model, _, preprocess = open_clip.create_model_and_transforms(
    "ViT-B-32",
    pretrained="laion2b_s34b_b79k"
)
model = model.to(device)
model.eval()

# Try cache first to skip ~1s of encode_text
text_vec = load_text_embedding_from_cache(query)
if text_vec is not None:
    log('Text features loaded from cache')
else:
    tokenizer = open_clip.get_tokenizer("ViT-B-32")
    text = tokenizer([query]).to(device)
    with torch.no_grad():
        log('Encoding text...')
        text_features = model.encode_text(text)
        text_features /= text_features.norm(dim=-1, keepdim=True)
    text_vec = text_features.cpu().numpy().squeeze().astype(np.float32)
    save_text_embedding_to_cache(query, text_vec)
    log(f'Text features, time: {time.time() - start_time:.2f}s')

threshold = float(os.getenv("THRESHOLD_SIMILARITY", 0.25))
results = []

batch_size = int(os.getenv("CLIP_BATCH_SIZE", "32"))
frame_files = sorted(
    f for f in os.listdir(frames_folder)
    if f.endswith(".jpg")
)

def process_batch(images, start_index, file_names):
    batch = torch.stack(images).to(device)

    with torch.no_grad():
        image_features = model.encode_image(batch)
        image_features /= image_features.norm(dim=-1, keepdim=True)

    image_vecs = image_features.cpu().numpy().astype(np.float32)

    for j, image_vec in enumerate(image_vecs):
        frame_name = file_names[start_index + j]
        similarity = round(float(np.dot(image_vec, text_vec)), 3)
        log(f'Frame {frame_name} with similarity {similarity}')
        results.append((frame_name, similarity))
        if similarity > threshold:
            log(f'Frame {frame_name} with similarity GOOD {similarity} found')
            log(f'Time taken: {time.time() - start_time:.2f}s')
            print(json.dumps([[frame_name, similarity]]), flush=True)
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
log(f'Total time taken: {time.time() - start_time:.2f}s')
print(json.dumps(results[:10]), flush=True)

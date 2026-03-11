import torch
import open_clip
from PIL import Image
import sys
import json
import numpy as np
import io
import time
import os
import hashlib

query = sys.argv[1]

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


start_time = time.time()
device = "mps" if torch.backends.mps.is_available() else "cpu"
use_fp16 = device != "cpu"
model, _, preprocess = open_clip.create_model_and_transforms(
    "ViT-B-32",
    pretrained="laion2b_s34b_b79k"
)
model = model.to(device)
if use_fp16:
    model = model.half()
model.eval()

# Try cache first to skip ~1s of encode_text
text_vec = load_text_embedding_from_cache(query)
if text_vec is not None:
    log('Text features loaded from cache')
else:
    tokenizer = open_clip.get_tokenizer("ViT-B-32")
    text = tokenizer([query]).to(device)
    start_time = time.time()
    with torch.inference_mode():
        log('Encoding text...')
        text_features = model.encode_text(text)
        text_features /= text_features.norm(dim=-1, keepdim=True)
    text_vec = text_features.cpu().float().numpy().squeeze().astype(np.float32)
    save_text_embedding_to_cache(query, text_vec)
    log(f'Text features, time: {time.time() - start_time:.2f}s')

threshold = float(os.getenv("THRESHOLD_SIMILARITY", 0.25))
results = []

batch_size = int(os.getenv("CLIP_BATCH_SIZE", "32"))
buffer = b""
images = []
frame_index = 0

def process_batch(images, start_index):
    batch = torch.stack(images).to(device, non_blocking=True)
    if use_fp16:
        batch = batch.half()

    with torch.inference_mode():
        image_features = model.encode_image(batch)
        image_features /= image_features.norm(dim=-1, keepdim=True)

    image_vecs = image_features.cpu().float().numpy().astype(np.float32)

    for j, image_vec in enumerate(image_vecs):
        similarity = round(float(np.dot(image_vec, text_vec)), 3)
        frame_name = f"frame_{start_index + j:04d}.jpg"
        results.append((frame_name, similarity))
        if similarity > threshold:
            log(f'Frame {frame_name} with similarity {similarity} found')
            log(f'Time taken: {time.time() - start_time:.2f}s')
            print(json.dumps([[frame_name, similarity]]), flush=True)
            sys.exit(0)

while True:
    chunk = sys.stdin.buffer.read(65536)
    if not chunk:
        break

    buffer += chunk

    while True:

        start = buffer.find(b'\xff\xd8')
        end = buffer.find(b'\xff\xd9')

        if start != -1 and end != -1 and end > start:

            jpg = buffer[start:end+2]
            buffer = buffer[end+2:]

            img = Image.open(io.BytesIO(jpg)).convert("RGB")
            tensor = preprocess(img)

            images.append(tensor)

            if len(images) == batch_size:
                process_batch(images, frame_index)
                frame_index += batch_size
                images = []

        else:
            break


if images:
    process_batch(images, frame_index)
results.sort(key=lambda x: x[1], reverse=True)
log(f'Total time taken: {time.time() - start_time:.2f}s')
print(json.dumps(results[:10]), flush=True)

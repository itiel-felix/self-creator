import torch
import open_clip
from PIL import Image
import os
import sys
import json
import numpy as np

query = sys.argv[1]
video_id = sys.argv[2]

frames_folder = f"./frames/{video_id}"
device = "mps" if torch.backends.mps.is_available() else "cpu"

model, _, preprocess = open_clip.create_model_and_transforms(
    "ViT-B-32",   
    pretrained="laion2b_s34b_b79k"
)


model = model.to(device)
model.eval()

tokenizer = open_clip.get_tokenizer("ViT-B-32")

text = tokenizer([query]).to(device)

with torch.no_grad():
    text_features = model.encode_text(text)
    text_features /= text_features.norm(dim=-1, keepdim=True)

text_vec = text_features.cpu().numpy().squeeze()
frame_files = sorted([
    f for f in os.listdir(frames_folder)
    if f.endswith(".jpg")
])

threshold = 0.30
results = []

batch_size = 8

for i in range(0, len(frame_files), batch_size):

    batch_files = frame_files[i:i+batch_size]

    images = []

    for frame in batch_files:
        img = preprocess(Image.open(f"{frames_folder}/{frame}").convert("RGB"))
        images.append(img)

    batch = torch.stack(images).to(device)

    with torch.no_grad():
        image_features = model.encode_image(batch)
        image_features /= image_features.norm(dim=-1, keepdim=True)

    image_vecs = image_features.cpu().numpy().astype(np.float32)

    for j, image_vec in enumerate(image_vecs):

        similarity = float(np.dot(image_vec, text_vec))
        frame = batch_files[j]

        results.append((frame, similarity))

        if similarity > threshold:
            print(json.dumps([[frame, similarity]]))
            sys.exit(0)

results.sort(key=lambda x: x[1], reverse=True)
print(json.dumps(results[:10]))
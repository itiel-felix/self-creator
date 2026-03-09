import torch
import open_clip
from PIL import Image
import os
import sys
import numpy as np
import json

video_id = sys.argv[1]

frames_folder = f"./frames/{video_id}"
embeddings_folder = "./embeddings"

os.makedirs(embeddings_folder, exist_ok=True)

device = "cuda" if torch.cuda.is_available() else "cpu"

model, _, preprocess = open_clip.create_model_and_transforms(
    "ViT-B-32",
    pretrained="laion2b_s34b_b79k"
)

model = model.to(device)
model.eval()

frame_files = sorted([
    f for f in os.listdir(frames_folder)
    if f.endswith(".jpg")
])

batch_size = 32
embeddings = []
frame_names = []

for i in range(0, len(frame_files), batch_size):

    batch = frame_files[i:i+batch_size]
    images = []

    for file in batch:
        img = preprocess(Image.open(f"{frames_folder}/{file}"))
        images.append(img)

    images = torch.stack(images).to(device)

    with torch.no_grad():
        image_features = model.encode_image(images)
        image_features /= image_features.norm(dim=-1, keepdim=True)

    embeddings.append(image_features.cpu().numpy())
    frame_names.extend(batch)

embeddings = np.vstack(embeddings)

np.save(f"{embeddings_folder}/{video_id}.npy", embeddings)

with open(f"{embeddings_folder}/{video_id}_frames.json", "w") as f:
    json.dump(frame_names, f)

print(json.dumps({
    "frames_processed": len(frame_names)
}))
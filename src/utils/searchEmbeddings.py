import torch
import open_clip
import numpy as np
import sys
import json

query = sys.argv[1]
video_id = sys.argv[2]

embeddings = np.load(f"./embeddings/{video_id}.npy")

with open(f"./embeddings/{video_id}_frames.json") as f:
    frames = json.load(f)

device = "cuda" if torch.cuda.is_available() else "cpu"

model, _, _ = open_clip.create_model_and_transforms(
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

similarities = (embeddings @ text_features.cpu().numpy().T).squeeze()

scores = []

for i, frame in enumerate(frames):
    score = float(similarities[i])
    scores.append((frame, score))

scores.sort(key=lambda x: x[1], reverse=True)

print(json.dumps(scores[:10]))
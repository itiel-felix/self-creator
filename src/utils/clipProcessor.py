import torch
import open_clip
from PIL import Image
import sys
import os
import json

# "Starting clip processor..."

main_idea = sys.argv[1]
video_id = sys.argv[2]
images_folder = f"./frames/{video_id}"

device = "cuda" if torch.cuda.is_available() else "cpu"

# "Loading model..."
model, _, preprocess = open_clip.create_model_and_transforms(
    "ViT-B-32",
    pretrained="laion2b_s34b_b79k"
)

model = model.to(device)
model.eval()

tokenizer = open_clip.get_tokenizer("ViT-B-32")

# "Encoding text..."
text = tokenizer([main_idea]).to(device)

with torch.no_grad():
    text_features = model.encode_text(text)
    text_features /= text_features.norm(dim=-1, keepdim=True)

image_files = [
    f for f in os.listdir(images_folder)
    if f.endswith(".jpg")
]

batch_size = 32
scores = []

# "Processing images in batches..."

for i in range(0, len(image_files), batch_size):

    batch_files = image_files[i:i+batch_size]
    images = []

    for file in batch_files:
        path = f"{images_folder}/{file}"
        img = preprocess(Image.open(path))
        images.append(img)

    images = torch.stack(images).to(device)

    with torch.no_grad():
        image_features = model.encode_image(images)
        image_features /= image_features.norm(dim=-1, keepdim=True)

        similarity = image_features @ text_features.T

    for j, file in enumerate(batch_files):
        score = similarity[j].item()
        scores.append((file, score))
        # print(f"{file} -> {score}")

print(json.dumps(scores))
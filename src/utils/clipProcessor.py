import torch
import open_clip
from PIL import Image
import sys
import os
import json

print("Starting clip processor...")
main_idea = sys.argv[1]
video_id = sys.argv[2]
images_folder = f"./frames/{video_id}"

print(f"Processing main idea: {main_idea} for video: {video_id}")
print(f"Images folder: {images_folder}")



print("Loading model...")
model, _, preprocess = open_clip.create_model_and_transforms(
    "ViT-B-32",
    pretrained="laion2b_s34b_b79k"
)
print("Model loaded")


tokenizer = open_clip.get_tokenizer("ViT-B-32")
scores = []

print("Tokenizing main idea...")
text = tokenizer([main_idea])
print("Main idea tokenized")

print("Encoding text features...")
with torch.no_grad():
    text_features = model.encode_text(text)
print("Text features encoded")

print("Processing images...")
for image_file in os.listdir(images_folder):
    if image_file.endswith(".jpg"):

        image_path = f"{images_folder}/{image_file}"
        image = preprocess(Image.open(image_path)).unsqueeze(0)

        with torch.no_grad():
            image_features = model.encode_image(image)

        similarity = torch.nn.functional.cosine_similarity(
            image_features,
            text_features
        ).item()

        scores.append((image_file, similarity))
        print(f"Image {image_file} processed with similarity: {similarity}")
print("Images processed")

print("Saving scores...")
print(json.dumps(scores))
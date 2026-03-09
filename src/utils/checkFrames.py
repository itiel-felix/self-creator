# librerías necesarias
import torch                    # para usar PyTorch y correr el modelo en CPU o GPU
import open_clip                # implementación open source de CLIP
from PIL import Image           # para abrir imágenes
import os                       # para interactuar con archivos y carpetas
import sys                      # para leer argumentos desde la terminal
import json                     # para imprimir resultados en formato JSON
import numpy as np              # para operaciones numéricas (similaridad vectorial)

# argumento 1: texto que queremos buscar en los frames
query = sys.argv[1]

# argumento 2: id del video (nombre de la carpeta de frames)
video_id = sys.argv[2]

# carpeta donde están los frames extraídos del video
frames_folder = f"./frames/{video_id}"

# decidir si usar GPU o CPU
device = "mps" if torch.backends.mps.is_available() else "cpu"

# cargar el modelo CLIP y el preprocesamiento de imagen
model, _, preprocess = open_clip.create_model_and_transforms(
    "ViT-B-32",                     # arquitectura del modelo
    pretrained="laion2b_s34b_b79k"  # pesos entrenados en dataset LAION
)

# mover el modelo al dispositivo (GPU o CPU)
model = model.to(device)

# poner el modelo en modo evaluación (no entrenamiento)
model.eval()

# cargar tokenizer que convierte texto a tokens entendibles por el modelo
tokenizer = open_clip.get_tokenizer("ViT-B-32")

# convertir el texto query a tokens
text = tokenizer([query]).to(device)

# desactivar gradientes para ahorrar memoria y acelerar inferencia
with torch.no_grad():

    # generar embedding vectorial del texto
    text_features = model.encode_text(text)

    # normalizar el vector (muy importante para cosine similarity)
    text_features /= text_features.norm(dim=-1, keepdim=True)

# convertir embedding a numpy para poder compararlo fácilmente
text_vec = text_features.cpu().numpy().squeeze()

# obtener lista de frames en la carpeta
frame_files = sorted([
    f for f in os.listdir(frames_folder)
    if f.endswith(".jpg")          # solo imágenes jpg
])

# threshold de similitud
# si un frame supera este valor se considera match
threshold = 0.30

# lista para guardar resultados
results = []

# recorrer todos los frames uno por uno
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

# si llegamos aquí significa que no se encontró ningún match fuerte

# ordenar todos los resultados por similitud (mayor a menor)
results.sort(key=lambda x: x[1], reverse=True)

# imprimir los 10 mejores candidatos
print(json.dumps(results[:10]))
<img width="1531" height="585" alt="image1-3" src="https://github.com/user-attachments/assets/bb8bb2a0-bfec-41c0-99f4-c08ea39d9d35" />

# Self Creator

![DeepSeek](https://img.shields.io/badge/DeepSeek-AI-blue)
![Python](https://img.shields.io/badge/python-3.9+-blue.svg)
![AI](https://img.shields.io/badge/AI-CLIP-green)
![Status](https://img.shields.io/badge/status-experimental-yellow)

Self Creator is an **AI pipeline for automatically generating short-form videos (TikTok / Reels / Shorts) from narrated audio.**

The system analyzes an audio narration, identifies the scenes it describes, searches for relevant video moments using multimodal embeddings, and assembles them into a final short-form video.

The goal is to automate the process of turning **spoken ideas into visual stories**.

---

# Vision

Content creation today requires:

- writing a script
- recording audio
- searching for footage
- editing clips manually

Self Creator aims to automate this pipeline.

Input:

```
Audio narration
```

Output:

```
Short-form video (TikTok / Reels / Shorts)
```

Output Example:

![Video vertical con subtítulos (1)](https://github.com/user-attachments/assets/475de468-6398-4840-aa3d-976a81131f1a)

Look for the coomplete video -> https://youtube.com/shorts/LsWjkRAb9nE

---

# Example Future Workflow

```
User records audio
      │
      ▼
AI extracts scene descriptions
      │
      ▼
Video clips are retrieved automatically
      │
      ▼
Clips are assembled into a timeline
      │
      ▼
Final TikTok-style video is generated
```

Each stage converts human ideas into visual media automatically.

---

# Core Idea

Instead of manually searching for footage, the system:

1. Converts text or speech into **semantic queries**
2. Encodes those queries into **vector embeddings**
3. Searches video frames using **CLIP**
4. Finds the **most visually relevant moments**
5. Builds a video timeline automatically

This allows **semantic video editing**, where clips are selected based on meaning rather than manual browsing.

---

# Current Capabilities

The current version focuses on the **video search stage** of the pipeline.

Features:

- 🔍 Text-to-video search using CLIP
- ⚡ Early stop detection to reduce compute
- 🧵 Batch inference for faster frame analysis
- 🎞 Frame extraction from videos
- 🧠 Embedding-based similarity search

This component finds **frames that match a semantic description**.

Example query:

```
"a drone shot of a city"
```

The system searches through frames and returns the most relevant ones.

---

# Installation

Clone the repository:

```bash
git clone https://github.com/itiel-felix/self-creator.git
cd self-creator
```

Install dependencies:

```bash
pip install torch open_clip_torch pillow numpy
```

You also need **ffmpeg**.

Mac:

```bash
brew install ffmpeg
```

Linux:

```bash
sudo apt install ffmpeg
```

---

# Usage

Run the frame search script:

```bash
node start.js [audio_file]
```

Example:

```bash
node start.js my_story.mp3
```

Example output:

```json
/output/vertical_merge_video_with_subtitles.mp4
```

---

# Performance Optimizations

The pipeline includes several optimizations:

- batch inference
- early stopping
- dynamic frame sampling
- reduced frame resolution

These allow efficient processing even on **CPU-only systems**.

---

# Roadmap

Future stages of the project include:

### Audio Understanding

- speech-to-text
- semantic segmentation of narration powered by DeepSeek AI
- scene extraction

### Video Retrieval

- large video dataset indexing
- embedding caching
- clip-level retrieval

### Video Generation

- automatic clip sequencing
- subtitle generation
- audio synchronization
- final video rendering

---

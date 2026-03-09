import Replicate from "replicate";
import { readFile } from "node:fs/promises";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_KEY,
});

export const transcribeAudioWhisperX = async (audioPath) => {
    const cacheFile = `cache/${audioPath.split('/').pop().split('.')[0]}.json`;
    if (fs.existsSync(cacheFile)) {
        return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
    const fileStream = (await readFile(audioPath)).toString('base64');
    const audio_file = `data:audio/wav;base64,${fileStream}`;
    try {
        const response = await replicate.run(
            "victor-upmeet/whisperx:84d2ad2d6194fe98a17d2b60bef1c7f910c46b2f6fd38996ca457afd9c8abfcb",
            {
                input: {
                    audio_file: audio_file,
                    align_output: true
                },
            }
        );
        fs.writeFileSync(cacheFile, JSON.stringify(response, null, 2));
        return response;
    } catch (error) {
        throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
}

export const transcribeAudioWhisper = async (audioPath) => {
    const cacheFile = `cache/${audioPath.split('/').pop().split('.')[0]}.json`;
    if (fs.existsSync(cacheFile)) {
        return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
    const fileStream = await readFile(audioPath);
    const { transcription } = await replicate.run(
        "openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e",
        {
            input: {
                audio: fileStream,
                transcription: "srt"
            },
        }
    );
    fs.writeFileSync(cacheFile, JSON.stringify(transcription, null, 2));
    return transcription;
}

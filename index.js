import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import { transcribeAudioWhisperX } from "./src/services/replicate.service.js";
import { getMainIdea } from "./src/services/deepSeek.service.js";
import { getVideos } from "./src/video/videoUtils.js";
import { cutAndMergeSegments, addBurnedInASSSubtitles } from "./src/video/videoManage.js";
import { generateASS, generateSRT } from "./src/subtitles/subtitle.service.js";
(async () => {
    // int settings
    if (!fs.existsSync('./temp')) fs.mkdirSync('./temp');
    if (!fs.existsSync('./temp/youtube')) fs.mkdirSync('./temp/youtube');
    const start = Date.now();
    try {
        const audioPath = process.argv[2];
        if (!audioPath) throw new Error("Usage: node index.js <audio-file>");

        if (!fs.existsSync('./cache')) fs.mkdirSync('./cache');
        if (!fs.existsSync('./output')) fs.mkdirSync('./output');

        // Part 1: Transcribe audio

        let segments = [];
        if (!fs.existsSync('./cache/audio.json')) {
            const response = await transcribeAudioWhisperX(audioPath);
            segments = response.segments;
            fs.writeFileSync('./cache/audio.json', JSON.stringify(segments, null, 2));
        } else {
            segments = JSON.parse(fs.readFileSync('./cache/audio.json', 'utf8'));
        }
        console.log('<--- TRANSCRIPTION DONE --->');

        // Part 2: Generate subtitles
        const subtitlesPath = 'output/subtitles.ass';
        if (!fs.existsSync(subtitlesPath)) {
            const allWords = segments.flatMap(s => s.words ?? []);
            fs.writeFileSync(subtitlesPath, generateASS(allWords));
        }
        console.log('<--- SUBTITLES DONE --->');

        // Part 3: Get keywords for video search
        const srt = generateSRT(segments);
        console.log('<--- GETTING MAIN IDEAS --->');
        let mainIdeas;
        if (fs.existsSync('./cache/mainIdeas.json')) {
            mainIdeas = JSON.parse(fs.readFileSync('./cache/mainIdeas.json', 'utf8'));
        } else {
            mainIdeas = await getMainIdea(srt);
            fs.writeFileSync('./cache/mainIdeas.json', JSON.stringify(mainIdeas, null, 2));
        }
        console.log('<--- MAIN IDEAS DONE --->');

        // Part 4: Download and prepare video segments
        const videos = await getVideos(mainIdeas);
        console.log('<--- VIDEOS DOWNLOADED --->');

        // Part 5: Merge videos with audio
        const mergedPath = 'output/merged_video.mp4';
        await cutAndMergeSegments(videos, mergedPath, audioPath);
        console.log('<--- VIDEO MERGED --->');

        // Part 6: Burn subtitles
        const finalPath = await addBurnedInASSSubtitles(mergedPath, subtitlesPath);
        console.log('<--- SUBTITLES BURNED --->');

        // Part 7: Cleanup temp video files
        // videos.forEach(v => { try { fs.unlinkSync(v.video_path); } catch { } });
        console.log(`\n✅ Video ready at: ${finalPath}`);

    } catch (error) {
        console.error(error);
    } finally {
        console.log(`Time taken: ${((Date.now() - start) / 1000).toFixed(1)}s`);
    }

})();

import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import { transcribeAudioWhisperX } from "./src/services/replicate.service.js";
import { getMainIdea } from "./src/services/deepSeek.service.js";
import { getVideos } from "./src/video/videoUtils.js";
import { cutAndConcatSegments, addBurnedInASSSubtitles, mergeSegmentsToVerticalScreen } from "./src/video/videoManage.js";
import { generateASS, generateSRT } from "./src/subtitles/subtitle.service.js";
import { getVideoDuration } from "./src/video/videoUtils.js";
import subwaySurfers from "./src/video/subwaySurfers.js";
import { cropVideoToDuration } from "./src/video/videoManage.js";
import { initializeCache } from "./src/utils.js";
(async () => {
    // int settings
    const start = Date.now();
    initializeCache();
    try {
        const audioPath = process.argv[2];
        if (!audioPath) throw new Error("Usage: node index.js <audio-file>");

        if (!fs.existsSync('./cache')) fs.mkdirSync('./cache');
        if (!fs.existsSync('./output')) fs.mkdirSync('./output');

        // // Part 1: Transcribe audio

        let segments = [];
        if (!fs.existsSync('./cache/audio.json')) {
            const response = await transcribeAudioWhisperX(audioPath);
            segments = response.segments;
            fs.writeFileSync('./cache/audio.json', JSON.stringify(segments, null, 2));
        } else {
            segments = JSON.parse(fs.readFileSync('./cache/audio.json', 'utf8'));
        }

        // // Part 2: Generate subtitles
        const subtitlesPath = './output/subtitles.ass';
        if (!fs.existsSync(subtitlesPath)) {
            const allWords = segments.flatMap(s => s.words ?? []);
            fs.writeFileSync(subtitlesPath, generateASS(allWords));
        }

        // Part 3: Get keywords for video search
        const srt = generateSRT(segments);
        let mainIdeas;
        if (fs.existsSync('./cache/mainIdeas.json')) {
            mainIdeas = JSON.parse(fs.readFileSync('./cache/mainIdeas.json', 'utf8'));
        } else {
            mainIdeas = await getMainIdea(srt);
            fs.writeFileSync('./cache/mainIdeas.json', JSON.stringify(mainIdeas, null, 2));
        }

        // Part 4: Download and prepare video segments
        const videos = await getVideos(mainIdeas);

        // Part 5: Merge videos with audio
        const mergedPath = './output/merged_video.mp4';
        // console.log('------> Merging upper videos...');
        // const mergedVideoPath = await cutAndConcatSegments(videos, mergedPath);
        const mergedVideoLenght = await getVideoDuration(mergedPath);
        console.log('------> Merged video length: ', mergedVideoLenght);
        // Part 6: Download subway surfers video
        console.log('------> Downloading subway surfers video...');
        const subwaySurfersVideoPath = await subwaySurfers(mergedVideoLenght);
        console.log(`------> Subway surfers video download complete, cropping to length ${mergedVideoLenght} seconds...`);
        await cropVideoToDuration(subwaySurfersVideoPath, mergedVideoLenght);
        console.log('------> Subway surfers video ready: ', subwaySurfersVideoPath);

        // Last merge
        const newVideos = [
            {
                video_path: subwaySurfersVideoPath,
                final_duration: mergedVideoLenght,
                start_time: '00:00:00,000',
                text: 'Subway surfers coinless run'
            },
            {
                video_path: mergedPath,
                final_duration: mergedVideoLenght,
                start_time: '00:00:00,000',
                text: 'Merged video'
            }
        ]

        console.log('------> Merging subway surfers and upper videos...');
        let verticalMergedPath = './output/vertical_merged_video.mp4';
        let verticalMergedVideoPath = await mergeSegmentsToVerticalScreen(newVideos, verticalMergedPath, audioPath);
        console.log('------> Vertical merged video ready: ', verticalMergedVideoPath);
        // Part 6: Burn subtitles
        console.log('------> Burning subtitles...');
        const finalVerticalMergedPath = await addBurnedInASSSubtitles(verticalMergedVideoPath, subtitlesPath);
        console.log('------> Subtitles burned: ', finalVerticalMergedPath);

        // Part 7: Cleanup temp video files
        // videos.forEach(v => { try { fs.unlinkSync(v.video_path); } catch { } });

    } catch (error) {
        console.error(error);
    } finally {
        console.log('Time taken: ', Date.now() - start, 'ms');
    }

})();

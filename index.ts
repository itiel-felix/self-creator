import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import { transcribeAudioWhisperX } from "./src/services/replicate.service.js";
import { getMainIdea } from "./src/services/deepSeek.service.js";
import { cutAndConcatSegments, addBurnedInASSSubtitles, mergeSegmentsToVerticalScreen } from "./src/video/videoManage.js";
import { generateASS, generateSRT } from "./src/subtitles/subtitle.service.js";
import { getMediaDuration } from "./src/video/videoUtils.js";
import subwaySurfers from "./src/video/subwaySurfers.js";
import { cropVideoToDuration } from "./src/video/videoManage.js";
import { initializeCache } from "./src/utils.js";
import { getCuriosityVideos } from "./src/workflows/curiosity.js";
import { getVideoGameVideos } from "./src/workflows/videogame/index.js";
(async () => {
    // int settings
    const start = Date.now();
    initializeCache();
    try {
        const audioPath = process.argv[3];
        // [videogame, story, curiosity]
        const typeOfVideo = process.argv[2];
        if (!audioPath) throw new Error("Usage: npm run dev <typeOfVideo> <audio-file>");

        if (!fs.existsSync('./cache')) fs.mkdirSync('./cache');
        if (!fs.existsSync('./output')) fs.mkdirSync('./output');
        const audioName = audioPath.split('.').shift();
        const audioCachePath = `./cache/${audioName}.json`;
        // // Part 1: Transcribe audio

        let segments: any[] = [];
        if (!fs.existsSync(audioCachePath)) {
            console.log('------> Transcribing audio...');
            const response = await transcribeAudioWhisperX(audioPath);
            segments = response.segments;
            fs.writeFileSync(audioCachePath, JSON.stringify(segments, null, 2));
            console.log('------> Audio transcribed: ', audioCachePath);
        } else {
            segments = JSON.parse(fs.readFileSync(audioCachePath, 'utf8'));
        }

        // // Part 2: Generate subtitles
        const subtitlesPath = './output/subtitles.ass';
        if (!fs.existsSync(subtitlesPath)) {
            const allWords = segments.flatMap((s: any) => s.words ?? []);
            fs.writeFileSync(subtitlesPath, generateASS(allWords));
        }

        // Part 3: Get keywords for video search
        const srt = generateSRT(segments);
        let mainIdeas: any;
        if (fs.existsSync('./cache/mainIdeas.json')) {
            mainIdeas = JSON.parse(fs.readFileSync('./cache/mainIdeas.json', 'utf8'));
        } else {
            mainIdeas = await getMainIdea(srt, typeOfVideo);
            fs.writeFileSync('./cache/mainIdeas.json', JSON.stringify(mainIdeas, null, 2));
        }

        // Part 4: Download and prepare video segments
        let videos: any;
        switch (typeOfVideo) {
            case 'curiosity':
                videos = await getCuriosityVideos(mainIdeas, typeOfVideo);
                break;
            case 'videogame':
                const videoDuration = await getMediaDuration(audioPath);
                videos = await getVideoGameVideos(mainIdeas[0].text, typeOfVideo, videoDuration);
                break;
            default:
                throw new Error('Invalid type of video');
        }

        // Part 5: Merge videos with audio
        const mergedPath = './output/merged_video.mp4';
        console.log('------> Merging upper videos...');
        const mergedVideoPath = await cutAndConcatSegments(videos, mergedPath);
        const mergedVideoLenght: number = await getMediaDuration(mergedPath);
        console.log('------> Merged video length: ', mergedVideoLenght);
        // Part 6: Download subway surfers video
        console.log('------> Downloading subway surfers video...');
        const subwaySurfersVideoPath = await subwaySurfers(mergedVideoLenght);
        if (!subwaySurfersVideoPath) throw new Error('Failed to download subway surfers video');
        console.log(`------> Subway surfers video download complete, cropping to length ${mergedVideoLenght} seconds...`);
        await cropVideoToDuration(subwaySurfersVideoPath, mergedVideoLenght);
        console.log('------> Subway surfers video ready: ', subwaySurfersVideoPath);

        // Last merge
        const newVideos: { video_path: string; final_duration: number; start_time: string; text: string }[] = [
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

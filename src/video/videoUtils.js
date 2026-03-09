import { downloadYoutubeVideo } from "./videoDownloader.js";
import { getProcessedMainIdea } from "../services/deepSeek.service.js";
import { timeToSeconds, getStartAndEndTimeFromVideoId } from "../utils.js";
import { getYoutubeVideoUrl } from "../services/youtube.service.js";
import { searchVideosInYoutube } from "../services/video.service.js";

import clipProcessor from "../utils/clipProcessor.js";
import fs from 'fs';
import ffmpeg from "fluent-ffmpeg";

// Wee are using 2 types of start time
// 1. The start time of the main idea, it means, the time that the idea should be shown in the final video
// 2. The start time of the video selected
export const getVideos = async (mainIdeasOriginal) => {
    const shouldUseMainIdeasCache = true
    let mainIdeas = [];
    if (shouldUseMainIdeasCache) {
        mainIdeas = JSON.parse(fs.readFileSync('./cache/mainIdeas.json', 'utf8'));
    } else {
        mainIdeas = mainIdeasOriginal;
    }
    const videos = [];
    const tempFolder = './temp';
    if (!fs.existsSync(tempFolder)) fs.mkdirSync(tempFolder);

    const videoByKeyword = {};
    const usedVideosIds = [];
    console.log('Starting search for main ideas: ', mainIdeas.length);

    let results = [];
    let shouldUseResults = true;
    if (fs.existsSync('./cache/results.json') && shouldUseResults) {
        const cachedResults = JSON.parse(fs.readFileSync('./cache/results.json', 'utf8'));
        results = cachedResults;
    } else {
        for (let index = 0; index < mainIdeas.length; index++) {
            const mainIdea = mainIdeas[index];
            console.log('ANALYZING MAIN IDEA: ', mainIdea.text, ', (', index + 1, 'of', mainIdeas.length, ')');
            const result = await chooseVideoFromYoutube(mainIdea.text, usedVideosIds);
            console.log('Result of chooseVideoFromYoutube: ', result);
            results.push(result);
        }
        fs.writeFileSync('./cache/results.json', JSON.stringify(results, null, 2));
    }

    console.log('--- Finished choosing videos from Youtube --->');

    const newMainIdeas = [];
    console.log('Starting to get start and end time from videos...');
    for (let i = 0; i < mainIdeas.length; i++) {
        console.log('---------------------------------');
        const mainIdea = mainIdeas[i];
        const result = results[i];
        console.log('Result: ', result);
        console.log("Analuzed main idea: ", mainIdea);
        const newStartTime = i === 0 ? '00:00:00,000' : mainIdea.start_time;
        const key = `${mainIdea.text}-${newStartTime}-${mainIdea.end_time}`;
        const videoDuration = timeToSeconds(mainIdea.end_time) - timeToSeconds(newStartTime);

        const { start_time: videoStart_time, end_time: videoEnd_time } = getStartAndEndTimeFromVideoId(result.videoId, videoDuration);

        const newMainIdea = {
            ...mainIdea,
            start_time: newStartTime,
            video_id: result.videoId,
            video_start_time: videoStart_time,
            video_end_time: videoEnd_time
        }
        newMainIdeas.push(newMainIdea);

        const raw = results[i];
        const videoId = typeof raw === "string" ? raw : raw?.videoId ?? null;
        if (videoId) {
            videoByKeyword[key] = videoId;
            console.log(`Found vertical video for: ${mainIdea.text} -> ${getYoutubeVideoUrl(videoId)}`);
        } else {
            console.log(`No vertical video found for: ${mainIdea.text}`);
        }
    }
    console.log('----- Search for main ideas done ---------------------------------');
    console.log("New main ideas: ", newMainIdeas);
    console.log('Total new main ideas: ', newMainIdeas.length);
    console.log('---------------------------------');

    console.log('---- Starting to get all videos info ---------------------------------');
    try {
        for (let i = 0; i < newMainIdeas.length; i++) {
            const mainIdea = newMainIdeas[i];
            const nextMainIdea = newMainIdeas[i + 1];
            const videoPath = `./temp/youtube/${mainIdea.video_id}.mp4`;

            // Alargar hasta la siguiente idea: de start_time hasta el start_time de la siguiente (o hasta end_time si es la última)
            const startSec = timeToSeconds(mainIdea.start_time);
            const endSec = nextMainIdea
                ? timeToSeconds(nextMainIdea.start_time)
                : timeToSeconds(mainIdea.end_time);
            const segmentDuration = endSec - startSec;
            console.log('Needed duration: ', segmentDuration, nextMainIdea ? '(hasta sig. idea)' : '(última)');
            videos.push({
                video_id: mainIdea.video_id,
                video_path: videoPath,
                final_duration: segmentDuration,
                start_time: mainIdea.video_start_time,
                text: mainIdea.text
            });
        }
        const promises = videos.map(video => downloadFinalVideo(video.video_id));
        await Promise.all(promises);
        console.log('All videos downloaded in 1080p quality');
        console.log('Sum of all durations: ', videos.reduce((acc, video) => acc + video.final_duration, 0));
        return videos;
    } catch (error) {
        // fs.readdirSync(tempFolder).forEach(file => fs.unlinkSync(`${tempFolder}/${file}`));
        throw error;
    }
}

/**
 * Saves processed main ideas to a JSON file.
 * @param {string} mainIdea - The main idea to save.
 * @param {Object} processedMainIdeas - The processed main ideas to save.
 * @returns {Promise<void>} A promise that resolves when the main ideas have been saved.
 */
const saveProcessedMainIdeas = async (mainIdea, processedMainIdeas) => {
    const cacheDir = 'cache';
    const cachePath = `${cacheDir}/main_ideas_processed.json`;
    const objectToSave = {
        [mainIdea]: processedMainIdeas
    }
    if (fs.existsSync(cachePath)) {
        const cachedData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        cachedData[mainIdea] = processedMainIdeas;
        fs.writeFileSync(cachePath, JSON.stringify(cachedData, null, 2));
    } else {
        fs.writeFileSync(cachePath, JSON.stringify(objectToSave, null, 2));
    }
}

/**
 * Calls for DeepSeek to get query options for a main idea.
 * @param {string} mainIdea - The main idea to work on.
 * @param {boolean} tooHard - Whether the main idea is too hard to process.
 * @returns {Promise<Object>} The processed main ideas.
 */
const workMainIdeas = async (mainIdea, tooHard = false) => {
    const processedMainIdeas = await getProcessedMainIdea(mainIdea, tooHard);
    await saveProcessedMainIdeas(mainIdea, processedMainIdeas);
    return processedMainIdeas;
}


/**
 * Looks for a vertical video in YouTube for a given main idea.
 * @param {string} mainIdea - The main idea to search for.
 * @param {string[]} usedVideosIds - The IDs of the videos that have already been used.
 * @returns {Promise<{videoId: string, tooHard: boolean}>} The ID of the vertical video found.
 */
export const chooseVideoFromYoutube = async (mainIdea, usedVideosIds = []) => {
    let tooHard = false;
    do {
        const processedMainIdeas = await workMainIdeas(mainIdea, tooHard);
        for (let processedMainIdea of processedMainIdeas) {
            const { videoId, tooHard: too_hard } = await checkVideosForMainIdea(processedMainIdea, usedVideosIds, tooHard);
            if (videoId) {
                usedVideosIds.push(videoId);
                return { videoId, tooHard: too_hard };
            }
            if (tooHard) {
                return { videoId: null, tooHard: too_hard };
            }
        }
    } while (true);
}


/**
 * Checks for videos in YouTube for a given main idea.
 * @param {string} processedMainIdea - The processed main idea to search for.
 * @param {string[]} usedVideosIds - The IDs of the videos that have already been used.
 * @param {boolean} tooHard - Whether the main idea is too hard to process.
 * @returns {Promise<{videoId: string, tooHard: boolean}>} The ID of the vertical video found.
 */
const checkVideosForMainIdea = async (processedMainIdea, usedVideosIds = [], tooHard = false) => {
    const fullTerm = `${processedMainIdea}`;
    console.log(`Searching for videos with term: ${fullTerm}`);
    const results = await searchVideosInYoutube(fullTerm);
    if (results.length === 0) {
        console.log(`No videos found for term: ${fullTerm}, adding to burned terms...`);
        tooHard = true;
        return { videoId: null, tooHard: true };
    }
    for (let item of results) {
        const result = await checkResultItemForMainIdea(processedMainIdea, item, usedVideosIds);
        const id = result?.videoId ?? result;
        if (id && typeof id === "string") {
            return { videoId: id };
        }
    }
    return { videoId: null, tooHard: true };
}

/**
 * Create a cache for a video info.
 * @param {string} mainIdea - The main idea to search for.
 * @param {Object} item - The item to search for.
 * @param {string[]} usedVideosIds - The IDs of the videos that have already been used.
 * @returns {Promise<{videoId: string, tooHard: boolean}>} The ID of the vertical video found.
 */
const checkResultItemForMainIdea = async (mainIdea, item) => {
    const videoId = item.id;
    try {
        const cacheDir = 'cache/videoInfo';
        const cachePath = `${cacheDir}/${videoId}.json`;
        if (fs.existsSync(cachePath)) {
            console.log('Video info already in cache, choosing another video...');
            return {};
        }

        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify(item, null, 2));

        // Check if there is frames and fram info of video id
        // const infoOfFrames = await framesAndFrameInfoExists(videoId);
        // if (infoOfFrames) {
        //     console.log('Frames and frame info already exist, ...');
        //     return { videoId };
        // }
        await donwloadAndExtractFramesOfAVideo(videoId);
        console.log("Frames extracted")
        console.log(`Processing main idea: ${mainIdea} for video: ${videoId} with scores...`);
        const scores = await clipProcessor(mainIdea, videoId);
        const sortingScores = scores.sort((a, b) => b[1] - a[1]);
        const bestScore = sortingScores[0];
        if (bestScore[1] >= 0.3) {
            console.log("Best score: ", bestScore);
            await writeVideoIdWithFrame(videoId, bestScore[0]);
            return { videoId };
        } else {
            await removeVideoAndFrames(videoId);
            return null;
        }
    }
    catch (error) {
        console.log('Error with main idea: ', mainIdea);
        console.log(`Error searching for videos for main idea: ${mainIdea}: ${error}`);
        console.log('Continuing with next main idea...');
        if (error?.stderr?.includes('WARNING: [youtube] No supported JavaScript runtime could be found. Only deno is enabled by default; to use another runtime add  --js-runtimes RUNTIME[:PATH]')) {
            return { videoId: null };
        } else {
            throw error;
        }
    }
}

/**
 * Downloads a video  in low quality and extracts frames from it.
 * @param {string} videoId - The ID of the video to download and extract frames from.
 * @returns {Promise<void>} A promise that resolves when the frames have been extracted.
 */
const donwloadAndExtractFramesOfAVideo = async (videoId) => {
    const tempFolder = './temp/youtube';
    if (!fs.existsSync(tempFolder)) fs.mkdirSync(tempFolder);
    const videoPath = await downloadYoutubeVideo({
        videoId,
        outputFolder: tempFolder,
        extraOptions: {
            format: "bv*[ext=mp4][height<=360]",
        }
    });
    await getRandomFramesOfAVideo(videoPath, videoId);
}

/**
 * Writes a video ID with a frame name to a JSON file.
 * @param {string} videoId - The ID of the video to write.
 * @param {string} frameName - The name of the frame to write.
 * @returns {Promise<void>} A promise that resolves when the video ID with frame name has been written.
 */
const writeVideoIdWithFrame = async (videoId, frameName) => {
    const framePath = `./frames/${videoId}/${frameName}`;
    const jsonPath = `./cache/frame_info.json`;
    if (fs.existsSync(jsonPath)) {
        const cachedData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        cachedData[videoId] = framePath;
        fs.writeFileSync(jsonPath, JSON.stringify(cachedData, null, 2));
    } else {
        fs.writeFileSync(jsonPath, JSON.stringify({ [videoId]: framePath }, null, 2));
    }
}

/**
 * Extracts frames from a video.
 * @param {string} videoPath - The path to the video to extract frames from.
 * @param {string} videoId - The ID of the video to extract frames from.
 * @returns {Promise<void>} A promise that resolves when the frames have been extracted.
 */
const getRandomFramesOfAVideo = async (videoPath, videoId) => {
    const framesFolder = `./frames/${videoId}`;
    if (!fs.existsSync('./frames')) {
        fs.mkdirSync('./frames');
    }
    if (!fs.existsSync(framesFolder)) fs.mkdirSync(framesFolder);
    console.log(`Extracting frames from video ${videoId} to ${framesFolder}`);
    await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .videoFilters("fps=fps=1/2")
            .output(`${framesFolder}/frame_%04d.jpg`)
            .on("end", resolve)
            .on("error", reject)
            .run();
    });
};

/**
 * Removes a video and its frames from the filesystem.
 * @param {string} videoId - The ID of the video to remove.
 * @returns {Promise<void>} A promise that resolves when the video and its frames have been removed.
 */
const removeVideoAndFrames = async (videoId) => {
    const tempFolder = `./temp/youtube/${videoId}.mp4`;
    const framesFolder = `./frames/${videoId}`;
    if (fs.existsSync(tempFolder)) fs.unlinkSync(tempFolder);
    if (fs.existsSync(framesFolder)) fs.rmdirSync(framesFolder, { recursive: true });
}

/**
 * Checks if frames and frame info exist for a video ID.
 * @param {string} videoId - The ID of the video to check.
 * @returns {Promise<boolean>} A promise that resolves to true if frames and frame info exist, false otherwise.
 */
const framesAndFrameInfoExists = async (videoId) => {
    const frameInfoPath = `./cache/frame_info.json`;
    console.log('Checking if frames and frame info exist for video id: ', videoId);
    if (!fs.existsSync(frameInfoPath)) {
        console.log('Frame info path does not exist, skipping...');
        return false;
    }
    const frameInfo = JSON.parse(fs.readFileSync(frameInfoPath, 'utf8'));
    console.log('Frame info: ', frameInfo);
    if (!frameInfo[videoId]) {
        console.log('Frame info does not exist for video id: ', videoId, 'skipping...');
        return false;
    }
    console.log('Frames and frame info exist for video id: ', videoId);
    return true;
}

/**
 * Downloads a video in low quality.
 * @param {string} videoId - The ID of the video to download.
 * @returns {Promise<void>} A promise that resolves when the video has been downloaded.
 */
const downloadFinalVideo = async (videoId) => {
    const tempFolder = './temp/youtube';
    if (!fs.existsSync(tempFolder)) fs.mkdirSync(tempFolder);
    if (fs.existsSync(tempFolder)) {
        fs.rmSync(tempFolder, { recursive: true });
    }
    fs.mkdirSync(tempFolder);
    await downloadYoutubeVideo({
        videoId,
        outputFolder: tempFolder,
        extraOptions: {
            format: "bv*[ext=mp4][height<=1080]",
        }
    });
}
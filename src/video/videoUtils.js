import dotenv from 'dotenv';
dotenv.config();

import { downloadYoutubeVideo } from "./videoDownloader.js";
import { getProcessedMainIdea } from "../services/deepSeek.service.js";
import { timeToSeconds, getStartAndEndTimeFromVideoId } from "../utils.js";
import { getYoutubeVideoUrl } from "../services/youtube.service.js";
import { searchVideosInYoutube } from "../services/video.service.js";

import processStreamingFrames from "../embeddings/processFrames.js";
import fs from 'fs';
import ffmpeg from "fluent-ffmpeg";

// We are using 2 types of start time
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

    let results = [];
    let shouldUseResults = true;
    if (fs.existsSync('./cache/results.json') && shouldUseResults) {
        const cachedResults = JSON.parse(fs.readFileSync('./cache/results.json', 'utf8'));
        results = cachedResults;
    } else {
        for (let index = 0; index < mainIdeas.length; index++) {
            const mainIdea = mainIdeas[index];
            console.log('-> Working on main idea: ', mainIdea.text, '(', index + 1, 'of', mainIdeas.length, ')')
            const result = await chooseVideoFromYoutube(mainIdea, usedVideosIds);
            results.push(result);
        }
        fs.writeFileSync('./cache/results.json', JSON.stringify(results, null, 2));
    }

    const newMainIdeas = [];
    for (let i = 0; i < mainIdeas.length; i++) {
        const mainIdea = mainIdeas[i];
        const result = results[i];
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
        }
    }

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
            videos.push({
                video_id: mainIdea.video_id,
                video_path: videoPath,
                final_duration: segmentDuration,
                start_time: mainIdea.video_start_time,
                text: mainIdea.text
            });
        }
        const shouldDownloadVideos = true;
        if (shouldDownloadVideos) {
            const promises = videos.map(video => downloadFinalVideo(video.video_id));
            await Promise.all(promises);
        }
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
const workMainIdeas = async (mainIdeaText, tooHard = false, mainIdeaOriginalText) => {
    const processedMainIdeas = await getProcessedMainIdea(mainIdeaText, tooHard, [], mainIdeaOriginalText);
    await saveProcessedMainIdeas(mainIdeaText, processedMainIdeas);
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
    const mainIdeaText = mainIdea.text;
    const mainIdeaOriginalText = mainIdea.original_text;
    do {
        const processedMainIdeas = await workMainIdeas(mainIdeaText, tooHard, mainIdeaOriginalText);
        for (let processedMainIdea of processedMainIdeas) {
            console.log('--> Checking videos for processed idea: ', processedMainIdea)
            const { videoId, tooHard: too_hard } = await checkVideosForMainIdea(processedMainIdea, usedVideosIds, tooHard);
            if (videoId) {
                console.log('--> Video found:', videoId)
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
    const results = await searchVideosInYoutube(fullTerm);
    if (results.length === 0) {
        tooHard = true;
        console.log('---> No video found for term: ', processedMainIdea);
        return { videoId: null, tooHard: true };
    }

    for (let index = 0; index < results.length; index++) {
        const item = results[index];
        console.log('----> Checking item: ', getYoutubeVideoUrl(item.id))
        const result = await checkResultItemForMainIdea(processedMainIdea, item, index + 1);
        const id = result?.videoId ?? result;
        if (id && typeof id === "string") {
            return { videoId: id };
        }
    }
    console.log('--> No video found for term: ', processedMainIdea);
    return { videoId: null, tooHard: true };
}

/**
 * Create a cache for a video info.
 * @param {string} mainIdea - The main idea to search for.
 * @param {Object} item - The item to search for.
 * @param {string[]} usedVideosIds - The IDs of the videos that have already been used.
 * @returns {Promise<{videoId: string, tooHard: boolean}>} The ID of the vertical video found.
 */
const checkResultItemForMainIdea = async (mainIdea, item, index = 0) => {
    const videoId = item.id;
    try {
        console.log('-----> Checking result item for term: ', mainIdea, ' - ', videoId, ' - ', index);
        const cacheDir = 'cache/videoInfo';
        const cachePath = `${cacheDir}/${videoId}.json`;
        // if (fs.existsSync(cachePath)) {
        //     return {};
        // }

        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify(item, null, 2));

        // Check if there is frames and fram info of video id
        // const infoOfFrames = await framesAndFrameInfoExists(videoId);
        // if (infoOfFrames) {
        //     return { videoId };
        // }
        // Download video and process frames
        console.log('------> Downloading video...');
        const videoPath = await downloadVideo(videoId);
        console.log('------> Video downloaded: ', videoPath);

        // Select frames query for the video
        console.log('------> Selecting frames query...');
        const selectQuery = await selectFramesQueryForAVideo(videoPath);

        console.log('------> Select query: ', selectQuery);
        console.log('------> Starting to process frames...');
        // Process frames and get scores
        const scores = await processStreamingFrames(mainIdea, videoId, selectQuery);

        console.log('------> Scores: ', scores);
        const sortingScores = scores.sort((a, b) => b[1] - a[1]);
        const bestScore = sortingScores?.[0];
        if (bestScore?.[1] >= parseFloat(process.env.THRESHOLD_SIMILARITY)) {
            await writeVideoIdWithFrame(videoId, bestScore[0]);
            return { videoId };
        } else {
            await removeVideoAndFrames(videoId);
            return null;
        }
    }
    catch (error) {
        console.error('------> Error checking result item for term: ', mainIdea, ' - ', videoId, ' - ', index, ' - ', error);
        return null;
    }
}

/**
 * Downloads a video  in low quality and extracts frames from it.
 * @param {string} videoId - The ID of the video to download and extract frames from.
 * @returns {Promise<void>} A promise that resolves when the frames have been extracted.
 */
const downloadVideo = async (videoId) => {
    const tempFolder = './temp/youtube';
    if (!fs.existsSync(tempFolder)) fs.mkdirSync(tempFolder);
    const videoPath = await downloadYoutubeVideo({
        videoId,
        outputFolder: tempFolder,
        extraOptions: {
            format: "bv*[ext=mp4][height<=360]",
            downloadSections: "*1-240",
        }
    });
    return videoPath;
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
const selectFramesQueryForAVideo = async (videoPath) => {

    const videoDuration = await getVideoDuration(videoPath);
    const minutes = videoDuration / 60;
    console.log("Video duration: ", minutes);

    let selectQuery;

    if (minutes > 3 && minutes < 5) {
        selectQuery = "fps=1/15";
    } else if (minutes > 1 && minutes < 3) {
        selectQuery = "fps=1/5";
    } else {
        selectQuery = "fps=1";
    }
    return selectQuery;
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
    if (!fs.existsSync(frameInfoPath)) {
        return false;
    }
    const frameInfo = JSON.parse(fs.readFileSync(frameInfoPath, 'utf8'));
    if (!frameInfo[videoId]) {
        return false;
    }
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

export const getVideoDuration = async (videoPath) => {
    const duration = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) reject(err);
            resolve(metadata.format.duration);
        });
    });
    return duration;
}
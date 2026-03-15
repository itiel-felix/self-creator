import dotenv from 'dotenv';
dotenv.config();

import { downloadYoutubeVideo } from "./videoDownloader.js";
import { getProcessedMainIdea } from "../services/deepSeek.service.js";
import { getYoutubeVideoUrl } from "../services/youtube.service.js";
import { searchVideosInYoutube } from "../services/video.service.js";

import processStreamingFrames from "../embeddings/processFrames.js";
import fs from 'fs';
import ffmpeg from "fluent-ffmpeg";
import { isThumbnailAcceptable } from "./processThumbnails.js";



/**
 * Saves processed main ideas to a JSON file.
 * @param {string} mainIdea - The main idea to save.
 * @param {Object} processedMainIdeas - The processed main ideas to save.
 * @returns {Promise<void>} A promise that resolves when the main ideas have been saved.
 */
const saveProcessedMainIdeas = async (mainIdea: string, processedMainIdeas: any) => {
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
 * @returns {Promise<Object<{search_queries: string, visual_prompts: string}>>} The processed main ideas.
 */
const workMainIdeas = async (mainIdeaText: string, tooHard = false, mainIdeaOriginalText: string, typeOfVideo = "curiosity") => {
    const processedMainIdeas = await getProcessedMainIdea(mainIdeaText, tooHard, [], mainIdeaOriginalText, typeOfVideo);
    await saveProcessedMainIdeas(mainIdeaText, processedMainIdeas);
    return processedMainIdeas;
}


/**
 * Looks for a vertical video in YouTube for a given main idea.
 * @param {string} mainIdea - The main idea to search for.
 * @param {string[]} usedVideosIds - The IDs of the videos that have already been used.
 * @returns {Promise<{videoId: string, tooHard: boolean}>} The ID of the vertical video found.
 */
const chooseVideoFromYoutube = async (mainIdea: any, usedVideosIds: string[] = [], typeOfVideo = "curiosity") => {
    let tooHard = false;
    const mainIdeaText = mainIdea.text;
    const mainIdeaOriginalText = mainIdea.original_text;
    do {
        const processedMainIdeas = await workMainIdeas(mainIdeaText, tooHard, mainIdeaOriginalText, typeOfVideo);
        const { search_queries, visual_prompts } = processedMainIdeas;
        for (let processedMainIdea of search_queries) {
            console.log('--> Checking videos for processed idea: ', processedMainIdea)
            const { videoId, tooHard: too_hard } = await checkVideosForMainIdea(processedMainIdea, visual_prompts, tooHard);
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
const checkVideosForMainIdea = async (processedMainIdea: string, visual_prompts: string[], tooHard = false) => {
    const fullTerm = `${processedMainIdea}`;
    const searchVideosStartTime = new Date().getTime();
    const results = await searchVideosInYoutube(fullTerm, null, 50, tooHard);
    const searchVideosEndTime = new Date().getTime();
    console.log('------> Search videos time: ', (searchVideosEndTime - searchVideosStartTime) / 1000, ' seconds');
    if (results.length === 0) {
        tooHard = true;
        console.log('---> No video found for term: ', processedMainIdea);
        return { videoId: null, tooHard: true };
    }

    for (let index = 0; index < results.length; index++) {
        const item = results[index];
        console.log('----> Checking item: ', getYoutubeVideoUrl(item.id))
        const result = await checkResultItemForMainIdea(processedMainIdea, visual_prompts, item, index + 1);
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
const checkResultItemForMainIdea = async (mainIdea: string, visual_prompts: string[], item: any, index = 0) => {
    const videoId = item.id;
    try {
        console.log('-----> Checking result item for term: ', mainIdea, ' - ', videoId, ' - ', index);
        const cacheDir = 'cache/videoInfo';
        const cachePath = `${cacheDir}/${videoId}.json`;
        if (fs.existsSync(cachePath)) {
            return {};
        } else {
            if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        }
        fs.writeFileSync(cachePath, JSON.stringify(item, null, 2));

        const thumbnailStartTime = new Date().getTime();
        const frameInGoodCondition = await isThumbnailAcceptable(item, visual_prompts);
        const thumbnailEndTime = new Date().getTime();
        console.log('------> Thumbnail analysis time: ', (thumbnailEndTime - thumbnailStartTime) / 1000, ' seconds');
        if (!frameInGoodCondition) {
            return null;
        }
        // Check if there is frames and fram info of video id
        const infoOfFrames = await framesAndFrameInfoExists(videoId);
        if (infoOfFrames) {
            return { videoId };
        }
        // Download video and process frames
        console.log('------> Downloading video...');
        const downloadStartTime = new Date().getTime();
        const videoPath = await downloadVideo(videoId);
        const downloadEndTime = new Date().getTime();
        console.log('------> Video download time: ', (downloadEndTime - downloadStartTime) / 1000, ' seconds');
        console.log('------> Video downloaded: ', videoPath);

        // Select frames query for the video
        console.log('------> Selecting frames query...');
        const selectQuery = await selectFramesQueryForAVideo(videoPath);

        console.log('------> Select query: ', selectQuery);
        const extractFramesStartTime = new Date().getTime();
        await extractFramesToDisk(videoPath, videoId, selectQuery);
        const extractFramesEndTime = new Date().getTime();
        console.log('------> Frames extraction time: ', (extractFramesEndTime - extractFramesStartTime) / 1000, ' seconds');
        console.log('------> Starting to process frames (from disk)...');
        const processFramesStartTime = new Date().getTime();
        const scores = await processStreamingFrames(visual_prompts, videoId);
        const processFramesEndTime = new Date().getTime();
        console.log('------> Frames processing time: ', (processFramesEndTime - processFramesStartTime) / 1000, ' seconds');

        console.log('------> Scores: ', scores);
        const sortingScores = scores.sort((a, b) => b[1] - a[1]);
        const bestScore = sortingScores?.[0];
        if (bestScore?.[1] >= parseFloat(process.env.THRESHOLD_SIMILARITY ?? '0') && bestScore[0] != null) {
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
const downloadVideo = async (videoId: string) => {
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
const writeVideoIdWithFrame = async (videoId: string, frameName: string) => {
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
 * @returns {Promise<void>} A promise that resolves when the frames have been extracted.
 */
const selectFramesQueryForAVideo = async (videoPath: string) => {

    const videoDuration = await getMediaDuration(videoPath);
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
 * Extracts frames from a video to disk (./frames/{videoId}/frame_0001.jpg, ...).
 * Skips if folder already has frames. Allows resuming and re-running CLIP later.
 * @param {string} videoPath - Path to the video file
 * @param {string} videoId - YouTube video ID (used for folder name)
 * @param {string} selectQuery - ffmpeg filter e.g. "fps=1/15"
 * @returns {Promise<string>} Frames folder path
 */
const extractFramesToDisk = async (videoPath: string, videoId: string, selectQuery: string) => {
    const framesFolder = `./frames/${videoId}`;
    if (!fs.existsSync("./frames")) fs.mkdirSync("./frames", { recursive: true });
    if (!fs.existsSync(framesFolder)) fs.mkdirSync(framesFolder, { recursive: true });

    const existing = fs.readdirSync(framesFolder).filter((f) => f.endsWith(".jpg"));
    if (existing.length > 0) {
        console.log(`------> Frames already on disk (${existing.length}), skipping extraction`);
        return framesFolder;
    }
    const outputPattern = `${framesFolder}/frame_%04d.jpg`;
    await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
            .inputOptions(["-nostdin"])
            .videoFilters([selectQuery, "scale=224:224"])
            .outputOptions(["-vsync", "vfr"])
            .output(outputPattern)
            .on("end", () => resolve())
            .on("error", (err) => reject(err))
            .run();
    });
    console.log(`------> Frames extracted to ${framesFolder}`);
    return framesFolder;
};

/**
 * Removes a video and its frames from the filesystem.
 * @param {string} videoId - The ID of the video to remove.
 * @returns {Promise<void>} A promise that resolves when the video and its frames have been removed.
 */
const removeVideoAndFrames = async (videoId: string) => {
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
const framesAndFrameInfoExists = async (videoId: string) => {
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
const downloadFinalVideo = async (videoId: string) => {
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

const getMediaDuration = async (videoPath: string): Promise<number> => {
    const duration = await new Promise<number>((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err: Error | null, metadata: any) => {
            if (err) reject(err);
            resolve(metadata.format.duration);
        });
    });
    return duration;
}


export {
    workMainIdeas,
    chooseVideoFromYoutube,
    checkVideosForMainIdea,
    checkResultItemForMainIdea,
    downloadVideo,
    selectFramesQueryForAVideo,
    extractFramesToDisk,
    removeVideoAndFrames,
    framesAndFrameInfoExists,
    downloadFinalVideo,
    getMediaDuration,
    writeVideoIdWithFrame

}
import dotenv from 'dotenv';
dotenv.config();

import { downloadYoutubeVideo, HeatmapSegment } from "./videoDownloader.js";
import { getProcessedMainIdea } from "../services/deepSeek.service.js";
import { getYoutubeVideoUrl } from "../services/youtube.service.js";
import { searchVideosInYoutube } from "../services/video.service.js";

import processStreamingFrames from "../embeddings/processFrames.js";
import fs from 'fs';
import os from 'os';
import path from 'path';
import ffmpegStatic from "ffmpeg-static";
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
        const frames = await extractFramesToDisk(videoPath, selectQuery.selectQuery);
        const extractFramesEndTime = new Date().getTime();
        console.log('------> Frames extraction time: ', (extractFramesEndTime - extractFramesStartTime) / 1000, ' seconds');
        console.log('------> Starting to process frames (in memory)...');
        const processFramesStartTime = new Date().getTime();
        const scores = await processStreamingFrames(visual_prompts, frames, "frames");
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

    let secondsBetweenFrames: number;

    if (minutes > 3 && minutes < 5) {
        secondsBetweenFrames = 15;
    } else if (minutes > 1 && minutes < 3) {
        secondsBetweenFrames = 5;
    } else {
        secondsBetweenFrames = 1;
    }

    const selectQuery = `fps=1/${secondsBetweenFrames}`;

    return { selectQuery, secondsBetweenFrames };
};

/** Segundos máximos del vídeo a procesar para CLIP (0 = sin límite). */
const frameExtractMaxSeconds = (): number => {
    const raw = process.env.FRAME_EXTRACT_MAX_SECONDS;
    if (raw === undefined || raw === "") return 120;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Extrae frames del vídeo a un directorio temporal del OS, los lee como buffers y borra el directorio.
 * Mismo resultado que antes (Buffer[]) pero usando la escritura a disco de ffmpeg, que es más rápida.
 */
const extractFramesToDisk = async (videoPath: string, selectQuery: string): Promise<Buffer[]> => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-frames-"));
    const outputPattern = path.join(tmpDir, "frame_%04d.jpg");
    const maxSec = frameExtractMaxSeconds();
    const startMs = Date.now();

    console.log(`------> Extrayendo frames a carpeta temporal: ${tmpDir} (máx ${maxSec}s)`);

    try {
        await new Promise<void>((resolve, reject) => {
            const cmd = ffmpeg(videoPath)
                .inputOptions(["-nostdin"])
                .videoFilters([selectQuery, "scale=224:224:flags=fast_bilinear"])
                .outputOptions(["-vsync", "vfr"]);

            if (maxSec > 0) cmd.duration(maxSec);

            let lastCount = 0;
            const progressInterval = setInterval(() => {
                const written = fs.readdirSync(tmpDir).filter(f => f.endsWith(".jpg")).length;
                if (written !== lastCount) {
                    lastCount = written;
                    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
                    process.stdout.write(`\r------> ffmpeg: ${written} frames | ${elapsed}s`);
                }
            }, 1000);

            cmd.output(outputPattern)
                .on("end", () => {
                    clearInterval(progressInterval);
                    process.stdout.write("\n");
                    resolve();
                })
                .on("error", (err) => {
                    clearInterval(progressInterval);
                    reject(err);
                })
                .run();
        });

        const files = fs.readdirSync(tmpDir).filter(f => f.endsWith(".jpg")).sort();
        const buffers = files.map(f => fs.readFileSync(path.join(tmpDir, f)));
        console.log(`------> Frames en memoria: ${buffers.length} JPEG (${((Date.now() - startMs) / 1000).toFixed(1)}s)`);
        return buffers;
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
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

/**
 * Returns the start_time (in seconds) of the most-watched segment from an already-fetched heatmap array.
 * Returns null if the array is empty or falsy.
 */
const getMostWatchedSecond = (heatmaps: HeatmapSegment[] | null | undefined): number | null => {
    if (!heatmaps || heatmaps.length === 0) return null;
    const best = heatmaps.reduce((prev, curr) => curr.value > prev.value ? curr : prev);
    return best.start_time;
};


const secondsToHMS = (totalSeconds: number): string => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return [h, m, s].map(v => v.toString().padStart(2, "0")).join(":");
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
    writeVideoIdWithFrame,
    getMostWatchedSecond,
    secondsToHMS

}
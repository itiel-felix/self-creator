import { getSearchQueries } from "../../services/deepSeek.service.js";
import { getBannedTerms } from "./utils.js";
import { searchVideosInYoutube } from "../../services/video.service.js";
import { downloadYoutubeVideo, getMostWatchedSecond, HeatmapSegment } from "../../video/videoDownloader.js";
import { selectFramesQueryForAVideo, extractFramesToDisk, writeVideoIdWithFrame } from "../../video/videoUtils.js";
import { isThumbnailAcceptable } from "../../video/processThumbnails.js";
import processStreamingFrames from "../../embeddings/processFrames.js";
import fs from "fs";
import { getYoutubeVideoUrl } from "../../services/youtube.service.js";
import { YoutubeEntry } from "../../services/video.service.js";
import {
    generateStartAndEndTime,
    markVideoAsAnalyzed,
    generateRandomDurations
} from "./utils.js";
import { Logger } from "../../../classes/Logger.js";
const selectedVideos: { video_id: string; video_path: string; final_duration: number }[] = [];

export const getVideoGameVideos = async (videoGameName: string, _typeOfVideo?: string, videoDuration?: number): Promise<any[]> => {
    const banned_terms = await getBannedTerms();
    console.log('-> Getting search queries for video game name: ', videoGameName);
    const { search_queries } = await getSearchQueries(videoGameName, banned_terms);
    console.log('-> Search queries: ', search_queries);
    let maxVideos = 40;
    let round = 1;
    let analyzedVideos: string[] = [];
    const randomTimes = generateRandomDurations(videoDuration ?? 0);
    const numberOfVideos = randomTimes.length;

    // Check if results are available, if not, search for videos and process them
    if (!areResultsAvailable()) {


        let chunkElement = 0 // Process 3 chunks of x videos each
        const chunkSize = 3;
        while (selectedVideos.length < numberOfVideos) {
            const searchQuery = search_queries.shift();
            console.log('-> Searching videos for search query: ', searchQuery);

            const searchesVideos = await searchVideos({ searchQuery, maxVideos, round, analyzedVideos });
            analyzedVideos = [...analyzedVideos, ...searchesVideos.map((video: any) => video.id ?? video.videoId)];

            const [chunks_1, chunks_2, chunks_3, chunks_4] = separateArrayInChunks(searchesVideos, chunkSize);
            const promises: Promise<void>[] = [];

            if (chunks_1?.length > 0) promises.push(processChunk(chunks_1, randomTimes, numberOfVideos, searchQuery, search_queries, chunkElement + 1));
            if (chunks_2?.length > 0) promises.push(processChunk(chunks_2, randomTimes, numberOfVideos, searchQuery, search_queries, chunkElement + 2));
            if (chunks_3?.length > 0) promises.push(processChunk(chunks_3, randomTimes, numberOfVideos, searchQuery, search_queries, chunkElement + 3));
            if (chunks_4?.length > 0) promises.push(processChunk(chunks_4, randomTimes, numberOfVideos, searchQuery, search_queries, chunkElement + 4));

            await Promise.all(promises as Promise<void>[]);
            chunkElement += 3;
        }
    } else {
        // If results are available, return them
        const results = JSON.parse(fs.readFileSync('./cache/results.json', 'utf8'));
        return results;
    }
    const formattedVideos = selectedVideos.map((video) => {
        const { start_time, end_time } = generateStartAndEndTime(video.video_id, video.final_duration, videoDuration ?? 0);
        return {
            video_id: video.video_id,
            video_path: video.video_path,
            final_duration: video.final_duration,
            start_time,
            end_time
        };
    }
    );
    // Write on results.json
    fs.writeFileSync('./cache/results.json', JSON.stringify(formattedVideos, null, 2));
    return formattedVideos;
}
const getSeconds = (startTime: number, endTime: number) => {
    return (endTime - startTime) / 1000;
}

const secondsToHMS = (totalSeconds: number): string => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return [h, m, s].map(v => v.toString().padStart(2, "0")).join(":");
}

const processVideo = async (video: any, comparePrompts: string[], indicator: number, logger: Logger, videoIndex: number): Promise<string | null> => {
    try {
        logger.info(`-> Chunk: ${indicator} - Video ${videoIndex} - Processing video: ${video.id} \n\t- URL: ${getYoutubeVideoUrl(video.id)} \n\t- Title: ${video.title}`);
        // Process Thumbnail
        const thumbnailPassed = await isThumbnailAcceptable(video, comparePrompts);
        if (!thumbnailPassed) {
            return null;
        }
        logger.info('-> Thumbnail passed');

        // Si hay heatmap usamos el segundo más visto; si no, empezamos desde el minuto 1 (evitamos intros)
        const mostWatchedSecond = getMostWatchedSecond(video.heatmap as HeatmapSegment[] | null) ?? 60;
        const sectionStart = secondsToHMS(mostWatchedSecond);
        const sectionEnd = secondsToHMS(mostWatchedSecond + 10);
        logger.info(`-> Chunk: ${indicator} - Video ${videoIndex} - mostWatchedSecond: ${mostWatchedSecond} | section: ${sectionStart}-${sectionEnd}`);

        const downloadStartTime = new Date().getTime();
        const videoPath = await downloadYoutubeVideo({
            videoId: video.id,
            outputFolder: './temp/youtube',
            shouldReturnJSON: false,
            extraOptions: { format: "bv*[ext=mp4][height<=360]" },
            sectionToDownload: { start_time: sectionStart, end_time: sectionEnd },
        });
        logger.info(`-> Chunk: ${indicator} - Video ${videoIndex} - Downloaded in: ${getSeconds(downloadStartTime, new Date().getTime())}s`);

        const { selectQuery } = await selectFramesQueryForAVideo(videoPath as string);
        logger.info(`-> Chunk: ${indicator} - Video ${videoIndex} - Extracting frames...`);
        const frames = await extractFramesToDisk(videoPath as string, selectQuery);
        const scores = await processStreamingFrames(comparePrompts, frames, "frames");
        const sortingScores = scores.sort((a, b) => b[1] - a[1]);
        const [bestScoreName, bestScoreValue] = sortingScores?.[0];
        if (bestScoreValue >= parseFloat(process.env.THRESHOLD_SIMILARITY as string)) {
            await writeVideoIdWithFrame(video.id, bestScoreName);
            return videoPath as string;
        } else {
            return null;
        }
    }
    catch (error) {
        logger.error(`-> Chunk: ${indicator} - Video ${videoIndex} - Error processing video: ${error}`);
        return null;
    }
}

const searchVideos = async ({ searchQuery, maxVideos, analyzedVideos }: { searchQuery: string; maxVideos: number; round: number; analyzedVideos: string[] }) => {
    let round = 1;
    let filteredVideos: YoutubeEntry[] = [];
    while (filteredVideos.length == 0 && round < 3) {
        const videos = await searchVideosInYoutube(searchQuery, null, maxVideos * round);
        filteredVideos = videos.filter(video => !analyzedVideos.includes(video.id));
        round++;
    }
    return filteredVideos;
}


const processChunk = async (
    searchesVideos: any[] = [],
    randomTimes: number[],
    numberOfVideos: number,
    searchQuery: string,
    search_queries: string[],
    indicator: number
) => {

    const logger = new Logger(`${searchQuery}_${indicator.toString()}`);
    logger.info(`-> Processing chunk: ${indicator}`);
    for (let videoIndex = 0; videoIndex < searchesVideos.length; videoIndex++) {
        const video = searchesVideos[videoIndex];
        if (randomTimes.length == selectedVideos.length) {
            break;
        }
        video.hasBeenAnalyzed = true;
        const videoPath = await processVideo(video, search_queries, indicator, logger, videoIndex + 1);
        if (videoPath != null) {
            const clipLength = randomTimes[selectedVideos.length];
            selectedVideos.push({ video_id: video.id, video_path: videoPath, final_duration: clipLength });
            logger.info(`-> Video added to selected videos: ${video.id} ( ${selectedVideos.length} of ${numberOfVideos} )`);
        }
        if (selectedVideos.length >= numberOfVideos) {
            break;
        }
        markVideoAsAnalyzed(searchQuery, video.id);
    }
    logger.info(`-> Chunk: ${indicator} - CHUNK DONE - Videos selected: ${selectedVideos.length} of ${numberOfVideos}`);
}

const separateArrayInChunks = (array: any[], chunkSize: number) => {
    const chunks: any[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

const areResultsAvailable = (): boolean => {
    return fs.existsSync('./cache/results.json');
}
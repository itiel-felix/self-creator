import { getSearchQueries } from "../../services/deepSeek.service.js";
import { getBannedTerms } from "./utils.js";
import { searchVideosInYoutube } from "../../services/video.service.js";
import { downloadYoutubeVideo } from "../../video/videoDownloader.js";
import { selectFramesQueryForAVideo, extractFramesToDisk, writeVideoIdWithFrame } from "../../video/videoUtils.js";
import { isThumbnailAcceptable } from "../../video/processThumbnails.js";
import processStreamingFrames from "../../embeddings/processFrames.js";
import { getStartAndEndTimeFromVideoId } from "../../utils.js";
import fs from "fs";
import { getYoutubeVideoUrl } from "../../services/youtube.service.js";
import { YoutubeEntry } from "../../services/video.service.js";

export const getVideoGameVideos = async (videoGameName: string, _typeOfVideo?: string, videoDuration?: number): Promise<any[]> => {
    const banned_terms = await getBannedTerms();
    console.log('-> Getting search queries for video game name: ', videoGameName);
    const { search_queries } = await getSearchQueries(videoGameName, banned_terms);
    console.log('-> Search queries: ', search_queries);
    let maxVideos = 10;
    let round = 1;
    let analyzedVideos: string[] = [];
    let selectedVideos: { video_id: string; video_path: string; final_duration: number }[] = [];
    const randomTimes = generateRandomDurations(videoDuration ?? 0);
    const numberOfVideos = randomTimes.length;

    if (fs.existsSync('./cache/results.json')) {
        const results = JSON.parse(fs.readFileSync('./cache/results.json', 'utf8'));
        return results;
    } else {
        while (selectedVideos.length < numberOfVideos) {
            const searchQuery = search_queries.shift();
            console.log('-> Searching videos for search query: ', searchQuery);

            const searchesVideos = await searchVideos({ searchQuery, maxVideos, round, analyzedVideos });
            analyzedVideos = [...analyzedVideos, ...searchesVideos.map((video: any) => video.id ?? video.videoId)];

            for (const video of searchesVideos) {
                if (randomTimes.length == numberOfVideos) {
                    break;
                }
                video.hasBeenAnalyzed = true;
                const videoPath = await processVideo(video, search_queries);
                if (videoPath != null) {
                    const clipLength = randomTimes[selectedVideos.length]; // 10
                    selectedVideos.push({ video_id: video.id, video_path: videoPath, final_duration: clipLength });
                    console.log('-> Video added to selected videos: ', video.id, ' (', selectedVideos.length, ' of ', numberOfVideos, ')');
                }
                if (selectedVideos.length >= numberOfVideos) {
                    break;
                }
                markVideoAsAnalyzed(searchQuery, video.id);
            }
        }
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

const processVideo = async (video: any, comparePrompts: string[]): Promise<string | null> => {
    try {
        console.log('-> Processing video: ', video.id, '\n\t- URL: ', getYoutubeVideoUrl(video.id), '\n\t- Title: ', video.title);
        // Process Thumbnail
        const thumbnailPassed = await isThumbnailAcceptable(video, comparePrompts);
        if (!thumbnailPassed) {
            return null;
        }
        console.log('-> Thumbnail passed');
        console.log('-> Downloading video...');
        const sectionToDownload = generateSectionToDownload()
        const videoPath = await downloadYoutubeVideo({ videoId: video.id, outputFolder: './temp/youtube' });
        console.log('-> Video downloaded: ', videoPath);
        console.log('-> Selecting frames query...');
        const selectQuery = await selectFramesQueryForAVideo(videoPath as string);

        await extractFramesToDisk(videoPath as string, video.id, selectQuery as string);

        const scores = await processStreamingFrames(comparePrompts, video.id);
        const sortingScores = scores.sort((a, b) => b[1] - a[1]);
        const bestScore = sortingScores?.[0];
        if (bestScore?.[1] >= parseFloat(process.env.THRESHOLD_SIMILARITY as string)) {
            await writeVideoIdWithFrame(video.id, bestScore[0]);
            return videoPath;
        } else {
            return null;
        }
    }
    catch (error) {
        console.error('Error processing video: ', error);
        return null;
    }
}

const searchVideos = async ({ searchQuery, maxVideos, analyzedVideos }: { searchQuery: string; maxVideos: number; round: number; analyzedVideos: string[] }) => {
    let round = 1;
    let filteredVideos: YoutubeEntry[] = [];
    while (filteredVideos.length == 0) {
        const videos = await searchVideosInYoutube(searchQuery, null, maxVideos * round);
        filteredVideos = videos.filter(video => !analyzedVideos.includes(video.id));
        round++;
    }
    return filteredVideos;
}

const generateRandomDurations = (videoDuration: number) => {
    const minDuration = 1;
    const maxDuration = 2;
    const randomTimes: number[] = [];
    let sumOfDurations = 0;
    console.log('-> Generating random durations for video duration: ', videoDuration);
    while (true) {
        // Video duration = 205
        const randomTime = Math.random() * (maxDuration - minDuration) + minDuration; // entre 0.5 y 2 s
        sumOfDurations += randomTime; // 210
        if (sumOfDurations > videoDuration) {
            randomTimes.push(randomTime - (sumOfDurations - videoDuration)); // 10
            break;
        }
        randomTimes.push(randomTime);
    }
    console.log('-> Random durations: ', randomTimes.reduce((acc, time) => acc + time, 0));
    console.log('-> Clips quantity: ', randomTimes.length);
    return randomTimes;
}

const generateStartAndEndTime = (videoId: string, clipDuration: number, videoDuration: number): { start_time: number; end_time: number } => {
    let start_time = 0;
    let end_time = 0;
    const { start_time: videoStart_time, end_time: videoEnd_time } = getStartAndEndTimeFromVideoId(videoId, clipDuration, videoDuration);
    start_time = videoStart_time;
    end_time = videoEnd_time;
    return { start_time, end_time };
}

const markVideoAsAnalyzed = async (searchWord: string, videoId: string) => {
    const cachedData = JSON.parse(fs.readFileSync('./cache/youtube.json', 'utf8'));
    const entry = cachedData[searchWord].entries.find(entry => entry.id === videoId);
    if (entry) {
        entry.hasBeenAnalyzed = true;
        fs.writeFileSync('./cache/youtube.json', JSON.stringify(cachedData, null, 2));
    }
}

const generateSectionToDownload = () => {
    // Generate a random section that in 00:00:00,000 format
    // duration of the clip is 1 minute
    // random start time between 0 and 60 seconds
    const randomStartTime = Math.random() * 60;
    const randomEndTime = randomStartTime + 60;
    const start_time = `00:00:${randomStartTime.toFixed(3).padStart(6, '0')}`; // 00:00:00,000
    const end_time = `00:00:${randomEndTime.toFixed(3).padStart(6, '0')}`;// 00:01:00,000
    return { start_time, end_time };
}
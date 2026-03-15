import { getSearchQueries } from "../../services/deepSeek.service.js";
import { getBannedTerms } from "./utils.js";
import { searchVideosInYoutube } from "../../services/video.service.js";
import { downloadYoutubeVideo } from "../../video/videoDownloader.js";
import { selectFramesQueryForAVideo, extractFramesToDisk } from "../../video/videoUtils.js";
import { processThumbnails } from "../../video/processThumbnails.js";
import processStreamingFrames from "../../embeddings/processFrames.js";
export const getVideoGameVideos = async (videoGameName, _typeOfVideo) => {
    const banned_terms = await getBannedTerms();
    const searchQueries = await getSearchQueries(videoGameName, banned_terms);
    let maxVideos = 10;
    let round = 1;
    let analyzedVideos = [];
    for (const searchQuery of searchQueries.search_queries) {
        const videos = await searchVideos({ searchQuery, maxVideos, round, analyzedVideos });
        analyzedVideos = [...analyzedVideos, ...videos.map((video) => video.id ?? video.videoId)];
        for (const video of videos) {
            const videoPath = await processVideo(video, searchQueries.visual_prompts);
            if (videoPath != null) {
                return [{ video_path: videoPath, final_duration: 0, start_time: 0, text: '' }];
            }
        }
    }
    return [];
};
const processVideo = async (video, comparePrompts) => {
    try {
        // Process Thumbnail
        const thumbnailPath = await processThumbnails(video);
        if (thumbnailPath === null) {
            return null;
        }
        const videoPath = await downloadYoutubeVideo({ videoId: video.id, outputFolder: './temp/youtube' });
        const selectQuery = await selectFramesQueryForAVideo(videoPath);
        await extractFramesToDisk(videoPath, video.id, selectQuery);
        const scores = await processStreamingFrames(comparePrompts, video.id);
        const sortingScores = scores.sort((a, b) => b[1] - a[1]);
        const bestScore = sortingScores?.[0];
        if (bestScore?.[1] >= parseFloat(process.env.THRESHOLD_SIMILARITY)) {
            return videoPath;
        }
        else {
            return null;
        }
    }
    catch (error) {
        console.error('Error processing video: ', error);
        return null;
    }
};
const searchVideos = async ({ searchQuery, maxVideos, round, analyzedVideos }) => {
    const videos = await searchVideosInYoutube(searchQuery, null, maxVideos * round);
    const filteredVideos = videos.filter(video => !analyzedVideos.includes(video.id));
    return filteredVideos;
};

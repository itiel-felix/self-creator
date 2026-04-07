import { searchVideosInYoutube } from "../services/video.service.js";
import { downloadYoutubeVideo, HeatmapSegment } from "./videoDownloader.js";
import fs from "fs";
import { getMostWatchedSecond, secondsToHMS } from "./videoUtils.js";
import { markVideoAsAnalyzed } from "../workflows/videogame/utils.js";

const DownloadDopamineVideo = async (minVideoDuration: number = 300): Promise<string | undefined> => {
    if (!fs.existsSync('./temp/brainrot')) {
        fs.mkdirSync('./temp/brainrot', { recursive: true });
    }
    const query = "minecraft parkour gameplay no copyright";
    let round = 1;
    const videosQty = 10;
    let videoAlreadyDownloaded = true;
    do {
        try {

            const youtubeVideo = await searchVideosInYoutube(query, minVideoDuration, videosQty * round);

            for (const video of youtubeVideo) {
                if (fs.existsSync(`./temp/brainrot/${video.id}.mp4`)) {
                    videoAlreadyDownloaded = true;
                    markVideoAsAnalyzed(query, video.id);
                } else {
                    videoAlreadyDownloaded = false;
                    const mostWatchedSecond = getMostWatchedSecond(video.heatmap as HeatmapSegment[] | null);
                    // if (mostWatchedSecond == null) {
                    //     continue;
                    // }
                    // const mostWatchedSecondNumber = mostWatchedSecond + neededVideoDuration;
                    // if (mostWatchedSecondNumber > (video.duration ?? 0)) {
                    //     continue;
                    // }
                    const sectionStart = secondsToHMS(mostWatchedSecond as number);
                    const sectionEnd = secondsToHMS(mostWatchedSecond as number + minVideoDuration);
                    const videoPath = await downloadYoutubeVideo({
                        videoId: video.id,
                        outputFolder: './temp/brainrot',
                        minDuration: minVideoDuration,
                        extraOptions: {
                            format: "bv*[ext=mp4][height<=1080]",
                        },
                        sectionToDownload: { start_time: sectionStart, end_time: sectionEnd },
                    });
                    return videoPath as string;

                }

            }
        } catch (error) {
            console.error('Error downloading video: ', error);
        }
        round++;
    } while (videoAlreadyDownloaded);
    return undefined;
}

export default DownloadDopamineVideo;

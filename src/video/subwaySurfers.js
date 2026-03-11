import { searchVideosInYoutube } from "../services/video.service.js";
import { downloadYoutubeVideo } from "./videoDownloader.js";
import fs from "fs";

const subwaySurfers = async (minDuration = 300) => {
    if (!fs.existsSync('./temp/brainrot')) {
        fs.mkdirSync('./temp/brainrot');
    }
    let videoAlreadyDownloaded = true;
    do {
        const youtubeVideo = await searchVideosInYoutube("subway surfers coinless run", minDuration, 10);

        for (const video of youtubeVideo) {
            if (fs.existsSync(`./temp/brainrot/${video.id}.mp4`)) {
                videoAlreadyDownloaded = true;
            } else {
                videoAlreadyDownloaded = false;
                // Download the video
                const videoPath = await downloadYoutubeVideo({ videoId: video.id, outputFolder: './temp/brainrot', minDuration: minDuration });
                // Extract frames from the video
                return videoPath;
            }
        }
    } while (videoAlreadyDownloaded);
}

export default subwaySurfers;
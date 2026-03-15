import { searchVideosInYoutube } from "../services/video.service.js";
import { downloadYoutubeVideo } from "./videoDownloader.js";
import fs from "fs";

const subwaySurfers = async (minDuration: number = 300): Promise<string | undefined> => {
    if (!fs.existsSync('./temp/brainrot')) {
        fs.mkdirSync('./temp/brainrot', { recursive: true });
    }
    let videoAlreadyDownloaded = true;
    do {
        const youtubeVideo = await searchVideosInYoutube("subway surfers gameplay", minDuration, 10);

        for (const video of youtubeVideo) {
            if (fs.existsSync(`./temp/brainrot/${video.id}.mp4`)) {
                videoAlreadyDownloaded = true;
            } else {
                videoAlreadyDownloaded = false;
                try {
                    const videoPath = await downloadYoutubeVideo({
                        videoId: video.id,
                        outputFolder: './temp/brainrot',
                        minDuration: minDuration,
                        extraOptions: {
                            format: "bv*[ext=mp4][height<=1080]",
                        }
                    });
                    return videoPath as string;
                } catch (error) {
                    console.error('Error downloading video: ', error);
                }
            }
        }
    } while (videoAlreadyDownloaded);
    return undefined;
}

export default subwaySurfers;

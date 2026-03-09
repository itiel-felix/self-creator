import { searchVideosInYoutube } from "../services/video.service.js";
import { downloadYoutubeVideo } from "./videoDownloader.js";
import fs from "fs";

const subwaySurfers = async () => {
    const youtubeVideo = await searchVideosInYoutube("subway surfers coinless run");
    // Download the video
    const videoPath = await downloadYoutubeVideo({ videoId: youtubeVideo[0].id, outputFolder: './temp', customName: 'subwaySurfersCoinlessRun' });
    // Extract frames from the video
}

export default subwaySurfers;
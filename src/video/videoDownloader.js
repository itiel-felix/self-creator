import fs, { writeFileSync } from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { getYoutubeVideoUrl } from "../services/youtube.service.js";
import youtubedl from "youtube-dl-exec";

const generateVideoId = () => Math.random().toString(36).substring(2, 15);


export const downloadVideo = async (url, outputFolder) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);
    const filePath = `${outputFolder}/${generateVideoId()}`;
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(filePath));
    return filePath;
}


export const downloadYoutubeVideo = async ({
    videoId,
    outputFolder,
    shouldReturnJSON = false,
    extraOptions = {},
    customName = null,
    minDuration = null
}) => {

    const videoUrl = getYoutubeVideoUrl(videoId);
    const filePath = `${outputFolder}/${customName || videoId}.mp4`;
    if (fs.existsSync(filePath)) {
        console.log(`Video ${videoId} already downloaded, skipping...`);
        return filePath;
    }
    const baseOpt = {
        jsRuntimes: "node",
        noCheckCertificates: true,

        noWarnings: true,
        cookiesFromBrowser: "firefox"
    }
    // cortar video
    if (minDuration) {
        const end = new Date(minDuration * 1000).toISOString().substring(11, 19);
        extraOptions.downloadSections = `*00:00:00-${end}`;
    }

    if (shouldReturnJSON) {
        console.log('Returning JSON for video: ', videoId);
        const youtubeDlOptions = { dumpSingleJson: true, ...baseOpt, ...extraOptions };
        const json = await youtubedl(videoUrl, youtubeDlOptions);
        return json;
    }
    console.log('Downloading video from YouTube: ', videoUrl);
    await youtubedl(videoUrl, {
        output: filePath,
        format: "bv*[ext=mp4][height<=1080]",
        mergeOutputFormat: "mp4",
        ...baseOpt,
        ...extraOptions
    });
    return filePath;
}
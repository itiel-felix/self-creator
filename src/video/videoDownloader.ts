import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { getYoutubeVideoUrl } from "../services/youtube.service.js";
import youtubedl from "youtube-dl-exec";
import fs from 'fs';

const generateVideoId = (): string => Math.random().toString(36).substring(2, 15);


export const downloadVideo = async (url: string, outputFolder: string): Promise<string> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);
    const filePath = `${outputFolder}/${generateVideoId()}`;
    await pipeline(Readable.fromWeb(response.body as any), fs.createWriteStream(filePath));
    return filePath;
}


export interface DownloadYoutubeOptions {
    videoId: string;
    outputFolder: string;
    shouldReturnJSON?: boolean;
    extraOptions?: Record<string, any>;
    customName?: string | null;
    minDuration?: number | null;
}

export const downloadYoutubeVideo = async ({
    videoId,
    outputFolder,
    shouldReturnJSON = false,
    extraOptions = {},
    customName = null,
    minDuration = null
}: DownloadYoutubeOptions): Promise<string | any> => {

    const videoUrl = getYoutubeVideoUrl(videoId);
    const filePath = `${outputFolder}/${customName || videoId}.mp4`;
    if (fs.existsSync(filePath)) {
        console.log('------> Video already downloaded: ', filePath);
        return filePath;
    }
    const baseOpt: Record<string, any> = {
        jsRuntimes: "node",
        noCheckCertificates: true,
        noWarnings: true,
        cookiesFromBrowser: "firefox"
    };
    if (minDuration) {
        const end = new Date(minDuration * 1000).toISOString().substring(11, 19);
        extraOptions.downloadSections = `*00:00:00-${end}`;
    }

    if (shouldReturnJSON) {
        const youtubeDlOptions = { dumpSingleJson: true, ...baseOpt, ...extraOptions };
        const json = await youtubedl(videoUrl, youtubeDlOptions);
        return json;
    }
    await youtubedl(videoUrl, {
        output: filePath,
        format: "bv*[ext=mp4][height<=1080]",
        mergeOutputFormat: "mp4",
        externalDownloader: "aria2c",
        ...baseOpt,
        ...extraOptions
    });
    return filePath;
}

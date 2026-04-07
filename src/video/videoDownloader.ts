import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { getYoutubeVideoUrl } from "../services/youtube.service.js";
import fs from 'fs';
import { runYtDlp } from "../utils/ytDlpRunner.js";

const generateVideoId = (): string => Math.random().toString(36).substring(2, 15);

export interface HeatmapSegment {
    start_time: number;
    end_time: number;
    value: number; // 0–1, where 1 is the most replayed segment
}


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
    sectionToDownload?: { start_time: string; end_time: string } | null;
    forceDownload?: boolean;
}

export const downloadYoutubeVideo = async ({
    videoId,
    outputFolder,
    shouldReturnJSON = false,
    extraOptions = {},
    customName = null,
    minDuration = null,
    sectionToDownload = null,
    forceDownload = false
}: DownloadYoutubeOptions): Promise<string | any> => {

    const videoUrl = getYoutubeVideoUrl(videoId);
    const filePath = `${outputFolder}/${customName || videoId}.mp4`;
    if (fs.existsSync(filePath) && !forceDownload) {
        console.log('------> Video already downloaded: ', filePath);
        return filePath;
    }

    // Allow overriding the binary location (useful if you installed yt-dlp via a venv or brew).
    const ytDlpPath = process.env.YT_DLP_PATH ?? "yt-dlp";

    // Base flags to avoid the "page needs to be reloaded" path.
    const baseArgs: string[] = [
        "--no-check-certificate",
        "--no-warnings",
        "--no-playlist",
        // Prefer the web player.
        // "--extractor-args", "youtube:player_client=web,player_skip=webpage",
        // Use browser cookies only if you explicitly set `YT_COOKIES_BROWSER`.
        ...(process.env.YT_COOKIES_BROWSER ? ["--cookies-from-browser", process.env.YT_COOKIES_BROWSER] : []),
    ];

    // Translate existing options we support from the old youtube-dl-exec wrapper.
    const format = typeof extraOptions.format === "string" ? extraOptions.format : "bv*[ext=mp4][height<=1080]";

    let downloadSections: string | null = null;
    if (minDuration) {
        const end = new Date(minDuration * 1000).toISOString().substring(11, 19);
        downloadSections = `*00:00:00-${end}`;
    }
    if (sectionToDownload) {
        downloadSections = `*${sectionToDownload.start_time}-${sectionToDownload.end_time}`;
    }
    if (typeof extraOptions.downloadSections === "string") {
        downloadSections = extraOptions.downloadSections;
    }

    // aria2c solo si está definido; si no está instalado, yt-dlp falla y antes no veías el error.
    const externalDownloaderArgs =
        process.env.YT_EXTERNAL_DOWNLOADER?.trim()
            ? ["--external-downloader", process.env.YT_EXTERNAL_DOWNLOADER.trim()]
            : [];

    if (shouldReturnJSON) {
        const args: string[] = [
            ...baseArgs,
            "--dump-single-json",
            "--skip-download",
            ...externalDownloaderArgs,
            videoUrl,
        ];
        const { stdout, stderr, exitCode } = await runYtDlp(args, { ytDlpPath });
        if (exitCode !== 0) {
            throw new Error(`yt-dlp failed (${exitCode}): ${stderr || stdout}`);
        }
        return JSON.parse(stdout);
    }

    const args: string[] = [
        ...baseArgs,
        ...externalDownloaderArgs,
        "-f", format,
        "--merge-output-format", "mp4",
        "-o", filePath,
        ...(downloadSections ? ["--download-sections", downloadSections] : []),
        videoUrl,
    ];

    console.log("------> yt-dlp args:", JSON.stringify(args));
    const { stderr, exitCode } = await runYtDlp(args, { ytDlpPath });
    if (exitCode !== 0) {
        console.error("------> yt-dlp stderr:\n", stderr);
        throw new Error(`yt-dlp failed (${exitCode}). ${stderr.slice(0, 2000)}`);
    }
    if (!fs.existsSync(filePath)) {
        throw new Error(`yt-dlp reported success but file missing: ${filePath}`);
    }
    return filePath;
}

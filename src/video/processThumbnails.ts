import fs from 'fs';
import processStreamingFrames from '../embeddings/processFrames.js';

export const processThumbnails = async (video: { id: string; thumbnails: { url: string }[] }): Promise<string> => {
    const { thumbnails } = video;
    const thumbnailPath = `./temp/thumbnails/${video.id}`;
    if (!fs.existsSync(thumbnailPath)) {
        fs.mkdirSync(thumbnailPath, { recursive: true });
    }
    for (let index = 0; index < thumbnails.length; index++) {
        const thumbnail = thumbnails[index];
        const thumbnailResponse = await fetch(thumbnail.url);
        const arrayBuffer = await thumbnailResponse.arrayBuffer();
        const thumbnailBuffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(`${thumbnailPath}/thumbnail_${index}.jpg`, thumbnailBuffer);
    }
    return thumbnailPath;
}

export const isThumbnailAcceptable = async (video: { id: string; thumbnails: { url: string }[] }, visual_prompts: string[]): Promise<boolean> => {
    const processThumbnailsStartTime = new Date().getTime();
    await processThumbnails(video);
    const processThumbnailsEndTime = new Date().getTime();
    console.log('------> Process thumbnails time: ', (processThumbnailsEndTime - processThumbnailsStartTime) / 1000, ' seconds');
    const processStreamingFramesStartTime = new Date().getTime();
    const thumbnailImage = await processStreamingFrames(visual_prompts, video.id, "thumbnails");
    const processStreamingFramesEndTime = new Date().getTime();
    console.log('------> Process streaming frames time: ', (processStreamingFramesEndTime - processStreamingFramesStartTime) / 1000, ' seconds');
    const thumbnailScore = (thumbnailImage as [string, number][]).sort((a, b) => b[1] - a[1]);
    const threshold = parseFloat(process.env.THRESHOLD_SIMILARITY_THUMBNAIL ?? '0');
    if (thumbnailScore[0][1] >= threshold) {
        return true;
    }
    return false;
}

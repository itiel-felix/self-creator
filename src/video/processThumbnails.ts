import processStreamingFrames from "../embeddings/processFrames.js";

async function fetchThumbnailBuffers(video: { thumbnails: { url: string }[] }): Promise<Buffer[]> {
    const buffers: Buffer[] = [];
    for (const thumbnail of video.thumbnails) {
        const thumbnailResponse = await fetch(thumbnail.url);
        if (!thumbnailResponse.ok) continue;
        buffers.push(Buffer.from(await thumbnailResponse.arrayBuffer()));
    }
    return buffers;
}

export const isThumbnailAcceptable = async (
    video: { id: string; thumbnails: { url: string }[] },
    visual_prompts: string[]
): Promise<boolean> => {
    const processThumbnailsStartTime = new Date().getTime();
    const buffers = await fetchThumbnailBuffers(video);
    const processThumbnailsEndTime = new Date().getTime();
    console.log("------> Fetch thumbnails time: ", (processThumbnailsEndTime - processThumbnailsStartTime) / 1000, " seconds");
    if (buffers.length === 0) {
        return false;
    }

    const processStreamingFramesStartTime = new Date().getTime();
    const thumbnailImage = await processStreamingFrames(visual_prompts, buffers, "thumbnails");
    const processStreamingFramesEndTime = new Date().getTime();
    console.log(
        "------> Process streaming frames time: ",
        (processStreamingFramesEndTime - processStreamingFramesStartTime) / 1000,
        " seconds"
    );
    const thumbnailScore = (thumbnailImage as [string, number][]).sort((a, b) => b[1] - a[1]);
    const threshold = parseFloat(process.env.THRESHOLD_SIMILARITY_THUMBNAIL ?? "0");
    if (thumbnailScore[0][1] >= threshold) {
        return true;
    }
    return false;
};

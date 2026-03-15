import { runClipJob } from "./clipWorkerManager";

/**
 * Runs CLIP on frames already on disk at ./frames/{videoId}/.
 */
export default async function processStreamingFrames(
    visual_prompts: string | string[],
    videoId: string,
    type: string = "frames"
): Promise<any> {

    const job = {
        queries: visual_prompts,
        videoId,
        type
    };
    const result = await runClipJob(job);
    return result;
}
import { runClipJob } from "./clipWorkerManager";

/**
 * Ejecuta CLIP sobre JPEG en memoria. Python recibe `frameImagesBase64` en ambos modos.
 */
export default async function processStreamingFrames(
    visual_prompts: string | string[],
    framesJpeg: Buffer[],
    type: "frames" | "thumbnails" = "frames"
): Promise<any> {
    const job = {
        queries: visual_prompts,
        type,
        frameImagesBase64: framesJpeg.map((b) => b.toString("base64")),
    };
    const result = await runClipJob(job);
    return result;
}

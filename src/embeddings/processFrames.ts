import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Runs CLIP on frames already on disk at ./frames/{videoId}/.
 * Expects frames to have been extracted by extractFramesToDisk (videoUtils) first.
 */
export default async function processStreamingFrames(visual_prompts: string | string[], videoId: string, type: string = "frames"): Promise<any> {
    const checkScript = path.join(__dirname, "checkFrames.py");
    const pythonBin = path.join(process.cwd(), ".venv", "bin", "python");
    const promptsStr = Array.isArray(visual_prompts) ? JSON.stringify(visual_prompts) : visual_prompts;

    const py = spawn(pythonBin, ["-u", checkScript, promptsStr, videoId, type], {
        cwd: process.cwd(),
    });
    let data = "";

    py.stdout.on("data", (chunk: Buffer | string) => {
        data += chunk.toString();
    });

    py.stderr.on("data", (chunk: Buffer | string) => {
        process.stderr.write(chunk as Buffer);
    });

    return new Promise((resolve, reject) => {
        py.on("error", reject);
        py.on("close", (code) => {
            if (code !== 0) {
                return reject(new Error(`Python exited with code ${code}`));
            }
            const lastLine = data.trim().split("\n").pop();
            try {
                resolve(JSON.parse(lastLine || "[]"));
            } catch {
                resolve(lastLine ? lastLine : []);
            }
        });
    });
}

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function processStreamingFrames(mainIdea, videoId, selectQuery = "select='gt(scene,0.3)'") {
    const checkScript = path.join(__dirname, "checkFrames.py");
    const ffmpeg = spawn("ffmpeg", [
        "-i", `./temp/youtube/${videoId}.mp4`,
        "-vf", `${selectQuery},scale=224:224`,
        "-vsync", "vfr",
        "-f", "image2pipe",
        "-vcodec", "mjpeg",
        "pipe:1"
    ]);
    const pythonBin = path.join(process.cwd(), ".venv", "bin", "python");
    const formattedMainIdea = "a picture of " + mainIdea;

    const py = spawn(pythonBin, ["-u", checkScript, formattedMainIdea], {
        cwd: process.cwd(),
    });
    let data = "";

    ffmpeg.stdout.pipe(py.stdin);

    py.stdout.on("data", (chunk) => {
        data += chunk.toString();
    });

    py.stderr.on("data", (chunk) => {
        process.stderr.write(chunk);
    });

    py.stdin.on("error", (error) => {
        if (error.code === "EPIPE") {
            return;
        }
        console.error('------> Error on stdin: ', error);
    });

    return new Promise((resolve, reject) => {
        ffmpeg.on("error", reject);
        py.on("error", reject);

        ffmpeg.on("close", () => {
            py.stdin.end();
        });
        py.on("close", (code) => {
            ffmpeg.kill("SIGKILL");
            if (code !== 0) {
                return reject(new Error(`Python exited with code ${code}`));
            }
            const lastLine = data.trim().split("\n").pop();
            try {
                resolve(JSON.parse(lastLine || "[]"));
            } catch {
                resolve(lastLine);
            }
        });
    });
}

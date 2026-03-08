import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function clipProcessor(mainIdea, videoId) {
    const scriptPath = path.join(__dirname, "clipProcessor.py");
    const pythonBin = path.join(process.cwd(), ".venv", "bin", "python");
    const py = spawn(pythonBin, [scriptPath, mainIdea, videoId], {
        cwd: process.cwd(),
    });
    let data = "";
    py.stdout.on("data", (chunk) => {
        data += chunk.toString();
    });
    py.stderr.on("data", (chunk) => {
        process.stderr.write(chunk);
    });
    return new Promise((resolve, reject) => {
        py.on("close", (code, signal) => {
            if (code !== 0) {
                return reject(new Error(`Python exited with code ${code}`));
            }
            const lastLine = data.trim().split("\n").pop();
            try {
                const scores = JSON.parse(lastLine || "[]");
                resolve(scores);
            } catch (err) {
                reject(new Error(`Failed to parse Python output: ${lastLine}`));
            }
        });
    });
}
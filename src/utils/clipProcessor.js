import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
async function runPython(script, args = []) {

    const pythonBin = path.join(process.cwd(), ".venv", "bin", "python");

    const py = spawn(pythonBin, [script, ...args], {
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
        py.on("close", (code) => {

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

export default async function clipProcessor(mainIdea, videoId) {
    const checkScript = path.join(__dirname, "checkFrames.py");

    console.log("Checking frames for main idea: ", mainIdea);
    const scores = await runPython(checkScript, [
        mainIdea,
        videoId
    ]);

    return scores;
}
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pythonBin = path.join(process.cwd(), ".venv", "bin", "python");
const workerScript = path.join(__dirname, "checkFrames.py");

const py = spawn(pythonBin, ["-u", workerScript], {
    cwd: process.cwd(),
});

py.stderr.on("data", (d) => {
    process.stderr.write(d);
});

const pending: any[] = [];

py.stdout.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().trim().split("\n");

    for (const line of lines) {
        if (line === "READY") continue;

        const job = pending.shift();
        if (!job) continue;

        try {
            job.resolve(JSON.parse(line));
        } catch {
            job.resolve(line);
        }
    }
});

export function runClipJob(job: any) {
    return new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
        py.stdin.write(JSON.stringify(job) + "\n");
    });
}
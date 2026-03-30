import { spawn } from "child_process";

export type YtDlpRunResult = {
    stdout: string;
    stderr: string;
    exitCode: number | null;
};

type RunYtDlpOptions = {
    ytDlpPath?: string;
    env?: NodeJS.ProcessEnv;
};

export const runYtDlp = async (
    args: string[],
    { ytDlpPath, env }: RunYtDlpOptions = {}
): Promise<YtDlpRunResult> => {
    const resolvedYtDlpPath = ytDlpPath ?? process.env.YT_DLP_PATH ?? "yt-dlp";
    const resolvedEnv = env ?? process.env;

    return await new Promise((resolve, reject) => {
        const proc = spawn(resolvedYtDlpPath, args, {
            stdio: ["ignore", "pipe", "pipe"],
            env: resolvedEnv
        });

        let stdout = "";
        let stderr = "";

        proc.stdout?.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        proc.stderr?.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        proc.on("error", (err) => reject(err));
        proc.on("close", (code) => {
            resolve({ stdout, stderr, exitCode: code });
        });
    });
};

export const runYtDlpJson = async (
    args: string[],
    options: RunYtDlpOptions = {}
): Promise<any> => {
    const { stdout, stderr, exitCode } = await runYtDlp(args, options);

    // yt-dlp sometimes prints JSON even when exiting non-zero; try parse first.
    try {
        return JSON.parse(stdout);
    } catch {
        throw new Error(`yt-dlp failed (code ${exitCode}). stderr:\n${stderr || stdout}`);
    }
};


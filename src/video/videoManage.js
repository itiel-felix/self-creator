import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from '@ffprobe-installer/ffprobe';
import fs from 'fs';
import path from 'path';

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path);

const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;

/**
 * Devuelve la cadena de filtros de vídeo según el layout.
 * @param {'full'|'top_half'|'bottom_half'} layout
 * @returns {string[]} filtros para videoFilters()
 */
function getVideoFiltersForLayout() {
    return [
        `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase`,
        `crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`
    ];
}

/**
 * Cuts each video to the needed duration, merges them, and overlays the original audio.
 * @param {Object[]} videos - Array of { video_path, final_duration, start_time, end_time, text }
 * @param {string} outputFile - Output file path
 * @param {string} audioPath - Original audio to overlay
 */
export const cutAndConcatSegments = async (videos, outputFile) => {
    const videoFilters = getVideoFiltersForLayout();

    const tempFiles = [];
    const tempFolder = './temp';

    try {
        // STEP 1: Cut each segment sequentially
        for (let i = 0; i < videos.length; i++) {
            const video = videos[i];
            const tempFile = `${tempFolder}/temp_segment_${i}.mp4`;
            tempFiles.push(tempFile);

            await new Promise((resolve, reject) => {
                ffmpeg(video.video_path)
                    .setStartTime(video.start_time)
                    .setDuration(video.final_duration)
                    .videoFilters(videoFilters)
                    .outputOptions(['-r', '30'])
                    .output(tempFile)
                    .on('end', () => resolve())
                    .on('error', (err) => {
                        console.error(`Error cutting segment ${i + 1}:`, err);
                        reject(err);
                    })
                    .run();
            });
        }

        // STEP 2: Verify segment durations
        let totalRealDuration = 0;
        for (let i = 0; i < tempFiles.length; i++) {
            await new Promise((resolve) => {
                ffmpeg.ffprobe(tempFiles[i], (err, metadata) => {
                    if (!err) totalRealDuration += metadata.format.duration;
                    resolve();
                });
            });
        }

        // STEP 3: Merge segments with concat demuxer
        const concatListPath = `${tempFolder}/concat_list.txt`;
        fs.writeFileSync(concatListPath, tempFiles.map(f => `file '${path.resolve(f)}'`).join('\n'));

        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(concatListPath)
                .inputOptions(['-f', 'concat', '-safe', '0'])
                .outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-vsync', 'cfr', '-r', '30', '-an'])
                .output(outputFile)
                .on('end', () => resolve())
                .on('error', (err) => { console.error('Error merging:', err); reject(err); })
                .run();
        });
        fs.unlinkSync(concatListPath);

        // STEP 5: Clean temp segments
        tempFiles.forEach(file => fs.unlink(file, () => { }));

        return outputFile;
    } catch (error) {
        console.error('Error in process:', error);
    }
}

export const mergeSegmentsToVerticalScreen = async (videos, outputFile, audioPath) => {
    await new Promise((resolve, reject) => {
        ffmpeg()
            .input(videos[1].video_path)
            .input(videos[0].video_path)
            .complexFilter([
                "[0:v]fps=30,scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[v0]",
                "[1:v]fps=30,scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[v1]",
                "[v0][v1]vstack=inputs=2[v]"
            ])
            .outputOptions([
                "-map", "[v]",
                "-s", "1080x1920",
                "-c:v", "libx264",
                "-crf", "23",
                "-preset", "veryfast"
            ])
            .save(outputFile)
            .on("end", () => resolve())
            .on("error", reject);
    });
    const videoWithAudio = await addAudioToVideo(outputFile, audioPath);
    return videoWithAudio;
};

const addAudioToVideo = async (videoPath, audioPath) => {
    const outputFile = videoPath.replace(".mp4", "_with_audio.mp4");
    const videoWithAudio = await new Promise((resolve, reject) => {
        ffmpeg()
            .input(videoPath)
            .input(audioPath)
            .outputOptions([
                "-map 0:v",
                "-map 1:a",
                "-c:v copy",
                "-c:a aac",
                "-shortest"
            ])
            .save(outputFile)
            .on("end", () => resolve())
            .on("error", (err) => { console.error('Error adding audio:', err); reject(err); });
    });
    // delete original video
    fs.unlinkSync(videoPath);
    // rename output file to original video
    fs.renameSync(outputFile, videoPath);
    return videoPath;
}

export const cropVideoToDuration = async (videoPath, duration) => {
    const tempVideo = videoPath.replace(".mp4", "_temp.mp4");
    await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .setStartTime(0)
            .setDuration(duration)
            .save(tempVideo)
            .outputOptions([
                "-c:v", "libx264",
                "-crf", "23",
                "-preset", "ultrafast",
                "-an"
            ])
            .on("end", () => resolve())
            .on("error", reject);
    });
    // delete original video
    fs.unlinkSync(videoPath);
    // rename temp video to original video
    fs.renameSync(tempVideo, videoPath);
    return videoPath;
}
/**
 * Burns ASS subtitles directly into the video frames.
 * @param {string} videoPath - Input video path
 * @param {string} subtitlesPath - Path to .ass file
 * @returns {Promise<string>} Output video path
 */
export const addBurnedInASSSubtitles = async (videoPath, subtitlesPath) => {
    try {
        const outputPath = videoPath.replace('.mp4', '_with_subtitles.mp4');
        await new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .videoFilters(`ass='${subtitlesPath.replace(/\\/g, '/').replace(/:/g, '\\:')}'`)
                .outputOptions(['-c:a', 'copy'])
                .output(outputPath)
                .on('end', () => resolve())
                .on('error', (err) => { console.error('Error burning subtitles:', err); reject(err); })
                .run();
        });
        return outputPath;
    } catch (error) {
        console.error('Error adding subtitles:', error);
    }
}

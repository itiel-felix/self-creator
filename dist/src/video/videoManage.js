import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from '@ffprobe-installer/ffprobe';
import fs from 'fs';
import path from 'path';
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path);
const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;
function getVideoFiltersForLayout() {
    return [
        `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase`,
        `crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`
    ];
}
export const cutAndConcatSegments = async (videos, outputFile) => {
    const videoFilters = getVideoFiltersForLayout();
    const tempFiles = [];
    const tempFolder = './temp';
    try {
        for (let i = 0; i < videos.length; i++) {
            const video = videos[i];
            const tempFile = `${tempFolder}/temp_segment_${i}.mp4`;
            tempFiles.push(tempFile);
            console.log('------> Cutting segment ' + (i) + ':', video.video_path);
            console.log('------> Start time:', video.start_time);
            console.log('------> Duration:', video.final_duration);
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
        let totalRealDuration = 0;
        for (let i = 0; i < tempFiles.length; i++) {
            await new Promise((resolve) => {
                ffmpeg.ffprobe(tempFiles[i], (err, metadata) => {
                    if (!err)
                        totalRealDuration += metadata.format.duration;
                    resolve();
                });
            });
        }
        const concatListPath = `${tempFolder}/concat_list.txt`;
        fs.writeFileSync(concatListPath, tempFiles.map(f => `file '${path.resolve(f)}'`).join('\n'));
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(concatListPath)
                .inputOptions(['-f', 'concat', '-safe', '0'])
                .outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-vsync', 'cfr', '-r', '30', '-an'])
                .output(outputFile)
                .on('end', () => resolve())
                .on('error', (err) => {
                console.error('Error merging:', err);
                reject(err);
            })
                .run();
        });
        fs.unlinkSync(concatListPath);
        tempFiles.forEach(file => fs.unlink(file, () => { }));
        return outputFile;
    }
    catch (error) {
        console.error('Error in process:', error);
        throw error;
    }
};
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
    await new Promise((resolve, reject) => {
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
    fs.unlinkSync(videoPath);
    fs.renameSync(outputFile, videoPath);
    return videoPath;
};
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
    fs.unlinkSync(videoPath);
    fs.renameSync(tempVideo, videoPath);
    return videoPath;
};
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
    }
    catch (error) {
        console.error('Error adding subtitles:', error);
        throw error;
    }
};

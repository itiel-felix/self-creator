import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from '@ffprobe-installer/ffprobe';
import fs from 'fs';
import path from 'path';

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path);

/**
 * Cuts each video to the needed duration, merges them, and overlays the original audio.
 * @param {Object[]} videos - Array of { video_path, final_duration, start_time, end_time, text }
 * @param {string} outputFile - Output file path
 * @param {string} audioPath - Original audio to overlay
 */
export const cutAndMergeSegments = async (videos, outputFile, audioPath) => {
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
                    .videoFilters([
                        'scale=1080:1920:force_original_aspect_ratio=increase',
                        'crop=1080:1920'
                    ])
                    .outputOptions(['-r', '30'])
                    .output(tempFile)
                    .on('end', () => {
                        console.log(`Segment ${i + 1}/${videos.length} cut: ${video.final_duration}s`);
                        resolve();
                    })
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
        console.log(`Total video duration: ${totalRealDuration.toFixed(2)}s`);

        // STEP 3: Merge segments with concat demuxer
        console.log('Merging segments...');
        const concatListPath = `${tempFolder}/concat_list.txt`;
        fs.writeFileSync(concatListPath, tempFiles.map(f => `file '${path.resolve(f)}'`).join('\n'));

        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(concatListPath)
                .inputOptions(['-f', 'concat', '-safe', '0'])
                .outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-vsync', 'cfr', '-r', '30', '-an'])
                .output(outputFile)
                .on('end', () => { console.log('✅ Video merged:', outputFile); resolve(); })
                .on('error', (err) => { console.error('Error merging:', err); reject(err); })
                .run();
        });
        fs.unlinkSync(concatListPath);

        // STEP 4: Overlay original audio
        if (audioPath) {
            const videoWithAudio = outputFile.replace('.mp4', '_with_audio.mp4');
            await new Promise((resolve, reject) => {
                ffmpeg()
                    .input(outputFile)
                    .input(audioPath)
                    .outputOptions(['-c:v', 'copy', '-c:a', 'aac', '-map', '0:v:0', '-map', '1:a:0', '-shortest'])
                    .output(videoWithAudio)
                    .on('end', () => {
                        fs.unlinkSync(outputFile);
                        fs.renameSync(videoWithAudio, outputFile);
                        console.log('✅ Audio overlaid');
                        resolve();
                    })
                    .on('error', (err) => { console.error('Error overlaying audio:', err); reject(err); })
                    .run();
            });
        }

        // STEP 5: Clean temp segments
        tempFiles.forEach(file => fs.unlink(file, () => { }));

        return outputFile;
    } catch (error) {
        console.error('Error in process:', error);
    }
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
                .on('end', () => { console.log('✅ Subtitles burned in'); resolve(); })
                .on('error', (err) => { console.error('Error burning subtitles:', err); reject(err); })
                .run();
        });
        return outputPath;
    } catch (error) {
        console.error('Error adding subtitles:', error);
    }
}

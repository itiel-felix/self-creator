import fs from 'fs';
const isVideoVertical = (width, height) => {
    return width < height;
};

const createVideoUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`;
/**
 * @param {string} timeString - Time in format "HH:MM:SS,mmm" or "HH:MM:SS"
 * @returns {number} Time in seconds
 */
const timeToSeconds = (timeString) => {
    const [hours, minutes, seconds] = timeString.split(':');
    return Number(hours) * 3600 + Number(minutes) * 60 + parseFloat(seconds.replace(',', '.'));
}

/**
 * Same logic as selectFramesQueryForAVideo: seconds between consecutive extracted frames.
 * fps=1 → 1s, fps=1/5 → 5s, fps=1/15 → 15s.
 * @param {number} videoDurationSeconds
 * @returns {number} seconds per frame
 */
const getFrameIntervalSeconds = (videoDurationSeconds) => {
    const minutes = videoDurationSeconds / 60;
    if (minutes > 3 && minutes < 5) return 15;
    if (minutes > 1 && minutes < 3) return 5;
    return 1;
};

/**
 * Converts frame index (from filename frame_0011.jpg) to time in seconds in the video.
 * @param {number} frameIndex - 1-based frame number
 * @param {number} videoDurationSeconds
 * @returns {number} time in seconds where that frame was extracted
 */
const frameIndexToSeconds = (frameIndex, videoDurationSeconds) => {
    const interval = getFrameIntervalSeconds(videoDurationSeconds);
    return frameIndex * interval;
};

/**
 * @param {string} videoId
 * @param {number} duration - Desired segment duration in seconds
 * @param {number|null} actualVideoDuration - Real video file duration; if provided, start/end are clamped and frame time is computed from the same fps logic used when extracting frames
 */
const getStartAndEndTimeFromVideoId = (videoId, duration, actualVideoDuration = null) => {
    const jsonPath = `./cache/frame_info.json`;
    if (!fs.existsSync(jsonPath)) {
        fs.writeFileSync(jsonPath, '{}');
    }
    const frameInfo = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))[videoId];
    const splittedBySlash = frameInfo?.split('/');
    const frameName = splittedBySlash?.[splittedBySlash.length - 1]?.split('.')[0];
    const frameIndex = Number(frameName?.split('_')[1] ?? 0);

    const goldenSecond = frameIndexToSeconds(frameIndex, actualVideoDuration);

    let startTime = goldenSecond - (duration / 2.0);
    let endTime = startTime + duration;

    if (actualVideoDuration != null && actualVideoDuration > 0) {
        startTime = Math.max(0, Math.min(startTime, actualVideoDuration - duration));
        endTime = startTime + duration;
        endTime = Math.min(endTime, actualVideoDuration);
        startTime = Math.max(0, endTime - duration);
    }

    return {
        start_time: startTime,
        end_time: endTime
    };
}

const initializeCache = () => {
    if (!fs.existsSync('./cache')) fs.mkdirSync('./cache');
    if (!fs.existsSync('./cache/frame_info.json')) fs.writeFileSync('./cache/frame_info.json', '{}');
    if (!fs.existsSync('./temp')) fs.mkdirSync('./temp');
    if (!fs.existsSync('./temp/youtube')) fs.mkdirSync('./temp/youtube');
    // Remove
    if (fs.existsSync('./cache/videoInfo')) fs.rmdirSync('./cache/videoInfo', { recursive: true });
    if (fs.existsSync('./output/subtitles.ass')) fs.rmSync('./output/subtitles.ass', { recursive: true });
    // if (fs.existsSync('./cache/frame_info.json')) fs.unlinkSync('./cache/frame_info.json');
}
export {
    isVideoVertical,
    createVideoUrl,
    timeToSeconds,
    getFrameIntervalSeconds,
    frameIndexToSeconds,
    getStartAndEndTimeFromVideoId,
    initializeCache
};
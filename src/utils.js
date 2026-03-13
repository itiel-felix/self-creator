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

const calculateGoldenSecond = (number) => {
    return number * 2;
}

const getStartAndEndTimeFromVideoId = (videoId, duration) => {
    const jsonPath = `./cache/frame_info.json`;
    if (!fs.existsSync(jsonPath)) {
        fs.writeFileSync(jsonPath, '{}');
    }
    console.log('------> Getting start and end time from video ID: ', videoId);
    const frameInfo = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))[videoId];
    const splittedBySlash = frameInfo?.split('/');
    const frameName = splittedBySlash[splittedBySlash.length - 1].split('.')[0];
    const frameSecond = Number(frameName?.split('_')[1]);

    const goldenSecond = calculateGoldenSecond(frameSecond);

    const startTime = goldenSecond - (duration / 2.0);
    const endTime = startTime + duration;
    return {
        start_time: startTime,
        end_time: endTime
    }
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
    calculateGoldenSecond,
    getStartAndEndTimeFromVideoId,
    initializeCache
};
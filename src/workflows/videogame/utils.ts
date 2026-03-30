import fs from "fs";
import { getStartAndEndTimeFromVideoId } from "../../utils.js";

export const getBannedTerms = async (): Promise<string[]> => {
    if (fs.existsSync('./cache/banned_terms.json')) {
        return JSON.parse(fs.readFileSync('./cache/banned_terms.json', 'utf8'));
    }
    return [];
}

export const addBannedTerm = async (term: string): Promise<void> => {
    if (fs.existsSync('./cache/banned_terms.json')) {
        const bannedTerms = JSON.parse(fs.readFileSync('./cache/banned_terms.json', 'utf8'));
        bannedTerms.push(term);
        fs.writeFileSync('./cache/banned_terms.json', JSON.stringify(bannedTerms, null, 2));
    } else {
        fs.writeFileSync('./cache/banned_terms.json', JSON.stringify([term], null, 2));
    }
}


export const generateStartAndEndTime = (videoId: string, clipDuration: number, videoDuration: number): { start_time: number; end_time: number } => {
    let start_time = 0;
    let end_time = 0;
    const { start_time: videoStart_time, end_time: videoEnd_time } = getStartAndEndTimeFromVideoId(videoId, clipDuration, videoDuration);
    start_time = videoStart_time;
    end_time = videoEnd_time;
    return { start_time, end_time };
}

export const markVideoAsAnalyzed = async (searchWord: string, videoId: string) => {
    const cachedData = JSON.parse(fs.readFileSync('./cache/youtube.json', 'utf8'));
    const entry = cachedData[searchWord].entries.find(entry => entry.id === videoId);
    if (entry) {
        entry.hasBeenAnalyzed = true;
        fs.writeFileSync('./cache/youtube.json', JSON.stringify(cachedData, null, 2));
    }
}


/**
 * Generates a random section to download from a video.
 * @returns {Object} An object with the start and end times in 00:00:00,000 format.
 */
export const generateSectionToDownload = () => {
    const randomStartTime = Math.random() * 60;
    const randomEndTime = randomStartTime + 60;
    const start_time = `00:00:${randomStartTime.toFixed(3).padStart(6, '0')}`;
    const end_time = `00:00:${randomEndTime.toFixed(3).padStart(6, '0')}`;
    return { start_time, end_time };
}


/**
 * Generates a random durations for a video.
 * @param {number} videoDuration - The duration of the video in seconds.
 * @returns {number[]} An array of random durations in seconds.
 */
export const generateRandomDurations = (videoDuration: number) => {
    const minDuration = 1;
    const maxDuration = 2;
    const randomTimes: number[] = [];
    let sumOfDurations = 0;
    console.log('-> Generating random durations for video duration: ', videoDuration);
    while (true) {
        // Video duration = 205
        const randomTime = Math.random() * (maxDuration - minDuration) + minDuration; // entre 0.5 y 2 s
        sumOfDurations += randomTime; // 210
        if (sumOfDurations > videoDuration) {
            randomTimes.push(randomTime - (sumOfDurations - videoDuration)); // 10
            break;
        }
        randomTimes.push(randomTime);
    }
    console.log('-> Random durations: ', randomTimes.reduce((acc, time) => acc + time, 0));
    console.log('-> Clips quantity: ', randomTimes.length);
    return randomTimes;
}

import fs from 'fs';
import { timeToSeconds, getStartAndEndTimeFromVideoId } from "../utils.js";
import { getVideoDuration, chooseVideoFromYoutube } from "../video/videoUtils.js";
export const getCuriosityVideos = async (mainIdeasOriginal, typeOfVideo) => {
    const shouldUseMainIdeasCache = true;
    let mainIdeas = [];
    if (shouldUseMainIdeasCache) {
        mainIdeas = JSON.parse(fs.readFileSync('./cache/mainIdeas.json', 'utf8'));
    }
    else {
        mainIdeas = mainIdeasOriginal;
    }
    const videos = [];
    const tempFolder = './temp';
    if (!fs.existsSync(tempFolder))
        fs.mkdirSync(tempFolder);
    const videoByKeyword = {};
    const usedVideosIds = [];
    let results = [];
    const shouldUseResults = true;
    if (fs.existsSync('./cache/results.json') && shouldUseResults) {
        const cachedResults = JSON.parse(fs.readFileSync('./cache/results.json', 'utf8'));
        results = cachedResults;
    }
    else {
        for (let index = 0; index < mainIdeas.length; index++) {
            const mainIdea = mainIdeas[index];
            console.log('-> Working on main idea: ', mainIdea.text, '(', index + 1, 'of', mainIdeas.length, ')');
            const result = await chooseVideoFromYoutube(mainIdea, usedVideosIds, typeOfVideo);
            results.push(result);
        }
        fs.writeFileSync('./cache/results.json', JSON.stringify(results, null, 2));
    }
    const newMainIdeas = [];
    for (let i = 0; i < mainIdeas.length; i++) {
        const mainIdea = mainIdeas[i];
        const result = results[i];
        const nextMainIdea = mainIdeas[i + 1];
        const newStartTime = i === 0 ? '00:00:00,000' : mainIdea.start_time;
        const segmentEndTime = nextMainIdea ? nextMainIdea.start_time : mainIdea.end_time;
        const videoDuration = timeToSeconds(segmentEndTime) - timeToSeconds(newStartTime);
        const res = result;
        const videoPath = `./temp/youtube/${res.videoId}.mp4`;
        let actualVideoDuration = null;
        if (fs.existsSync(videoPath)) {
            actualVideoDuration = await getVideoDuration(videoPath);
        }
        const { start_time: videoStart_time, end_time: videoEnd_time } = getStartAndEndTimeFromVideoId(res.videoId, videoDuration, actualVideoDuration);
        const key = `${mainIdea.text}-${newStartTime}-${segmentEndTime}`;
        console.log('------> Key: ', key);
        const newMainIdea = {
            ...mainIdea,
            start_time: newStartTime,
            end_time: segmentEndTime,
            video_id: res.videoId,
            video_start_time: videoStart_time,
            video_end_time: videoEnd_time,
            duration: videoDuration
        };
        newMainIdeas.push(newMainIdea);
        const raw = results[i];
        const vid = typeof raw === "string" ? raw : raw?.videoId;
        if (typeof vid === "string") {
            videoByKeyword[key] = vid;
        }
    }
    console.log("Full duration of new main ideas: ", newMainIdeas.reduce((acc, mainIdea) => acc + mainIdea.duration, 0));
    fs.writeFileSync('./cache/results.json', JSON.stringify(results, null, 2));
    console.log('------> New main ideas: ', newMainIdeas);
    fs.writeFileSync('./cache/newMainIdeas.json', JSON.stringify(newMainIdeas, null, 2));
    try {
        for (let i = 0; i < newMainIdeas.length; i++) {
            const mainIdea = newMainIdeas[i];
            const videoPath = `./temp/youtube/${mainIdea.video_id}.mp4`;
            const startSec = mainIdea.video_start_time;
            const endSec = mainIdea.video_end_time;
            const segmentDuration = endSec - startSec;
            videos.push({
                video_id: mainIdea.video_id,
                video_path: videoPath,
                final_duration: segmentDuration,
                start_time: mainIdea.video_start_time,
                text: mainIdea.text
            });
        }
        const shouldDownloadVideos = false;
        console.log("Video IDs");
        console.log(videos.map(video => video.video_id));
        console.log("--------------------------------");
        if (shouldDownloadVideos) {
            // downloadFinalVideo not imported - kept for reference if implemented later
            const downloadFinalVideo = async (_videoId) => { };
            const promises = videos.map(video => downloadFinalVideo(video.video_id));
            await Promise.all(promises);
        }
        return videos;
    }
    catch (error) {
        throw error;
    }
};

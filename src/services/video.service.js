import youtubedl from "youtube-dl-exec";
import fs from 'fs';

const MAX_VIDEOS = 1;

/**
 * Search for videos in YouTube.
 * @param {string} searchWord - The word to search for.
 * @returns {Promise<{id: string, title: string, description: string, thumbnail: string, duration: number, viewCount: number, likeCount: number, commentCount: number, channelId: string, channelTitle: string, channelUrl: string, channelThumbnail: string, channelSubscriberCount: number, channelVideoCount: number, channelViewCount: number}[]>} The videos found.
 */
export const searchVideosInYoutube = async (searchWord, minDuration = null) => {
    if (await hasBannedTerm(searchWord)) {
        return [];
    }
    let matchFilter = '';
    if (minDuration) {
        matchFilter = `duration > ${minDuration} & !is_live`;
    } else {
        matchFilter = 'duration < 240 & !is_live';
    }
    try {
        const results = await youtubedl(
            `ytsearch5:${searchWord}`,
            {
                dumpSingleJson: true,
                noDownload: true,
                matchFilter: matchFilter,
                extractorArgs: "youtube:player_client=android,web",
                flatPlaylist: true,
                ignoreErrors: true,
                jsRuntimes: "node",
                cookiesFromBrowser: "firefox"
            }
        );
        const { entries = [] } = results ?? {};
        if (entries.length === 0) await addBannedTerm(searchWord);
        return entries.slice(0, MAX_VIDEOS);
    } catch (error) {
        throw new Error(`Failed to search for videos: ${error}`);
    }
}


const addBannedTerm = async (term) => {
    if (fs.existsSync('./cache/banned_terms.json')) {
        const bannedTerms = JSON.parse(fs.readFileSync('./cache/banned_terms.json', 'utf8'));
        bannedTerms.push(term);
        fs.writeFileSync('./cache/banned_terms.json', JSON.stringify(bannedTerms, null, 2));
    }
}

const hasBannedTerm = async (term) => {
    if (fs.existsSync('./cache/banned_terms.json')) {
        const bannedTerms = JSON.parse(fs.readFileSync('./cache/banned_terms.json', 'utf8'));
        return bannedTerms.includes(term);
    }
    return false;
}
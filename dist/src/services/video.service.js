import youtubedl from "youtube-dl-exec";
import fs from 'fs';
const MAX_VIDEOS = 1;
export const searchVideosInYoutube = async (searchWord, minDuration = null, maxResults, force = false) => {
    if (await hasBannedTerm(searchWord)) {
        return [];
    }
    if (fs.existsSync('./cache/youtube.json') && !force) {
        const cachedData = JSON.parse(fs.readFileSync('./cache/youtube.json', 'utf8'));
        if (cachedData[searchWord]) {
            return cachedData[searchWord].entries;
        }
    }
    let matchFilter = '';
    const commonFilter = '!is_live & !is_unplayable & live_status != "is_live"';
    if (minDuration) {
        matchFilter = `${commonFilter} & duration > ${minDuration} & duration < 600`;
    }
    else {
        matchFilter = `${commonFilter} & duration > 0 & duration < 240`;
    }
    try {
        const results = await youtubedl(`ytsearch${maxResults ?? '5'}:${searchWord}`, {
            dumpSingleJson: true,
            noDownload: true,
            matchFilter: matchFilter,
            extractorArgs: "youtube:player_client=android,web",
            ignoreErrors: true,
            jsRuntimes: "node",
            cookiesFromBrowser: "firefox"
        });
        const { entries = [] } = results ?? {};
        if (entries.length === 0)
            await addBannedTerm(searchWord);
        fs.writeFileSync('./cache/youtube.json', JSON.stringify({
            [searchWord]: {
                entries: entries.slice(0, maxResults ?? MAX_VIDEOS)
            }
        }, null, 2));
        return entries.slice(0, maxResults ?? MAX_VIDEOS);
    }
    catch (error) {
        throw new Error(`Failed to search for videos: ${error}`);
    }
};
const addBannedTerm = async (term) => {
    if (fs.existsSync('./cache/banned_terms.json')) {
        const bannedTerms = JSON.parse(fs.readFileSync('./cache/banned_terms.json', 'utf8'));
        bannedTerms.push(term);
        fs.writeFileSync('./cache/banned_terms.json', JSON.stringify(bannedTerms, null, 2));
    }
};
const hasBannedTerm = async (term) => {
    if (fs.existsSync('./cache/banned_terms.json')) {
        const bannedTerms = JSON.parse(fs.readFileSync('./cache/banned_terms.json', 'utf8'));
        return bannedTerms.includes(term);
    }
    return false;
};

import youtubedl from "youtube-dl-exec";
import fs from 'fs';

const MAX_VIDEOS = 1;

export interface YoutubeEntry {
    id: string;
    title?: string;
    description?: string;
    thumbnail?: string;
    duration?: number;
    view_count?: number;
    like_count?: number;
    comment_count?: number;
    channel_id?: string;
    channel?: string;
    [key: string]: any;
}

export const searchVideosInYoutube = async (searchWord: string, minDuration: number | null = null, maxResults?: number, force: boolean = false): Promise<YoutubeEntry[]> => {
    if (await hasBannedTerm(searchWord)) {
        return [];
    }
    if (fs.existsSync('./cache/youtube.json') && !force) {
        const cachedData = JSON.parse(fs.readFileSync('./cache/youtube.json', 'utf8'));
        if (cachedData[searchWord]) {
            const entries = cachedData[searchWord].entries.filter(entry => !entry.hasBeenAnalyzed);
            if (entries.length > 0) {
                console.log('--> Found unused videos for search query: ', searchWord, ' - ', entries.length);
                return entries;
            }
        }
    }
    let matchFilter = '';
    const commonFilter = '!is_live & !is_unplayable & live_status != "is_live"';
    if (minDuration) {
        matchFilter = `${commonFilter} & duration > ${minDuration} & duration < 600`;
    } else {
        matchFilter = `${commonFilter} & duration > 0 & duration < 240`;
    }
    try {
        const results = await youtubedl(
            `ytsearch${maxResults ?? '5'}:${searchWord}`,
            {
                dumpSingleJson: true,
                noDownload: true,
                matchFilter: matchFilter,
                extractorArgs: "youtube:player_client=web;player_skip=webpage",
                ignoreErrors: true,
                jsRuntimes: "node",
                cookiesFromBrowser: "firefox"
            } as any
        );
        const { entries = [] } = (results as any) ?? {};
        if (entries.length === 0) await addBannedTerm(searchWord);
        fs.writeFileSync('./cache/youtube.json', JSON.stringify({
            [searchWord]: {
                entries: entries.slice(0, maxResults ?? MAX_VIDEOS)
            }
        }, null, 2));
        return entries.slice(0, maxResults ?? MAX_VIDEOS);
    } catch (error) {
        throw new Error(`Failed to search for videos: ${error}`);
    }
}


const addBannedTerm = async (term: string): Promise<void> => {
    if (fs.existsSync('./cache/banned_terms.json')) {
        const bannedTerms = JSON.parse(fs.readFileSync('./cache/banned_terms.json', 'utf8'));
        bannedTerms.push(term);
        fs.writeFileSync('./cache/banned_terms.json', JSON.stringify(bannedTerms, null, 2));
    }
}

const hasBannedTerm = async (term: string): Promise<boolean> => {
    if (fs.existsSync('./cache/banned_terms.json')) {
        const bannedTerms = JSON.parse(fs.readFileSync('./cache/banned_terms.json', 'utf8'));
        return bannedTerms.includes(term);
    }
    return false;
}


export const getYoutubeVideoUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`;

export const searchYoutube = async (query, options = {}) => {
    const params = new URLSearchParams({
        key: process.env.GOOGLE_API_KEY,
        part: "snippet",
        type: "video",
        q: query,
        maxResults: 10,
        order: 'relevance',
        videoDuration: 'short',
        videoDefinition: 'high',
    });

    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const data = await response.json();
    console.log('Youtube search response: ', data);
    // print data in cache/youtube.json
    // If cache/youtube.json exists, read it and return the data
    let cachedData = null;
    if (fs.existsSync('cache/youtube.json')) {
        cachedData = JSON.parse(fs.readFileSync('cache/youtube.json', 'utf8'));
        if (cachedData.query === query) {
            return cachedData.data;
        }
    } else {
        fs.writeFileSync('cache/youtube.json', JSON.stringify({
            [query]: {
                ...data
            }
        }, null, 2));
    }
    return data;
}

export const getVideosByIds = async (videoIds) => {
    const params = new URLSearchParams({
        key: process.env.GOOGLE_API_KEY,
        part: "snippet",
        id: videoIds.join(','),
    });
    const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
    const data = await response.json();
    return data;
}


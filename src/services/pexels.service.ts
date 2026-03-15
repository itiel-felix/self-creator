const PEXELS_URL = "https://api.pexels.com/v1/videos/search";

export interface Topic {
    text: string;
    start_time?: string;
    end_time?: string;
}

/**
 * Get video url from pexels
 */
export const getVideoUrl = async (topic: Topic): Promise<{ video_url: string }> => {
    const urlParams = new URLSearchParams({
        orientation: 'portrait',
        size: 'large',
        page: '1',
        per_page: '5',
        query: topic.text,
        locale: 'en-US'
    });
    const response = await fetch(`${PEXELS_URL}?${urlParams.toString()}`, {
        headers: { "Authorization": `${process.env.PEXELS_API_KEY}` }
    });
    const data = await response.json();
    const maxIndex = Math.min(data.videos.length, 3);
    const video = data.videos[Math.floor(Math.random() * maxIndex)];
    if (!video) throw new Error(`No video found for topic: ${topic.text}`);
    return { video_url: video.video_files[0].link };
}

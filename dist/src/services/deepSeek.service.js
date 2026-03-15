import OpenAI from "openai";
import { mainIdeaSystemPrompt, processedMainIdeaSystemPrompt, searchQueriesSystemPrompt } from "../utils/prompts.js";
export const getMainIdea = async (transcriptionOfAudioInSrtFormat, typeOfVideo = "curiosity") => {
    const openai = new OpenAI({
        baseURL: 'https://api.deepseek.com',
        apiKey: process.env.DEEPSEEK_API_KEY,
    });
    try {
        const response = await openai.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: mainIdeaSystemPrompt(typeOfVideo) },
                { role: "user", content: transcriptionOfAudioInSrtFormat }
            ],
            response_format: { type: "json_object" }
        });
        console.log('------> Response: ', response.choices[0]);
        const raw = response.choices[0].message.content.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        const parsedResponse = JSON.parse(raw);
        return parsedResponse;
    }
    catch (error) {
        throw new Error(`Failed to get main idea: ${error.message}`);
    }
};
export const getProcessedMainIdea = async (mainIdeaText, tooHard = false, burnedTerms = [], mainIdeaOriginalText, typeOfVideo = "curiosity") => {
    const openai = new OpenAI({
        baseURL: 'https://api.deepseek.com',
        apiKey: process.env.DEEPSEEK_API_KEY,
    });
    console.log('------> Getting processed main idea: ', mainIdeaText, ' - ', mainIdeaOriginalText);
    try {
        const burnedTermsString = burnedTerms.length > 0 ? `Avoid these terms: ${burnedTerms.join(', ')}` : '';
        const response = await openai.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: processedMainIdeaSystemPrompt(typeOfVideo) },
                { role: "user", content: `-> Complete text: ${mainIdeaOriginalText}\n-> Idea: ${mainIdeaText}\n${burnedTermsString}` }
            ],
            response_format: { type: "json_object" }
        });
        const raw = response.choices[0].message.content.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        const parsedResponse = JSON.parse(raw);
        return parsedResponse;
    }
    catch (error) {
        throw new Error(`Failed to get processed main idea: ${mainIdeaText}: ${error.message}`);
    }
};
export const getSearchQueries = async (videoGameName, banned_terms = []) => {
    const openai = new OpenAI({
        baseURL: 'https://api.deepseek.com',
        apiKey: process.env.DEEPSEEK_API_KEY,
    });
    try {
        const response = await openai.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: searchQueriesSystemPrompt(banned_terms) },
                { role: "user", content: `-> Video game name: ${videoGameName}` }
            ],
            response_format: { type: "json_object" }
        });
        const raw = response.choices[0].message.content.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        const parsedResponse = JSON.parse(raw);
        return parsedResponse;
    }
    catch (error) {
        throw new Error(`Failed to get search queries: ${videoGameName}: ${error.message}`);
    }
};

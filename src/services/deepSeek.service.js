import OpenAI from "openai";
import { mainIdeaSystemPrompt, processedMainIdeaSystemPrompt } from "./prompts.js";

export const getMainIdea = async (transcriptionOfAudioInSrtFormat) => {
    const openai = new OpenAI({
        baseURL: 'https://api.deepseek.com',
        apiKey: process.env.DEEPSEEK_API_KEY,
    });
    try {
        const response = await openai.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: mainIdeaSystemPrompt() },
                { role: "user", content: transcriptionOfAudioInSrtFormat }
            ],
            response_format: { type: "json_object" }
        });
        const raw = response.choices[0].message.content.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        const parsedResponse = JSON.parse(raw);
        return parsedResponse;
    } catch (error) {
        throw new Error(`Failed to get main idea: ${error.message}`);
    }
}


export const getProcessedMainIdea = async (mainIdea, tooHard = false, burnedTerms = []) => {
    const openai = new OpenAI({
        baseURL: 'https://api.deepseek.com',
        apiKey: process.env.DEEPSEEK_API_KEY,
    });
    try {
        const burnedTermsString = burnedTerms.length > 0 ? `Avoid these terms: ${burnedTerms.join(', ')}` : '';
        const response = await openai.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: processedMainIdeaSystemPrompt() },
                { role: "user", content: `Main idea: ${mainIdea}\n${burnedTermsString}` }
            ],
            response_format: { type: "json_object" }
        });
        const raw = response.choices[0].message.content.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        const parsedResponse = JSON.parse(raw);
        return parsedResponse;
    } catch (error) {
        throw new Error(`Failed to get processed main idea: ${mainIdea}: ${error.message}`);
    }
}
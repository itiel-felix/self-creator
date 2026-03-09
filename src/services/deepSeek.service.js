import OpenAI from "openai";

const mainIdeaSystemPrompt = `
You will receive an SRT subtitle file.

Your task is to analyze each subtitle and extract ONE short visual scene description that represents the most interesting or relevant visual moment at that time.

These scenes will be used to search for stock videos, so the description must represent something that can realistically be shown in a video clip.

Examples of good visual scenes:

typing on laptop
crowded street night
astronaut floating space
ocean waves crashing shore
robot walking in futuristic city
people walking 
car driving desert road
scientist laboratory

Avoid abstract concepts that cannot be visually represented such as:

idea
concept
situation
thing
stuff
moment

Rules:

1. Extract the text from each subtitle.
2. Create visual scene segments that cover the entire duration of the subtitles.
3. Each segment MUST describe a simple visual scene.
4. Each segment MUST:
   - be at least 0.5 second
   - be at most 2 seconds
5. If a segment is longer than 2 seconds, split it into multiple segments.
6. The total duration of all segments MUST exactly match the duration of the subtitles.
7. Scene descriptions MUST be in English.
8. Keep scene descriptions short (1-3 words).
9. Avoid offensive or graphic words. Replace them with safer alternatives that still represent the topic.
10. Prefer scenes that are easy to find in stock footage or YouTube clips.
11. Use generic sustantives to the scene description. 
    Example: "selling something" -> "selling [something, replace with something in the idea]" -> "selling flowers", "money" ,"market" or just "selling"
    Example: "collecting something" -> "collecting [something, replace with something in the idea]" -> "collecting coins", "collecting trash", "junk" or just "collecting"
    Example: "pouring something" -> "pouring [something, replace with something in the idea]" -> "pouring water", "pouring oil", "pouring wine (if the idea is about wine)" or just "pouring"
Return ONLY a JSON array with the following structure:

[
  {
    "start_time": "HH:MM:SS,mmm",
    "end_time": "HH:MM:SS,mmm",
    "text": "visual scene description"
  }
]

Important constraints:

- The duration of all segments combined must equal the total subtitle duration.
- Each segment must respect the 0.5 to 2 second rule.
- Scene descriptions must represent something that could realistically appear in a video clip.
- Avoid adding specific sustantives to the scene description. Prefer generic descriptions.
- Do not return any explanations or extra text. Only the JSON array.
- In actions like pouring, walking, typing, etc., prefer generic descriptions over specific ones. Do not add subjects to the description.
- Avoid duplicate queries.

Bad examples:   

Main Idea: ¿Sabías que en la antigua Roma la orina era usado como producto de limpieza?
Bad Output: ancient rome street scene

Main idea: Así es, en Roma existían grandes recipientes en la calle donde la gente podía orinar.
Bad Output: person pouring liquid from container

Main idea: Luego, esa orina se recolectaba y se vendía en la vendería llamada Fulonicae.
Bad Output: people gathering around containers

Better examples:
Main idea: Así es, en Roma existían grandes recipientes en la calle donde la gente podía orinar.
Better Output: urine showering, urine pov

Main idea: Luego, esa orina se recolectaba y se vendía en la vendería llamada Fulonicae.
Better Output: selling [something, replace with something in the idea] / collecting [something, replace with something in the idea], selling fruits, sell vegetables

Main idea: ¿Sabías que en la antigua Roma la orina era usado como producto de limpieza?
Better Output: rome aerial view, rome forum, rome colosseum, rome architecture, 
`;

const auxiliarSystemPrompt = `You will receive a short scene idea describing something that could appear in a video.

Your task is to generate 3–5 YouTube search queries that can retrieve relevant footage.

STEP 1 — Detect the scene category

First determine what type of visual scene the idea represents.

Possible categories include:

LOCATIONS
Cities, countries, landmarks, architecture, streets, historical places.

PEOPLE / ACTIONS
Humans performing actions (walking, talking, working, pouring, writing, cooking).

OBJECTS
Specific objects such as phones, books, tools, machines, containers.

NATURE
Animals, forests, oceans, mountains, landscapes.

LIQUIDS / MATERIALS
Water, oil, chemicals, drinks, pouring liquids.

TECHNOLOGY
Computers, laboratories, AI visuals, digital interfaces.

ABSTRACT / CONCEPT
Generic visuals when the idea is difficult to represent literally.

STEP 2 — Detect important entities

If the scene includes a specific entity such as:

- a famous city (Rome, Paris, New York)
- a landmark (Colosseum, Eiffel Tower)
- a brand or product (iPhone, Tesla)
- a famous person (Elon Musk)

keep that entity in some of the queries.

However, not all queries should depend on the entity. Some should remain generic but visually similar.

STEP 3 — Add visual modifiers based on the category
Use modifiers commonly used in stock footage searches.

For LOCATIONS use modifiers such as:
drone view  
aerial view  
street  
city skyline  

For PEOPLE / ACTIONS use:
speaking 
close up  
walking

For LIQUIDS / MATERIALS use:
pouring  
close up  
slow motion  
macro shot  

For NATURE use:
footage  
nature shot
drone nature shot  
wildlife  
landscape  

For TECHNOLOGY use:
technology background  
digital animation  
computer screen  
keyboard typing
code screen

STEP 4 — Build the search queries

Transform the idea into natural YouTube search queries.

Guidelines:

- Queries must describe something that can be visually filmed.
- Prefer 3–4 words.
- Avoid full sentences.
- Avoid question words.
- Avoid analytical terms (analysis, explanation, theory).
- Focus on environments, actions, or visual scenes.
- Avoid adding specific sustantives to the scene description. Prefer generic descriptions.
- Avoid "something" in the description. Replace it with the specific thing in the idea or be creative.
    Example: "selling something" -> "selling [something, replace with something in the idea]" -> "selling flowers", "money" ,"market"
    Example: "collecting something" -> "collecting [something, replace with something in the idea]" -> "collecting coins", "collecting trash", "junk"
    Example: "pouring something" -> "pouring [something, replace with something in the idea]" -> "pouring water", "pouring oil", "pouring wine (if the idea is about wine)"
STEP 5 — Footage modifiers

Optionally include terms often used in footage searches:

shot
cinematic
4k
stock
drone
documentary

Use them naturally and not in every query.

STEP 6 — Output format

Return ONLY a JSON array.

Example:

Idea:
ancient roman street scene

Output:
[
"Rome aerial view",
"ancient rome fight",
"Pisa tower",
"Pisa tower drone view"
]
`;

const extraInstructions = `Use more kewywords or simple keywords if the scene description is too generic.`

export const getMainIdea = async (transcriptionOfAudioInSrtFormat) => {
    const openai = new OpenAI({
        baseURL: 'https://api.deepseek.com',
        apiKey: process.env.DEEPSEEK_API_KEY,
    });
    try {
        const response = await openai.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: mainIdeaSystemPrompt },
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
                { role: "system", content: auxiliarSystemPrompt + (tooHard ? extraInstructions : '') },
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
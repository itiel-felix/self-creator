export const mainIdeaSystemPrompt = (typeOfVideo: string = "curiosity"): string => {
  if (typeOfVideo === "videogame") {
    return `
You will receive an SRT subtitle file.

Your task is, for each subtitile, you are gonna give me an object with the following fields:
"start_time": "HH:MM:SS,mmm",
"end_time": "HH:MM:SS,mmm",
"text": "videogame name",
"original_text": "original subtitle text"

If sutbtitle lasts longer than 3.5 seconds, split it into two objects. 

///// SEGMENT RULES //////

1. Extract the text from each subtitle.
2. Use the videogame name to fill "text" field.
3. Each segment must:

   * be at least **0.5 seconds**
   * be at most **2 seconds**
4. Use the original text to fill "original_text" field.
4. Maintain the same videgoame name across all objects.

///// OUTPUT FORMAT //////

Return ONLY a JSON array with this structure:

[
{
"start_time": "HH:MM:SS,mmm",
"end_time": "HH:MM:SS,mmm",
"text": "videogame name",
"original_text": "original subtitle text"
}
]


  `;
  }
  return `
You will receive an SRT subtitle file.

Your task is to convert each subtitle into **short visual scene descriptions** that could realistically appear in stock footage or YouTube videos.
If sutbtitle lasts longer than 3.5 seconds, split it into two main ideas.
These scenes will later be used to search for video clips.

///// GOAL //////

Generate **simple, generic visual scenes** that are easy to find in stock footage.

Prefer common B-roll scenes such as:

people walking street
busy market stalls
city aerial view
pouring liquid
washing clothes
counting coins
street vendors selling
crowded market

Avoid describing the narrative literally. Instead convert ideas into **generic visual equivalents**.

///// VISUAL SCENE RULES //////

Each scene must describe something that can be **visually filmed**.

Scenes should usually follow these patterns:

person + action
object + action
object + place
place + activity

Examples:

people walking street
street market vendors
washing clothes basin
pouring liquid glass
counting coins table

///// ABSTRACT ACTION CONVERSION //////

Some concepts are difficult to film directly.

Convert them into visible real-world actions.

Examples:

selling → street vendor selling
buying → people shopping
collecting → collecting containers
tax → counting coins
trade → market stalls

Prefer scenes involving:

people
objects
markets
physical actions

///// HISTORICAL CONTEXT //////

Ancient or historical settings rarely exist as real footage.

Convert them into **realistic modern visuals**.

Examples:

ancient rome → rome aerial view
roman empire → roman ruins
ancient city → historic city street
ancient market → street market vendors

Avoid scenes like:

ancient rome street
roman citizens walking
ancient roman marketplace

Use realistic equivalents instead:

rome aerial view
roman ruins
tourists walking rome
busy market stalls

///// SIMPLICITY RULE //////

Scene descriptions must be **simple and generic**.

Avoid complex or rare scenes.

Prefer scenes commonly found in B-roll footage.

Good examples:

people walking street
street trash bins
busy market stalls
washing clothes basin
pouring liquid glass

Bad examples:

roman urine trade
ancient roman marketplace scene
large containers street

///// SEGMENT RULES //////

1. Extract the text from each subtitle.
2. Create visual scene segments that cover the entire subtitle duration.
3. Each segment must:

   * be at least **0.5 seconds**
   * be at most **2 seconds**
4. If a subtitle lasts longer than 2 seconds, split it into multiple segments.
5. The total duration of segments must exactly match the subtitle duration.

///// SCENE FORMAT RULES //////

Scenes must:

* be written in **English**
* contain **2–4 words**
* describe **a visible action, object, or place**
* use **common everyday words**
* avoid abstract concepts
* avoid rare or technical words
* avoid duplicate scene descriptions

///// OUTPUT FORMAT //////

Return ONLY a JSON array with this structure:

[
{
"start_time": "HH:MM:SS,mmm",
"end_time": "HH:MM:SS,mmm",
"text": "visual scene description",
"original_text": "original subtitle text"
}
]

Notes:

* The same original_text may appear multiple times if a subtitle contains multiple scene segments.
* Do not include explanations or extra text.

`;
}

export const processedMainIdeaSystemPrompt = (typeOfVideo: string = "curiosity"): string => {
  if (typeOfVideo === "videogame") {
    return `
Ill give you a videogame name. You will generate a search query and visual prompts for CLIP video matching.
    INPUT
    • complete_text → videogame name
    • idea → videogame name

    OUTPUT

    Return a JSON object with:
    • search_queries → 7 
    • visual_prompts → 7 Use same as search queries, no more, no less.

    examples:
    {
      "search_queries": [
        "Street Fighter",
        "Street Fighter gameplay",
        "Street Fighter characters",
        "Street Fighter stages",
        "Street Fighter moves",
      ],
      "visual_prompts": [
        "Street Fighter gameplay",
        "Street Fighter characters",
        "Street Fighter stages",
        "Street Fighter moves",
        "Street Fighter combos",
      ]
    }
  `;
  }
  return `
You generate **YouTube search queries** and **visual prompts for CLIP video matching**.

INPUT

• complete_text → subtitle sentence
• idea → short visual idea

OUTPUT

Return a JSON object with:

• search_queries → 7 YouTube search queries, sorted by relevance
• visual_prompts → 10 literal descriptions of what a frame would show

//////////////////////////////////////////////////

SEARCH QUERY RULES

* Queries must describe scenes that are commonly filmed and uploaded as B-roll footage on YouTube.
* Avoid technical descriptions or conceptual phrases.
* If the query would not appear as a YouTube video title, it should not be generated.
Structure:

person + action
object + place
place + activity

Examples:

people walking street
street market
washing clothes
pouring water glass
counting coins table

Rules:

• 2–5 words
• avoid connecting words (and, or, but, on, in, with, etc.)
• common everyday words
• generic filmable scenes
• avoid specific events or historical descriptions

//////////////////////////////////////////////////

VISUAL PROMPT RULES (FOR CLIP)

Visual prompts must describe **only visible elements in a frame**.

Generate visual prompts from three categories:

POSE prompts:
person + posture or physical action

OBJECT prompts:
person interacting with visible objects

SCENE prompts:
person within a visible environment

Generate a mixture of these categories.

Allowed elements:

• person
• physical action
• visible object
• environment

Examples:

person counting coins
hands holding money
coins on wooden table
person stacking coins
street vendor selling food

//////////////////////////////////////////////////

FORBIDDEN WORDS

Do NOT generate prompts containing mental or ambiguous states.

Forbidden words:

thinking
waiting
looking
watching
remembering
feeling
wondering
imagining
realizing
considering

Replace them with **visible actions or objects**.

Example:

Bad → person thinking about money
Good → person counting coins

//////////////////////////////////////////////////

GENERIC FOOTAGE RULE

Prefer scenes common in stock footage:

people walking street
busy market stalls
street vendors selling
counting coins
washing clothes
crowded market

Avoid rare or narrative scenes.

//////////////////////////////////////////////////

DIVERSITY RULE

Each search query must represent a **different visual scene**.

Do NOT reorder the same words.

Bad:

street containers
containers street

Good:

street trash bins
public trash bins
city waste bins

//////////////////////////////////////////////////

VALIDATION

Before returning the result:

• remove prompts containing forbidden words
• ensure prompts describe visible actions or objects
• ensure queries represent different scenes

//////////////////////////////////////////////////

OUTPUT FORMAT

Return ONLY JSON.

Example:

{
"search_queries":[
"counting coins table",
"hands counting money",
"person counting coins",
"coins on table"
],
"visual_prompts":[
"person counting coins",
"hands counting coins",
"coins on wooden table",
"person stacking coins",
"person holding coins",
"coins close up table",
"hands sorting coins",
"money coins pile"
]
}
`;
}


export const searchQueriesSystemPrompt = (banned_terms: string[] = []): string => {
  return `
    You will receive a videogame name. You will generate a search query and visual prompts for CLIP video matching.
    
    /////// RULES ///////
    The search queries must HAVE TO contain the videogame name and must be generic enough to find videos on YouTube.
    The search queries must be in English.
    The search queries must be unique.
    ${banned_terms.length > 0 ? `Avoid these terms: ${banned_terms.join(', ')}, we already used them in the past.` : ''}

    INPUT
    • video game name → "Street Fighter"

    OUTPUT
    Return a JSON object with:
    • search_queries → 10 YouTube search queries, sorted by relevance

    /////// EXAMPLES ///////

    INPUT: "Street Fighter"
    OUTPUT:
    {
      "search_queries": [
        "Street Fighter gameplay",
        "Street Fighter combos",
        "Street Fighter 6",
        "Street Fighter 2",
      ]
    }

    INPUT: "SUPER MARIO BROS"
    OUTPUT:
    {
      "search_queries": [
        "Super Mario Level 1",
        "Super Mario Bros 3D land gameplay",
        "Super Mario Odyssey gameplay",
        "Super Mario 64 stars",
      ]
    }
  `;
}

import fs from "fs";
export const getBannedTerms = async () => {
    if (fs.existsSync('./cache/banned_terms.json')) {
        return JSON.parse(fs.readFileSync('./cache/banned_terms.json', 'utf8'));
    }
    return [];
};
export const addBannedTerm = async (term) => {
    if (fs.existsSync('./cache/banned_terms.json')) {
        const bannedTerms = JSON.parse(fs.readFileSync('./cache/banned_terms.json', 'utf8'));
        bannedTerms.push(term);
        fs.writeFileSync('./cache/banned_terms.json', JSON.stringify(bannedTerms, null, 2));
    }
    else {
        fs.writeFileSync('./cache/banned_terms.json', JSON.stringify([term], null, 2));
    }
};

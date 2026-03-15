const toSrtTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};

const toAssTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.round((seconds % 1) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};

const ASS_HEADER = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,Impact,180,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,3,0,2,80,80,930,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

export interface WhisperSegment {
    start: number;
    end: number;
    text: string;
    words?: { word: string; start: number; end: number }[];
}

export const generateSRT = (segments: WhisperSegment[]): string => {
    return segments
        .map((segment, i) => {
            const start = toSrtTime(segment.start);
            const end = toSrtTime(segment.end);
            return `${i + 1}\n${start} --> ${end}\n${segment.text.trim()}`;
        })
        .join('\n\n');
};

export interface WhisperWord {
    word: string;
    start: number;
    end: number;
}

export const generateASS = (words: WhisperWord[]): string => {
    const lines = [ASS_HEADER];

    for (let i = 0; i < words.length; i++) {
        const current = words[i];
        const next = words[i + 1];

        const start = toAssTime(current.start);
        const endTime = next && (next.start - current.end) < 0.5 ? next.start : current.end;
        const end = toAssTime(endTime);

        const duration = (endTime - current.start) * 1000;
        const zoomDuration = Math.min(200, duration * 0.25);

        const text = `{\\fad(50,50)\\fs110\\t(0,${zoomDuration},\\fs170)\\t(${zoomDuration},${zoomDuration * 2},\\fs110)\\c&H00FFFF&\\bord6\\shad0}${current.word.toUpperCase()}`;
        lines.push(`Dialogue: 0,${start},${end},Main,,0,0,0,,${text}`);
    }

    return lines.join('\n');
};

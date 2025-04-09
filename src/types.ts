export type OCROptions = {
    isolateFooters?: boolean;
    part: number;
    prompt: string;
    resetBeforeStart?: boolean;
};

export type OCRResult = {
    aiModelId?: string;
    pages: Page[];
    prompt?: string;
    startTimestamp?: Date;
    timestamp: Date;
};

export type Page = {
    accessed: Date;
    aiModelId?: string;
    body: string;
    footnotes?: string;
    page: number;
    part: number;
};

export type PageImageFile = { file: string; page: number };

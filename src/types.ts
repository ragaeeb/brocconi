export type OCROptions = {
    isolateFooters?: boolean;
    part: number;
    prompt: string;
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
    body: string;
    footnotes?: string;
    ocrModelId?: string;
    page: number;
    part: number;
};

export type PageImageFile = { file: string; page: number };

export type OCROptions = {
    apiKey?: string;
    assets: string[];
    clearBeforeStart?: boolean;
    prompt: string;
};

export type OCRResult = {
    createdAt?: Date;
    pages: Page[];
    prompt?: string;
    updatedAt: Date;
};

export type Page = {
    body: string;
    createdAt: Date;
    modelId?: string;
    page: number;
};

export type PageImageFile = { file: string; page: number };

export type OCRResult = {
    aiModelId?: string;
    pages: Page[];
    prompt?: string;
    scrapingEngine?: { name: string; version: string };
    startTimestamp?: Date;
    timestamp: Date;
    urlPattern?: string;
};

export type Page = { accessed: Date; body: string; footnotes?: string; page: number; part: number };

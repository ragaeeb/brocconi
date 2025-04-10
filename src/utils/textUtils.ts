export const maskText = (text: string) => {
    return text.slice(0, 3) + '*****' + text[Math.floor(text.length / 2)] + '*****' + text.slice(-3);
};

export const sanitizeInput = (input: string) => input.replace(/\\ /g, ' ').trim();

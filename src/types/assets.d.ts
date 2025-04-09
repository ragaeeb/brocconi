declare module '*.txt' {
    const content: string;
    export default content;
}

declare module '*.jpg' {
    const assetPath: string;
    export default assetPath;
}

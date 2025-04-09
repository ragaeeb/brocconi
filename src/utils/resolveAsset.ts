import path from 'node:path';

export function resolveAsset(assetPath: string, importMetaUrl: string): string {
    return path.isAbsolute(assetPath) ? assetPath : path.join(path.dirname(new URL(importMetaUrl).pathname), assetPath);
}

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import promptWithFootersTxt from '../../training/prompt_footers.txt' assert { type: 'text' };
import promptWithoutFootersTxt from '../../training/prompt_no_footers.txt' assert { type: 'text' };
import samplePageWithFootnotesRel from '../../training/sample_with_footnotes.jpg' assert { type: 'asset' };

// Path to the current compiled JS module (inside dist/)
const __dirname = dirname(fileURLToPath(import.meta.url));

// Bun injects a relative path to dist/asset.ext
// So we resolve the asset relative to __dirname of the compiled file
const samplePageWithFootnotes = join(__dirname, samplePageWithFootnotesRel);

export const promptWithFooters = promptWithFootersTxt;
export const promptWithoutFooters = promptWithoutFootersTxt;
export { samplePageWithFootnotes };

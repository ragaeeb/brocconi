import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import promptWithFooters from '../../training/prompt_footers.txt' assert { type: 'text' };
import promptWithoutFooters from '../../training/prompt_no_footers.txt' assert { type: 'text' };
import samplePageWithFootnotesRelative from '../../training/sample_with_footnotes.jpg' assert { type: 'asset' };

// __dirname of the current module
const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve absolute path to the copied asset inside dist/
const samplePageWithFootnotes = join(__dirname, '..', samplePageWithFootnotesRelative);

export { promptWithFooters, promptWithoutFooters, samplePageWithFootnotes };

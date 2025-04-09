import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import promptWithFooters from '../../training/prompt_footers.txt' assert { type: 'text' };
import promptWithoutFooters from '../../training/prompt_no_footers.txt' assert { type: 'text' };
import samplePageWithFootnotesRelative from '../../training/sample_with_footnotes.jpg' assert { type: 'asset' };

const __dirname = dirname(fileURLToPath(import.meta.url));

const samplePageWithFootnotes = join(__dirname, '..', samplePageWithFootnotesRelative);

export { promptWithFooters, promptWithoutFooters, samplePageWithFootnotes };

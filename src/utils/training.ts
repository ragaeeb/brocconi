import promptWithFooters from '../../training/prompt_footers.txt' assert { type: 'text' };
import promptWithoutFooters from '../../training/prompt_no_footers.txt' assert { type: 'text' };
import samplePageWithFootnotesRel from '../../training/sample_with_footnotes.jpg' assert { type: 'asset' };
import { resolveAsset } from './resolveAsset.js';

const samplePageWithFootnotes = resolveAsset(samplePageWithFootnotesRel, import.meta.url);

export { promptWithFooters, promptWithoutFooters, samplePageWithFootnotes };

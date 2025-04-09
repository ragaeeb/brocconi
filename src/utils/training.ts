import { fileURLToPath } from 'node:url';

const promptWithFooters = fileURLToPath(import.meta.resolve('../../training/prompt_footers.txt'));
const promptWithoutFooters = fileURLToPath(import.meta.resolve('../../training/prompt_no_footers.txt'));
const samplePageWithFootnotes = fileURLToPath(import.meta.resolve('../../training/sample_with_footnotes.jpg'));

export { promptWithFooters, promptWithoutFooters, samplePageWithFootnotes };

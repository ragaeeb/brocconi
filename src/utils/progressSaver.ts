import { file } from 'bun';
import process from 'node:process';
import { type Logger as PinoLogger } from 'pino';

export type SubLogger = Pick<PinoLogger, 'error' | 'info' | 'warn'>;

interface ProgressSaverOptions<T> {
    getData: () => T;
    logger: SubLogger;
    outputFile: string;
}

export class ProgressSaver<T> {
    private getData: () => T;
    private logger: SubLogger;
    private outputFile: string;

    constructor(options: ProgressSaverOptions<T>) {
        this.outputFile = options.outputFile;
        this.getData = options.getData;
        this.logger = options.logger;

        // Handle shutdown signals
        process.on('SIGINT', async () => {
            this.logger.info('Gracefully shutting down...');
            await this.saveProgress();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            this.logger.info('Process terminated.');
            await this.saveProgress();
            process.exit(0);
        });
    }

    /**
     * Checks for an existing file and restores data if present
     * @returns True if data was restored, false otherwise
     */
    async restore(): Promise<T | undefined> {
        const fileExists = await file(this.outputFile).exists();

        if (!fileExists) {
            return;
        }

        const data = file(this.outputFile).json() as T;

        this.logger.info('Progress data successfully restored');

        return data;
    }

    async saveProgress() {
        try {
            this.logger.info(`Saving progress to ${this.outputFile}...`);
            await file(this.outputFile).write(JSON.stringify(this.getData(), null, 2));
        } catch (error) {
            this.logger.error('Error saving progress:', error);
        }
    }
}

import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');

export class Logger {
    private logFile: string;
    constructor(id: string) {
        this.logFile = path.join(LOG_DIR, `${id}.log`);
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }
        if (!fs.existsSync(this.logFile)) {
            fs.writeFileSync(this.logFile, `[${new Date().toISOString()}] [Info] Logger initialized\n`);
        } else {
            fs.truncateSync(this.logFile);
            fs.writeFileSync(this.logFile, `[${new Date().toISOString()}] [Info] Logger initialized\n`);
        }
    }

    public info(message: string) {
        const infoMessage = `[${new Date().toISOString()}] [Info] ${message}\n`;
        this.logAndWrite(infoMessage);
    }

    public error(message: string) {
        const errorMessage = `[${new Date().toISOString()}] [Error] ${message}\n`;
        this.logAndWrite(errorMessage);
    }

    public warning(message: string) {
        const warningMessage = `[${new Date().toISOString()}] [Warning] ${message}\n`;
        this.logAndWrite(warningMessage);
    }

    private logAndWrite(message: string) {
        console.log(message);
        fs.appendFileSync(this.logFile, message);
    }

}
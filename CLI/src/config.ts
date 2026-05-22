import fs from 'fs'
import path from 'path'
import os from 'os'


const CONFIG_PATH = path.join(os.homedir(), '.glitool', 'config.json');


export type UserConfig = {
    name: string;
    preferredLanguage: string;
    codingStyle: 'tabs' | 'spaces';
    preferredModel: string;
    routing: {
        useLlmClassifier: boolean;
    };
};


const DEFAULTS: UserConfig = {
    name: 'Developer',
    preferredLanguage: 'TypeScript',
    codingStyle: 'spaces',
    preferredModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    routing: {
        useLlmClassifier: true,
    },
};



export function loadConfig(): UserConfig{
    try{
        if(!fs.existsSync(CONFIG_PATH)) return DEFAULTS;
        const data = JSON.parse(fs.readFileSync(CONFIG_PATH,'utf-8'));
        return { ...DEFAULTS, ...data};
    } catch {
        return DEFAULTS;
    }
}


export function saveConfig(config:Partial<UserConfig>): void{
    const current = loadConfig();
    const updated = {...current, ...config};
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true});
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated,null,2), 'utf-8');
}
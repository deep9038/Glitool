#!/usr/bin/env node
import { Command } from "commander";
import {  config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import { render } from "ink";
import { App } from "./ui/App.js";
import { loadConfig, saveConfig } from "./config.js";
import { generateAndSaveSummary } from "./memory.js";
import { getDefaultLlm, sessionMessages } from "./agent.js";
import { extractAndSaveProjectMemory } from "./projectMemory.js";
import os from 'os';
// import { mkdirSync, writeFileSync, existsSync } from 'fs';
// import { createInterface } from "readline";

import { mkdirSync, existsSync } from 'fs';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: join(os.homedir(), '.glitool', '.env') })
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const program = new Command();
let explainMode = false;


program
    .name('glitool')
    .description('A CLI tool for glitool')
    .version(pkg.version);


program
    .command('hello')
    .description('Say hello')
    .argument('<name>', 'Name to greet')
    .option('-s, --shout', 'Shout the greeting')
    .action((name,option)=>{
        const msg = `Hello, ${name}!`;
        console.log(option.shout ? msg.toUpperCase():msg);
    });


program
    .command('config')
    .description('Manage Your glitool profile')
    .option('--set-name <name>', 'set your name')
    .option('--set-language <lang>', 'Set preferred language')
    .option('--set-style <style>', 'set coding style (tabs or spaces)')
    .option('--set-model <model>', 'Set preferred model')
    .option('--show', 'Show current config')
    .action((options)=>{
        if (options.show){
            const cfg = loadConfig();
            console.log(JSON.stringify(cfg,null,2));
            return;
        }

        if(options.setName) saveConfig({name: options.setName});
        if(options.setLanguage) saveConfig({preferredLanguage: options.setLanguage});
        if(options.setStyle) saveConfig({codingStyle: options.setStyle});
        if(options.setModel) saveConfig({preferredModel: options.setModel});
        console.log('Config updated');
    });


    program
        .option('-e, --explain', 'Explain every change in simple language')
        .action((options)=>{
            explainMode = options.explain ?? false;
        });




async function ensureApiKey(): Promise<void> {
    if (process.env.OPENAI_API_KEY) return; // BYOK mode — use OpenAI directly
    // Otherwise Glitool backend handles auth (anon trial or glt_ token)
}


const saveAndExit = async () => {
    try{
        const summaryLlm = getDefaultLlm();
        await generateAndSaveSummary(sessionMessages, summaryLlm);
        await extractAndSaveProjectMemory(sessionMessages, summaryLlm);
    } catch {
        // exit cleanly even if LLM is unreachable
    }
    process.exit(0);
};


process.on('SIGINT', saveAndExit);
process.on('SIGTERM', saveAndExit);

await ensureApiKey();

if(process.argv.length === 2 || process.argv.includes('--explain') || process.argv.includes('-e')){
    explainMode = process.argv.includes('--explain') || process.argv.includes('-e');
    const { waitUntilExit } = render(<App explainMode={explainMode} />);
    await waitUntilExit();
    // const { waitUntilExit } = render(<App/>)
    // await waitUntilExit()
}else {  
    program.parse()
}
import { appendFileSync, mkdirSync  } from "fs";
import { join } from 'path';
import os from 'os';
import type { RouteDecision } from "./router.js";



interface RoutingEvent extends RouteDecision{
    timestamp: string;
    prompt_length: number;
}


export function logRouting(prompt: string, decision: RouteDecision): void{
    try{
        const logDir = join(os.homedir(), '.glitool');
        mkdirSync(logDir,{recursive:true});
        const event: RoutingEvent={
            timestamp: new Date().toISOString(),
            prompt_length: prompt.length,
            ...decision,
        };

        appendFileSync(
            join(logDir, 'routing.log.jsonl'),
            JSON.stringify(event) + '\n',
            'utf-8'
        );

    } catch {
        // never crash the tool because of telemetry
    }
}
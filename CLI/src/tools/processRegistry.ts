import type { ChildProcess } from "child_process";

interface BackgroundProcess{
    proc: ChildProcess;
    command: string;
    stdout:string;
    stderr:string;
    exitCode: number | null;
    startedAt: Date;
}


const registry= new Map<string, BackgroundProcess>();
let counter = 0;



export function registerProcess(proc: ChildProcess, command: string): string {
    const handle = `bg_${++counter}`;
    const entry: BackgroundProcess = {
        proc,command,stdout:'',stderr:'',exitCode:null,startedAt: new Date()
    };
    proc.stdout?.on(`data`,(d)=> {entry.stdout += d.toString();});
    proc.stderr?.on(`data`,(d)=> {entry.stderr += d.toString();});
    proc.on(`close`, (code)=> {entry.exitCode = code;})
    registry.set(handle,entry);
    return handle;
}


export function getProcess(handle: string): BackgroundProcess | undefined {
    return registry.get(handle);
}

export function killProcess(handle: string): boolean{
    const entry = registry.get(handle);
    if(!entry) return false;
    try { entry.proc.kill();} catch{}
    registry.delete(handle);
    return true;
}



export function cleanupAll(): void{
    for (const [,entry] of registry){
        try{entry.proc.kill();} catch{}
    }
    registry.clear();
}







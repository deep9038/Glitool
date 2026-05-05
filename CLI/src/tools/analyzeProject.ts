import {tool} from "@langchain/core/tools";
import fs from 'fs';
import path from 'path';
import { execSync } from "child_process";
import {z} from 'zod';



const SKIP_DIRS = ['node_modules', '.git','dist','build','.next'];

function getDependencyList(){
    const packageJsonPath = path.join(process.cwd(),'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath,'utf-8'));
    return packageJson.dependencies || {};
}


function checkForOutdatedDependencies(){
    try{
        const result = execSync('npm outdated --json', {timeout:10000, stdio:'pipe'}).toString();
        return JSON.parse(result);
    } catch(error){
        return {};
    }
}


function analyzeCodeQuality(){
    try{
        const result = execSync(`eslint . --format json`, {timeout:10000, stdio:'pipe'}).toString();
        return JSON.parse(result)
    }catch(error){
        return {error:[], warnings:[]}
    }
}


function getFiles(dir: string): string[]{
    const entries = fs.readdirSync(dir, {withFileTypes:true});
    const files: string[]=[];

    for(const entry of entries){
        if(SKIP_DIRS.includes(entry.name)) continue;
        const fullPath = path.join(dir,entry.name);
        if(entry.isDirectory()){
            files.push(...getFiles(fullPath));
        }else {
            files.push(fullPath);
        }
    }
    return files;
}


export const analyzeProjectTool = tool(
    async ()=>{
        const dependencies = getDependencyList();
        const outdatedDependencies = checkForOutdatedDependencies();
        const codeQualityResults = analyzeCodeQuality();
        const projectFiles = getFiles(process.cwd());
        return {
            dependencies, 
            outdatedDependencies,
            codeQualityResults,
            projectFiles
        }
    },
    {
        name:'analyzeProject',
        description: 'analyze the current project for dependencies, code quality , and  project structure . useful for getting an overview of the project and identifying potential issues.',
        schema: z.object({})
    }
)






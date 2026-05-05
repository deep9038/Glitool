import { runPlanner } from './planner.js';
import { runCoder } from './coder.js';
import { runReviewer } from './reviewer.js';


const MAX_ITERATIONS = 1;


export async function runAgentGraph(userMessage:string,systemPrompt:string,onToolCall:(name:string,args?: Record<string,any> )=> void,onStatus:(status:string)=>void):Promise<string>{

    onStatus('Planning...');
    const plan = await runPlanner(userMessage,systemPrompt);

    if(plan.trim() === 'SIMPLE'){
        return '';
    }


    let coderOutPut = '';
    let finalResponse = '';
    let approved = false;
    let iteration = 0;


    while(!approved && iteration < MAX_ITERATIONS){
        onStatus(`Executing plan${iteration > 0 ? ' (fixing issues)': ''}...`);
        coderOutPut = await runCoder(plan,userMessage,onToolCall);

        onStatus('Reviewing...');
        const review = await runReviewer(plan, coderOutPut,userMessage);
        approved = review.approved;
        finalResponse = review.finalResponse;

        if(!approved){
            onStatus(`Reviewer founder issues: ${review.feedback}`)
        }
        iteration++;
    }

    return finalResponse|| coderOutPut;


}
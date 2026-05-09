import { runPlanner } from './planner.js';
import { runCoder } from './coder.js';
import { runReviewer } from './reviewer.js';


const MAX_ITERATIONS = 2;


export async function runAgentGraph(userMessage:string,systemPrompt:string,onToolCall:(name:string,args?: Record<string,any> )=> void,onStatus:(status:string)=>void):Promise<string>{

    onStatus('Planning...');
    const plan = await runPlanner(userMessage,systemPrompt);

    if(plan.trim() === 'SIMPLE'){
        return null as any;
    }


    let coderOutPut = '';
    let finalResponse = '';
    let approved = false;
    let iteration = 0;
    let reviewFeedback = '';   // ← declare BEFORE the loop


    while(!approved && iteration < MAX_ITERATIONS){
        onStatus(`Executing plan${iteration > 0 ? ' (fixing issues)' : ''}...`);
        
        // include feedback on retry
        const planWithFeedback = iteration === 0 
            ? plan 
            : `${plan}\n\nReviewer feedback to address:\n${reviewFeedback}`;
        
        coderOutPut = await runCoder(planWithFeedback, userMessage, onToolCall);

        onStatus('Reviewing...');
        const review = await runReviewer(plan, coderOutPut, userMessage);
        approved = review.approved;
        finalResponse = review.finalResponse;
        reviewFeedback = review.feedback;  // capture for next iteration

        if(!approved){
            onStatus(`Reviewer found issues: ${review.feedback}`);
        }
        iteration++;
    }


    return finalResponse|| coderOutPut;


}
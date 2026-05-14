import { tool } from "@langchain/core/tools";
import {z} from 'zod';
import TurndownService from 'turndown';


const turndown = new TurndownService({headingStyle: 'atx', codeBlockStyle: 'fenced'});


const MAX_CHARS = 20_000;

export const webFetchTool = tool(
    async({url})=>{
        let parsed:URL;

        try{
            parsed = new URL(url);
        }catch{
            return `Invalid URL: ${url}`;
        }

        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return `BLOCKED: Only http/https URLs are allowed. Got: ${parsed.protocol}`;
        }

        let response:Response;

        try{
            response = await fetch(url,{
                headers: {'User-Agent': 'glitool/1.0'},
                signal: AbortSignal.timeout(15_000)
            });
        } catch(err: any){
            return `Fetch failed: ${err.message}`;
        }


        if(!response.ok){
            return `HTTP ${response.status}: ${response.statusText}`;
        }


        const contentType = response.headers.get('content-type') ?? '';


        if(contentType.includes('text/html')){
            const html = await response.text();
            const markdown = turndown.turndown(html);
            const trimmed = markdown.slice(0, MAX_CHARS);
            return trimmed.length < markdown.length ? trimmed + '\n\n(content truncated at 20 00 chars)' : trimmed;
        }

        const text = await response.text();
        return text.slice(0,MAX_CHARS);

    },
    {
        name:'webFetch',
        description:  'Fetch a public URL and return its content as readable text. HTML pages are converted to markdown. Use for reading docs, changelogs, npm package pages, GitHub READMEs, or any public web resource. Only http/https allowed — file:// and other schemes are blocked.',
        schema: z.object({
            url: z.string().describe('The full URL to fetch (must start with http:// or https://)')
        })
    }
)
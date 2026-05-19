import { log } from "./logger.js";

export type ConfirmRequest = {
    type: 'write' | 'edit';
    filePath: string;
    content?: string;
    oldString?: string;
    newString?: string;
    risk?: 'low' | 'medium' | 'high';
};

type ConfirmFn = (req: ConfirmRequest) => Promise<boolean>;

let handler: ConfirmFn = async () => true;


export function setConfirmHandler(fn: ConfirmFn) {
    handler = fn;
}


export async function requestConfirm(req: ConfirmRequest): Promise<boolean> {
    log('confirm:requested', { filePath: req.filePath, type: req.type });
    return handler(req);
}
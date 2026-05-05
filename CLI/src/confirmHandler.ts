type Confirmfn = (message: string)=> Promise<boolean>;

let handler: Confirmfn = async()=>true;

export function setConfirmHandler(fn: Confirmfn){
    handler = fn;
}


export function requestConfirm(message:string): Promise<boolean>{
    return handler(message)
}
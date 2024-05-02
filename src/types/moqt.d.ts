export type MoqtData = {
    type: string,
    chunk: any,
    seqId:number
}

export type TrackData = {
    id: number,
    namespace: string,
    name: string,
    packagerType?: string,
    authInfo: string,
    maxInFlightRequests: number,
    isHipri: boolean,
    numSubscribers?: number
}


export interface MoqtTracks {
    [key:string]: TrackData
}
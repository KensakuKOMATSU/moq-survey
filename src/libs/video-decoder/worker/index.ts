import { StateEnum, deSerializeMetadata } from "../../utils/utils"
import { TsQueue } from "../../utils/ts_queue"

import { MessageData } from "../../../types/moqt"

declare var VideoDecoder:any

type State = {
    worker: StateEnum,
    waitForKeyFrame: boolean,
    discardedDelta: number,
    discardedBufferFull: number
}

const MAX_DECODE_QUEUE_SIZE_FOR_WARNING_MS = 500
const MAX_QUEUED_CHUNKS_DEFAULT = 60

const state:State = {
    worker: StateEnum.Created,
    waitForKeyFrame: true,
    discardedDelta: 0,
    discardedBufferFull: 0
}

let vDecoder:any = null

const maxQueuedChunks = MAX_QUEUED_CHUNKS_DEFAULT
const ptsQueue = new TsQueue()

const postErrorMessage = ( kind:String, message: any) => {
    postMessage({
        type: 'error',
        meta: {
            kind,
        },
        payload: message
    })
}

/* eslint-disable-next-line no-restricted-globals */
self.addEventListener( 'message', async ({ data }:{data:MessageData}) => {
    if( state.worker === StateEnum.Created ) {
        state.worker = StateEnum.Instantiated
    }

    if( state.worker === StateEnum.Stopped ) {
        console.log(`VideoEncoder worker is stopped. This does not accept any messages`)
    }

    switch( data.type ) {
        case 'stop': {
            if( vDecoder !== null ) {
                await vDecoder.flush()
                vDecoder.close()

                vDecoder = null
                ptsQueue.clear()
            }

            state.worker = StateEnum.Stopped

            break 
        }
        case 'decode': {
            const vChunk = data.payload
            const metadata = data.metadata

            // @ts-ignore
            if( metadata !== undefined && metadata !== null && metadata.metadata ) {
                if( !vDecoder ) {
                    vDecoder = new VideoDecoder({
                        //@ts-ignore
                        output: frame => {
                            _processVideoFrame( frame )
                        },
                        error: ( err:Error ) => {
                            postErrorMessage('decode', err.message )
                        }
                    })
                }
                vDecoder.addEventListener('dequeue', ( e:Event ) => {
                    if( vDecoder !== null ) {
                        ptsQueue.removeUntil( vDecoder.decodedQueueSize )
                    }
                })

                // @ts-ignore
                const config = deSerializeMetadata( metadata.metadata )
                config.optimizeForLatency = true
                // switching to software-decoding( h264 )
                config.hardwareAcceleration = 'prefer-software'

                vDecoder.configure( config )

                state.worker = StateEnum.Running
                _setWaitForKeyframe( true )
            }

            if( state.worker !== StateEnum.Running ) {
                postErrorMessage("decode", "workerState in not Running.")
                return
            }

            if( vDecoder.decodedQueueSize >= maxQueuedChunks ) {
                state.discardedBufferFull++
                postErrorMessage("decode", `Discarded ${state.discardedBufferFull} video chunks because decode buffer is full.`)
                return
            }

            state.discardedBufferFull = 0

            // @ts-ignore
            if( data.isDisco ) {
                _setWaitForKeyframe( true )
            }

            if( _isWaitingForKeyframe() && ( vChunk.type !== 'key' ) ) {
                state.discardedDelta++
            } else {
                state.discardedDelta = 0
                _setWaitForKeyframe( false )

                ptsQueue.removeUntil( vDecoder.decodedQueueSize )
                ptsQueue.addToPtsQueue( vChunk.timestamp, vChunk.duration )
                vDecoder.decode( vChunk )
            }

            break
        }
        default: { 
            /* noop */

            break
        }
    }
})

//////////////////////////////////////////////////
// private

function _processVideoFrame( vFrame:any ) {
    postMessage({ 
        type: 'vFrame',
        payload: vFrame,
        metadata: {
            queueSize: ptsQueue.getPtsQueueLengthInfo().size,
            queueLengthMs: ptsQueue.getPtsQueueLengthInfo().lengthMs
        }
    // @ts-ignore
    }, [ vFrame ])
}

function _setWaitForKeyframe( a:boolean ) {
    state.waitForKeyFrame = a
}

function _isWaitingForKeyframe():boolean {
    return state.waitForKeyFrame
} 


export {}
import { StateEnum, serializeMetadata } from "../../utils/utils"
import { MessageData } from "../../../types/moqt"

declare var VideoEncoder:any

type State = {
    worker: StateEnum,
    frameDeliveredCounter: number,
    chunkDeliveredCounter: number,
    encoderMaxQueueSize: number,
    keyframeEvery: number,
    insertNextKeyframe: boolean,
}

const state:State = {
    worker: StateEnum.Created,
    frameDeliveredCounter: 0,
    chunkDeliveredCounter: 0,
    encoderMaxQueueSize: 5,
    keyframeEvery: 60,
    insertNextKeyframe: false,
}

let vEncoder:any = null

const postErrorMessage = ( kind:String, message: any) => {
    postMessage({
        type: 'error',
        meta: {
            kind,
        },
        payload: message
    })
}

const initVideoEncoder = {
    //@ts-ignore
    output: ( chunk:any, metadata:EncodedVideoChunkMetadata ) => {
        const mesg:MessageData = { 
            type: 'vchunk', 
            metadata: { 
                seqId: state.chunkDeliveredCounter++,
                metadata: serializeMetadata( metadata )
            },
            payload: chunk
        }
        postMessage( mesg )
    },
    error: ( e:Error ) => {
        if( state.worker === StateEnum.Created ) {
            console.error( e.message )
        } else {
            postErrorMessage("initVideoEncoder", e.message )
        }
    }
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
        case 'init': {
            if( state.worker === StateEnum.Running ) {
                postErrorMessage('init', 'video encoder is already running')
                return
            }

            const encoderConfig = data.payload 
            if( encoderConfig === undefined ) {
                postErrorMessage('init', 'no encoderConfig found in payload')
                return
            }

            vEncoder = new VideoEncoder( initVideoEncoder )

            vEncoder.configure( encoderConfig )

            if( data.metadata !== undefined ) {
                if( 'encoderMaxQueueSize' in data.metadata && typeof data.metadata.encoderMaxQueueSize === 'number' ) {
                    state.encoderMaxQueueSize = data.metadata.encoderMaxQueueSize
                }
                if( 'keyframeEvery' in data.metadata && typeof data.metadata.keyframeEvery === 'number' ) {
                    state.keyframeEvery = data.metadata.keyframeEvery
                }
            }
            state.worker = StateEnum.Running

            break
        }
        case 'stop': {
            await vEncoder.flush()
            vEncoder.close()

            vEncoder = null

            state.worker = StateEnum.Stopped

            break 
        }
        case 'encode': {
            const vFrame = data.payload

            if( vEncoder.encodeQueueSize > state.encoderMaxQueueSize ) {
                postErrorMessage("encode", `queue size exceeds max:${state.encoderMaxQueueSize}`)

                vFrame.close()
                state.insertNextKeyframe = true
            } else {
                const frameNum = state.frameDeliveredCounter++
                const insertKeyFrame = ( frameNum % state.keyframeEvery ) === 0 ||  ( state.insertNextKeyframe === true )
                vEncoder.encode( vFrame, { keyFrame: insertKeyFrame })
                state.insertNextKeyframe = false
            }
            break
        }
        default: { 
            /* noop */

            break
        }
    }
})


export {}
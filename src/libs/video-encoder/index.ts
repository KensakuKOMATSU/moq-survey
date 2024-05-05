import EventEmitter from "events"

export default class VEncoder extends EventEmitter {
    _worker: Worker

    constructor() {
        super()

        this._worker = new Worker( new URL('./worker', import.meta.url))
        this._addListeners()
    }

    destroy() {
        this._worker.terminate()
    }

    init( data:{encoderMaxQueueSize: number, keyframeEvery: number, encoderConfig: object }) {
        this._worker.postMessage({
            type: 'init',
            metadata: {
                encoderMaxQueueSize: data.encoderMaxQueueSize,
                keyframeEvery: data.keyframeEvery
            },
            payload: data.encoderConfig
        })
    }

    stop() {
        this._worker.postMessage({
                type: 'stop'
        })
    }

    encode( vFrame:any ) {
        this._worker.postMessage({
            type: 'encode',
            payload: vFrame
        })
    }
    _addListeners = () => {
        this._worker.addEventListener('message', ({ data }:{data:any}) => {
            switch( data.type ) {
            case 'vchunk':
                this.emit(`vchunk`, { seqId: data.metadata?.seqId, metadata: data.metadata?.metadata, chunk: data.payload } )
                break
            case 'error':
                if( data.meta?.kind ) {
                    console.error(`${data.meta.kind}::${data.payload}`)
                    this.emit('error', `${data.meta.kind}::${data.payload}` )
                }
                break
            default:
                /* noop */
                break
            }
        })
    }
}
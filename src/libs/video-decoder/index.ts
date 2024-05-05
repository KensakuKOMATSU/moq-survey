import EventEmitter from "events"

export default class VDecoder extends EventEmitter {
    _worker: Worker

    constructor() {
        super()

        this._worker = new Worker( new URL('./worker', import.meta.url))
        this._addListeners()
    }

    destroy() {
        this._worker.terminate()
    }

    stop() {
        this._worker.postMessage({
                type: 'stop'
        })
    }

    decode( vChunk:any ) {
        this._worker.postMessage({
            type: 'decode',
            metadata: vChunk.metadata,
            payload: vChunk.payload
        })
    }
    _addListeners = () => {
        this._worker.addEventListener('message', ({ data }:{data:any}) => {
            switch( data.type ) {
            case 'vFrame':
                this.emit(`vFrame`, { frameData: data.payload, metadata: data.metadata } )
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
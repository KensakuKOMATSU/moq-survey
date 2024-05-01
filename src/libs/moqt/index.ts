import EventEmitter from "events"

//import SampleWorker from 'workerize-loader!./worker/sample' // eslint-disable-line import/no-webpack-loader-syntax
export default class Moqt extends EventEmitter {
    _worker: Worker
    _ev: EventEmitter
    _timeout: number

    constructor() {
        super()
        this._ev = new EventEmitter()

        this._worker = new Worker( new URL('./worker', import.meta.url))

        this._timeout = 5_000

        this._addListeners()
    }

    destroy() {
        this._worker.terminate()
    }

    connect( { endpoint }: {endpoint:String} ) {
        return new Promise<any>( ( resolve, reject ) => {
            const timer = setTimeout(() => {
                reject( new Error('connect timeout'))
            }, this._timeout )

            this._ev.once('response:connect', data => {
                clearTimeout( timer )
                resolve( data )
            })

            this._worker.postMessage({
                type: 'connect',
                payload: { endpoint }
            })
        })
    }

    disconnect() {
        return new Promise<void>( ( resolve, reject ) => {
            //todo close worker
            const timer = setTimeout(() => {
                reject( new Error('disconnect timeout'))
            }, this._timeout )

            this.once( 'closed', () => {
                clearTimeout( timer )
                resolve()
            })
            
            this._worker.postMessage({
                type: 'disconnect'
            })
        })
    }

    createPublisher( moqTracks:object ) {
        return new Promise<object>( ( resolve, reject ) => {
            const timer = setTimeout(() => {
                reject( new Error('createPublisher timeout'))
            }, this._timeout)

            this._ev.once('response:createPublisher', ( data:object) => {
                clearTimeout( timer )
                resolve( data )
            })

            this._worker.postMessage({
                type: 'createPublisher',
                payload: { tracks: moqTracks }
            })
        })
    }


    _addListeners = () => {
        this._worker.addEventListener('message', ({ data }:{data:any}) => {
            console.log( data )
            switch( data.type ) {
            case 'response':
                if( data.meta?.kind ) {
                    this._ev.emit(`response:${data.meta.kind}`, data.payload )
                }
                break
            case 'closed':
                this._ev.emit('closed')
                this.emit('closed')
                break
            case 'error':
                if( data.meta?.kind ) {
                    this.emit('error', `${data.meta.kind}::${data.payload}` )
                }
                break
            default:
                break
            }
        })
    }
}
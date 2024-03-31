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

    connect( { endpoint }: {endpoint:String} ) {
        return new Promise<any>( ( resolve, reject ) => {
            const timer = setTimeout(() => {
                reject( new Error('connect timeout'))
            }, this._timeout )

            this._ev.addListener('error:connect', (data:string) => {
                clearTimeout( timer )
                reject( new Error( data ) )
            })

            this._ev.addListener('response:connect', data => {
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

    _addListeners = () => {
        this._worker.addEventListener('message', ({ data }) => {
            switch( data.type ) {
            case 'response':
                if( data.meta?.kind === 'connect' ) {
                    this._ev.emit('response:connect', data.payload )
                }
                break
            case 'closed':
                this._ev.emit('closed')
                this.emit('closed')
                break
            case 'error':
                if( data.meta?.kind === 'connect' ) {
                    this._ev.emit('error:connect', data.payload )
                }
                break
            default:
                break
            }
        })
    }
}
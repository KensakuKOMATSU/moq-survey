import EventEmitter from "events"

declare var VideoFrame:any

export default class VideoCapture extends EventEmitter {
    _reqId: number|null
    _canvas: HTMLCanvasElement
    _ctx:CanvasRenderingContext2D|null

    constructor() {
        super()

        // this._worker = new Worker( new URL('./worker', import.meta.url))
        this._reqId = null

        this._canvas = document.createElement('canvas')
        this._ctx = this._canvas.getContext('2d')


        this._addListeners()
    }

    start( videoEl:HTMLVideoElement  ) {
        const width = videoEl.videoWidth
        const height = videoEl.videoHeight

        this._canvas.width = width
        this._canvas.height = height

        const loop = () => {
            if( this._ctx ) {
                this._ctx.drawImage( videoEl, width, height )
                //const img = this._ctx.getImageData( 0, 0, width, height )
                const vFrame = new VideoFrame( this._canvas, { timestamp: Date.now()} )
                this.emit( 'vFrame', vFrame )
            }
            this._reqId = requestAnimationFrame( loop )
        }
        loop()
        // this._worker.postMessage({
        //     type: 'start',
        //     payload: stream
        // }, [ stream ])
    }

    stop() {
        if( this._reqId ) {
            cancelAnimationFrame( this._reqId )
            this._reqId = null
        }

        // this._worker.postMessage({
        //     type: 'stop'
        // })
    }

    _addListeners = () => {
        //this._worker.addEventListener('message', ({ data }:{data:any}) => {
        //    switch( data.type ) {
        //    case 'vFrame':
        //        console.log( data )
        //        this.emit('vFrame', data.payload )
        //        break
        //    case 'error': 
        //        console.error(data.payload)
        //        this.emit('error', data.payload )
        //        break
        //    default:
        //        this.emit('unknown', data )
        //        break
        //    }
        //})
    }
}
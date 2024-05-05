import EventEmitter from "events"

declare var VideoFrame:any

export default class VideoCapture extends EventEmitter {
    _reqId: number|null
    _canvas: HTMLCanvasElement
    _ctx:CanvasRenderingContext2D|null

    constructor() {
        super()
        this._reqId = null

        this._canvas = document.createElement('canvas')
        this._ctx = this._canvas.getContext('2d')
    }

    start( videoEl:HTMLVideoElement  ) {
        const width = videoEl.videoWidth
        const height = videoEl.videoHeight

        this._canvas.width = width
        this._canvas.height = height

        const loop = () => {
            if( this._ctx ) {
                this._ctx.drawImage( videoEl, width, height )
                const vFrame = new VideoFrame( this._canvas, { timestamp: Date.now()} )
                this.emit( 'vFrame', { vFrame, clkms: Date.now() } )
            }
            this._reqId = requestAnimationFrame( loop )
        }
        loop()
    }

    stop() {
        if( this._reqId ) {
            cancelAnimationFrame( this._reqId )
            this._reqId = null
        }
    }
}
import EventEmitter from "events"

declare var VideoFrame:any

export default class VideoCapture extends EventEmitter {
    _reqId: number|null
    _canvas: HTMLCanvasElement
    _ctx:CanvasRenderingContext2D|null
    _counter: number

    constructor() {
        super()
        this._reqId = null

        this._counter = 0

        this._canvas = document.createElement('canvas')
        this._ctx = this._canvas.getContext('2d')
    }

    start( videoEl:HTMLVideoElement  ) {
        const width = videoEl.videoWidth
        const height = videoEl.videoHeight

        this._canvas.width  = width // Math.floor( width  / 2 )
        this._canvas.height = height // Math.floor( height / 2 )

        const cropW = width // Math.floor( width / 2 )
        const cropH = height // Math.floor( height / 2 )

        const loop = () => {
            if( this._ctx ) {
                if( this._counter++ % 2 === 0 ) {
                    //this._ctx.drawImage( videoEl, 0, cropH, cropW, cropH, 0, 0, cropW, cropH )
                    this._ctx.drawImage( videoEl, 0, 0, cropW, cropH, 0, 0, cropW, cropH )
                    //this._ctx.drawImage( videoEl, 0, 0, width, height )
                    const vFrame = new VideoFrame( this._canvas, { timestamp: Date.now()} )
                    this.emit( 'vFrame', { vFrame, clkms: Date.now() } )
                }
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
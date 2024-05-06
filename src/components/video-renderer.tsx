import { useRef, forwardRef, useImperativeHandle, useEffect } from 'react'

const VideoRenderer = forwardRef( function ( _, ref ) {
    const _canvas = useRef<HTMLCanvasElement>(null)
    const _ctx = useRef<CanvasRenderingContext2D>(null)

    useImperativeHandle( ref, () => ({
        // @ts-ignore
        drawFrame( frameData:VideoFrame ) {
            if( _canvas.current && _ctx.current ) {
                const width = frameData.codedWidth, height = frameData.codedHeight

                _canvas.current.width = width
                _canvas.current.height = height
                _ctx.current.drawImage( frameData, 0, 0, width, height )
                frameData.close()
            }
        }
    }))

    useEffect(() => {
        if( !_canvas.current ) return

        // @ts-ignore
        _ctx.current = _canvas.current.getContext('2d')
    }, [])

    return (
        <div className="VideoRenderer">
            <canvas ref={_canvas}></canvas>
        </div>
    )
})

export default VideoRenderer
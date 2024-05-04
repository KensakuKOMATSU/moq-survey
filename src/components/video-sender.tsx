import { useCallback, useEffect, useRef, useState } from 'react'
import Moqt from '../libs/moqt'
import randomstring from 'randomstring'

import { MoqtTracks } from '../types/moqt'
import VideoCapture from '../libs/video-caputure'

import './video-sender.css'

// declare var MediaStreamTrackProcessor:any

const moqTracks: MoqtTracks = {
    video: {
        id: 0,
        namespace: "vc",
        name: "",
        packagerType: 'loc',
        maxInFlightRequests: 50,
        isHipri: false,
        authInfo: "secret"
    }
}

interface Props {
    endpoint:String,
    trackName:String,
    setTrackName:Function
}

type Resolution = {
    width: number,
    height: number
}

export default function VideoSender(props:Props) {
    const { endpoint, trackName, setTrackName } = props
    const [ _connected, setConnected ] = useState<boolean>( false )
    const [ _captureStarted, setCaptureStarted ] = useState<boolean>(false)
    const [ _resolution, setResolution ] = useState<Resolution>({ width: 0, height: 0 })
    const [ _errMessage, setErrorMessage ] = useState<string>('')


    const _moqt = useRef<Moqt>()
    const _videoCapture = useRef<VideoCapture>()
    const _videoWrapperEl = useRef<HTMLDivElement>(null)
    const _videoStream = useRef<MediaStream>()
    // const _videoProcessor = useRef()

    useEffect(() => {
        return function() {
            if( _moqt.current ) {
                _moqt.current.disconnect()
                _moqt.current.destroy()
                _moqt.current = undefined
            }
        }
    }, [])

    const _connect = useCallback( (moqTracks:MoqtTracks) => {
        if(_moqt.current) return

        setErrorMessage('')

        _moqt.current = new Moqt()
        _moqt.current.connect({ endpoint })
            .then( async mesg => {
                // to avoid LINT error.
                if( !_moqt.current ) return

                const name = `${randomstring.generate(8)}/video`
                moqTracks.video.name = name
                // setTrackName( trackName )
                setTrackName( name )

                const ret = await _moqt.current.createPublisher( moqTracks )
                console.log( 'createPublisher response:%o', ret )
                setConnected( true )
            })
            .catch( (err:Error) => {
                setErrorMessage( err.message )
                setConnected( false )
            })

        _moqt.current.addListener('error', (mesg:string) => {
            setErrorMessage( mesg )
        })

        _moqt.current.addListener('closed', () => {
            setConnected( false )
            if( _moqt.current ) {
                _moqt.current.destroy()
                _moqt.current = undefined
            }
        })
    }, [ endpoint, setTrackName ])

    // const _send = useCallback( () => {
    //     // if( _moqt.current && !!_sendData ) {
    //         // _moqt.current.send({
    //         //     type: "data",
    //         //     chunk: _sendData,
    //         //     seqId: _seqId.current
    //         // })
    //         _seqId.current++
    //     //}
    // }, [])

    const _disconnect = useCallback( async () => {
        if( _moqt.current ) {
            await _moqt.current.disconnect()
                .catch( err => setErrorMessage( err.message ))
            if( _moqt.current ) {
                _moqt.current.destroy()
                _moqt.current = undefined
            }
        }
        setConnected( false )
    }, [])

    const _startCapture = useCallback( async () => {
        if( !_moqt.current ) return
        if( _videoStream.current ) return

        const videoConstraints = { width: { ideal: 640 }, height: { ideal: 360 }}
        const stream:MediaStream = await navigator.mediaDevices.getUserMedia({video:videoConstraints, audio: false})
        const videoEl:HTMLVideoElement = document.createElement('video')
        videoEl.srcObject = stream
        _videoStream.current = stream

        videoEl.onloadedmetadata = async () => {
            await videoEl.play()
            if( _videoWrapperEl.current ) {
                _videoWrapperEl.current.appendChild( videoEl )
                setResolution({ width: videoEl.videoWidth, height: videoEl.videoHeight })
            }
            setCaptureStarted( true )

            // const vTrack = stream.getVideoTracks()[0]
            // console.log( vTrack )
            // const videoProcessor = new MediaStreamTrackProcessor({ track: vTrack })

            // // @ts-ignore
            // const vFrameStream = videoProcessor.readable

            _videoCapture.current = new VideoCapture()

            _videoCapture.current.start( videoEl ) // vFrameStream )

            _videoCapture.current.addListener('vFrame', vFrame => {
                console.log( vFrame )
                vFrame.close()
            })
            _videoCapture.current.addListener('error', (mesg:string) => console.error( mesg ))
        }
    }, [])

    const _stopCapture = useCallback( async () => {
        if( !_moqt.current ) return
        if( !_videoWrapperEl.current || !_videoStream.current ) return
        
        // stop capture
        if( _videoCapture.current ) _videoCapture.current.stop()

        // stop video stream
        for( const t of _videoStream.current.getTracks() ) {
            t.stop()
        }
        _videoStream.current = undefined

        // remove all children
        let child = _videoWrapperEl.current.lastElementChild

        while( child ) {
            _videoWrapperEl.current.removeChild(child)
            child = _videoWrapperEl.current.lastElementChild
        }

        setCaptureStarted( false )
    }, [])

    return (
        <div className="VideoSender">
            <h3>Video Sender</h3>
            <div>
                state: {_connected ? 'connected' : 'disconnected'}
            </div>
            <div>
                <button onClick={() => {
                    if( _connected ) {
                        _disconnect()
                    } else {
                        _connect( moqTracks )
                    }
                }}>{_connected ? 'disconnect' : 'connect' }</button>
                { _connected && (
                    <div>
                        <button onClick={() => {
                            if( !_captureStarted ) {
                                _startCapture()
                            } else {
                                _stopCapture()
                            }
                        }}>{ !_captureStarted ? 'start' : 'stop' }</button><br />
                        width: {_resolution.width}, height: {_resolution.height}<br/>
                        track name: {trackName}
                    </div>
                ) }
            </div>
            <div className='video-wrapper' ref={_videoWrapperEl}>
            </div>
            <div>
                {!!_errMessage ? `Error::${_errMessage}` : '' }
            </div>
        </div>
    )
}
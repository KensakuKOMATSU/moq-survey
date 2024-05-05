import { useCallback, useEffect, useRef, useState } from 'react'
import Moqt from '../libs/moqt'
import randomstring from 'randomstring'

import VideoCapture from '../libs/video-capture'
import VEncoder from '../libs/video-encoder'

import { TimeBufferChecker } from '../libs/utils/time_buffer_checker'

import { MoqtTracks } from '../types/moqt'
import './video-sender.css'

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
    const _vEncoder = useRef<VEncoder>()
    const _videoWrapperEl = useRef<HTMLDivElement>(null)
    const _videoStream = useRef<MediaStream>()
    const _vTimeBufferChecker = useRef<TimeBufferChecker>()

    const _currentAudioTs = useRef<number>()
    const _currentVideoTs = useRef<number>()
    const _audioOffsetTs = useRef<number>()
    const _videoOffsetTs = useRef<number>()

    const _videoEncoderConfig = useRef({
        encoderConfig: {
            codec: 'avc1.42001e', // Baseline = 66, level 30 (see: https://en.wikipedia.org/wiki/Advanced_Video_Coding)
            width: 320,
            height: 180,
            bitrate: 1_000_000, // 1 Mbps
            framerate: 30,
            latencyMode: 'realtime', // Sends 1 chunk per frame
        },
        encoderMaxQueueSize: 2,
        keyframeEvery: 60,
    });


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

                const name = `${randomstring.generate(8)}-video`
                moqTracks.video.name = name
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

    const _send = useCallback( ( obj:{ type:string, firstFrameClkms?:number, compensatedTs?:number, estimatedDuration?:number, seqId:number, metadata?:object, chunk:any } ) => {
        if( _moqt.current ) {
            _moqt.current.send( obj )
        }
    }, [])

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

            _videoCapture.current = new VideoCapture()
            _vEncoder.current = new VEncoder()
            _vTimeBufferChecker.current = new TimeBufferChecker("video")

            _videoEncoderConfig.current.encoderConfig.width = videoEl.videoWidth
            _videoEncoderConfig.current.encoderConfig.height = videoEl.videoHeight

            _vEncoder.current.init( _videoEncoderConfig.current )

            _videoCapture.current.start( videoEl )

            _videoCapture.current.addListener('vFrame', ({ vFrame, clkms }) => {
                let estimatedDuration = -1
                if( _currentVideoTs.current === undefined ) {
                    if( _audioOffsetTs.current === undefined || _currentAudioTs.current === undefined ) {
                        _videoOffsetTs.current = -vFrame.timestamp
                    } else {
                        _videoOffsetTs.current = -vFrame.timestamp + _currentAudioTs.current + _audioOffsetTs.current
                    }
                } else {
                    estimatedDuration = vFrame.timestamp - _currentVideoTs.current
                }
                _currentVideoTs.current = vFrame.timestamp

                if( _vTimeBufferChecker.current && _vEncoder.current && _currentVideoTs.current && _videoOffsetTs.current ) {
                    _vTimeBufferChecker.current.AddItem({ 
                        ts: _currentVideoTs.current, 
                        compensatedTs: _currentVideoTs.current + _videoOffsetTs.current,
                        estimatedDuration,
                        clkms: clkms
                    })
                    _vEncoder.current.encode( vFrame )
                }
            })

            _videoCapture.current.addListener('error', (mesg:string) => console.error( mesg ))

            _vEncoder.current.addListener('vchunk', ( { seqId, metadata, chunk }:{ seqId: number, metadata:any, chunk:object }) => {
                //@ts-ignore
                const itemTsClk = _vTimeBufferChecker.current?.GetItemByTs( chunk.timestamp )

                const obj = {
                    type: "video",
                    firstFrameClkms: itemTsClk?.clkms,
                    compensatedTs: itemTsClk?.compensatedTs,
                    estimatedDuration: itemTsClk?.estimatedDuration,
                    seqId,
                    chunk,
                    metadata
                }
                _send(obj)
            })
        }
    }, [ _send ])

    const _stopCapture = useCallback( async () => {
        if( !_moqt.current ) return
        if( !_videoWrapperEl.current || !_videoStream.current ) return

        _audioOffsetTs.current = undefined
        _currentAudioTs.current = undefined
        _videoOffsetTs.current = undefined
        _currentVideoTs.current = undefined
        
        // stop encoder
        if( _vEncoder.current ) {
            _vEncoder.current.stop()
            _vEncoder.current.destroy()
            _vEncoder.current = undefined
        }

        // stop TimeBufferChecker
        if( _vTimeBufferChecker.current ) {
            _vTimeBufferChecker.current.Clear()
            _vTimeBufferChecker.current = undefined
        }

        // stop capture
        if( _videoCapture.current ) {
            _videoCapture.current.stop()
            _videoCapture.current = undefined
        }

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
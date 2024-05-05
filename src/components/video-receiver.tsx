import { useCallback, useEffect, useRef, useState } from 'react'
import Moqt from '../libs/moqt'
import VDecoder from '../libs/video-decoder'

import { MoqtTracks, MessageData } from '../types/moqt'

import './video-receiver.css'

interface Props  {
    endpoint:String,
    trackName:String
}

const moqTracks: MoqtTracks = {
    video: {
        id: 0,
        namespace: "vc",
        name: "",
        packagerType: 'loc',
        // maxInFlightRequests: 5,
        // isHipri: false,
        authInfo: "secret"
    }
}

export default function VideoReceiver(props:Props) {
    const { endpoint, trackName } = props
    const [ _connected, setConnected ] = useState<boolean>( false )
    const [ _errMessage, setErrorMessage ] = useState<string>('')

    const [ _recvDatas, setRecvDatas ] = useState<Array<string>>([])

    const _moqt = useRef<Moqt>()
    const _vDecoder = useRef<VDecoder>()

    const _canvasEl = useRef<HTMLCanvasElement>(null)
    const _ctx = useRef<CanvasRenderingContext2D>(null)

    useEffect(() => {
        if( _canvasEl.current ) {
            // @ts-ignore
            _ctx.current = _canvasEl.current.getContext('2d')
        }
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
            .then( async () => {
                // to avoid LINT error.
                if( !_moqt.current ) return

                // @ts-ignore
                moqTracks.video.name = trackName

                const ret = await _moqt.current.createSubscriber( moqTracks )
                console.log('succeeded to create subscriber:%o', ret)

                _vDecoder.current = new VDecoder()

                _vDecoder.current.addListener( 'vFrame', ( data:object ) => {
                    //@ts-ignore
                    const { frameData } = data
                    if( _canvasEl.current && _ctx.current ) {
                        _canvasEl.current.width = frameData.displayWidth
                        _canvasEl.current.height = frameData.displayHeight
                        _ctx.current.drawImage(frameData, 0, 0, frameData.codedWidth, frameData.codedHeight)
                        frameData.close()
                    }
                })

                _vDecoder.current.addListener( 'error', ( mesg:string ) => {
                    setErrorMessage( mesg )
                })

                setConnected( true )
            })
            .catch( (err:Error) => {
                setErrorMessage( err.message )
                setConnected( false )
            })

        _moqt.current.addListener('data', ( mesg:MessageData ) => {
            if( mesg.type === 'videochunk' || mesg.type === 'audiochunk' ) {
                const ts = new Date().toLocaleString()
                if( mesg.metadata ) {
                    // @ts-ignore
                    if( mesg.metadata.metadata ) {
                    // @ts-ignore
                        const text = `seqId:${mesg.metadata.seqId} len of metadata:${mesg.metadata.metadata.byteLength}`
                        setRecvDatas( datas => (
                            [ `${ts} - ${text}`, ...datas.slice( 0, 4 ) ]
                        ))
                    }
                }
                _vDecoder.current?.decode( mesg )
            } 
        })

        _moqt.current.addListener('latencyMs', ( mesg:MessageData ) => {
            /* noop */
        })

        _moqt.current.addListener('error', ( mesg:string ) => {
            setErrorMessage( mesg )
        })

        _moqt.current.addListener('closed', () => {
            setConnected( false )
            if( _moqt.current ) {
                _moqt.current.destroy()
                _moqt.current = undefined
            }
        })
    }, [ endpoint, trackName ])

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

    return (
        <div className="VideoReceiver">
            <h3>Video Receiver</h3>
            <div>
                state: {_connected ? 'connected' : 'disconnected'}
            </div>
            <div>
                trackName: {trackName}<br/>
                <button onClick={() => {
                    if( _connected ) {
                        _disconnect()
                    } else {
                        _connect( moqTracks )
                    }
                }}>{_connected ? 'disconnect' : 'connect' }</button>
            </div>
            <div>
                {_connected && (
                    <div>
                        <div className='recv-messages'>
                        <h4>Received messages</h4>
                            <ul>
                            { _recvDatas.map( ( mesg, idx ) => (
                                <li key={idx}>{mesg}</li>
                            ))}
                            </ul>
                        </div>
                    </div>
                )}<br />
                <div className='video-wrapper'>
                    <canvas ref={_canvasEl}></canvas>
                </div>
            </div>
            <div>
                {!!_errMessage ? `Error::${_errMessage}` : '' }
            </div>
        </div>
    )
}
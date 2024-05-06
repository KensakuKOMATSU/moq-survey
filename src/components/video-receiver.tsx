import { useCallback, useEffect, useRef, useState } from 'react'
import Moqt from '../libs/moqt'
import VDecoder from '../libs/video-decoder'
import VideoRenderer from './video-renderer'
import JitterBuffer from '../libs/jitter-buffer'

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
    const [ _minJitterBufferMs, setMinJitterBufferMs ] = useState<number>( -1 )
    const [ _errMessage, setErrorMessage ] = useState<string>('')

    const [ _recvDatas, setRecvDatas ] = useState<Array<string>>([])

    const _moqt = useRef<Moqt>()
    const _vDecoder = useRef<VDecoder>()
    const _renderer = useRef<typeof VideoRenderer>(null)
    const _jitterBuffer = useRef<JitterBuffer>()
    const _reqId = useRef<number>()

    useEffect(() => {
        _jitterBuffer.current = new JitterBuffer()
        setMinJitterBufferMs( _jitterBuffer.current.minJitterBufferMs )

        _vDecoder.current = new VDecoder()

        return function() {
            if( _moqt.current ) {
                _moqt.current.disconnect()
                _moqt.current.destroy()
                _moqt.current = undefined
            }
        }
    }, [])

    useEffect(() => {
        if( !_jitterBuffer.current ) return

        _jitterBuffer.current.minJitterBufferMs = _minJitterBufferMs
    }, [ _minJitterBufferMs ])

    const _connect = useCallback( (moqTracks:MoqtTracks) => {
        if(_moqt.current || !_jitterBuffer.current || !_vDecoder.current ) return

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

                // to avoid LINT error.
                if( _vDecoder.current ) {
                    _vDecoder.current.addListener( 'vFrame', ( data:{frameData:any} ) => {
                        const { frameData } = data
                        //@ts-ignore
                        _renderer.current.drawFrame( frameData )
                    })

                    _vDecoder.current.addListener( 'error', ( mesg:string ) => {
                        setErrorMessage( mesg )
                    })
                }

                const startDecoding = () => {
                    if( _jitterBuffer.current && _vDecoder.current ) {
                        const data = _jitterBuffer.current.getItem()
                        if( data ) {
                            _vDecoder.current.decode( data )
                        }
                    }
                    _reqId.current = requestAnimationFrame( startDecoding )
                }

                _reqId.current = requestAnimationFrame( startDecoding )

                setConnected( true )
            })
            .catch( (err:Error) => {
                setErrorMessage( err.message )
                setConnected( false )
            })

        _moqt.current.addListener('data', ( data:MessageData ) => {
            if( data.type === 'videochunk' || data.type === 'audiochunk' ) {
                const ts = new Date().toLocaleString()
                if( data.metadata ) {
                    // @ts-ignore
                    if( data.metadata.metadata ) {
                    // @ts-ignore
                        const text = `seqId:${data.metadata.seqId} len of metadata:${data.metadata.metadata.byteLength}`
                        setRecvDatas( datas => (
                            [ `${ts} - ${text}`, ...datas.slice( 0, 4 ) ]
                        ))
                    }
                }
                // @ts-ignore
                if( _jitterBuffer.current ) _jitterBuffer.current.addItem( data )
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
        if( _reqId.current ) {
            cancelAnimationFrame( _reqId.current )
            _reqId.current = undefined
        }
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
                { _minJitterBufferMs >= 0 && (
                    <div>
                        minJitterBufferMs: 
                        <input 
                            type="number" 
                            min={0}
                            max={750}
                            value={_minJitterBufferMs} 
                            onChange={e => setMinJitterBufferMs( Number(e.target.value))} 
                        />
                    </div>
                )}
                <button onClick={() => {
                    if( _connected ) {
                        _disconnect()
                    } else {
                        _connect( moqTracks )
                    }
                }}>{_connected ? 'disconnect' : 'connect' }</button>
            </div>
            { _connected && (
            <div>
                <div className='video-wrapper'>
                    <VideoRenderer ref={_renderer} />
                </div>
                <hr/>
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
            </div>
            )}
            <div>
                {!!_errMessage ? `Error::${_errMessage}` : '' }
            </div>
        </div>
    )
}
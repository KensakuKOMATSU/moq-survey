import { useCallback, useEffect, useRef, useState } from 'react'
import Moqt from '../../libs/moqt'

import { MoqtTracks, MessageData } from '../../types/moqt'

type Props = {
    endpoint:String
}

const moqTracks: MoqtTracks = {
    data: {
        id: -1, // will be set after SUBSCRIBE procedure
        namespace: "simplechat",
        name: "foo",
        packagerType: 'raw',
        maxInFlightRequests: 5,
        isHipri: false,
        authInfo: "secret"
    }
}

export default function Receiver(props:Props) {
    const { endpoint } = props
    const [ _connected, setConnected ] = useState<boolean>( false )
    const [ _errMessage, setErrorMessage ] = useState<string>('')

    const [ _recvDatas, setRecvDatas ] = useState<Array<string>>([])

    const _moqt = useRef<Moqt>()

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
            .then( async () => {
                // to avoid LINT error.
                if( !_moqt.current ) return

                const ret = await _moqt.current.createSubscriber( moqTracks )
                console.log('succeeded to create subscriber:%o', ret)
                setConnected( true )
            })
            .catch( (err:Error) => {
                setErrorMessage( err.message )
                setConnected( false )
            })

        _moqt.current.addListener('data', ( mesg:MessageData ) => {
            if( mesg.type === 'data' ) {
                const ts = new Date().toLocaleString()
                setRecvDatas( datas => (
                    [ `${ts} - ${mesg.payload}`, ...datas ]
                ))
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
    }, [ endpoint ])

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
        <div className="Receiver">
            <h1>Receiver</h1>
            <p>
                state: {_connected ? 'connected' : 'disconnected'}
            </p>
            <p>
                <button onClick={() => {
                    if( _connected ) {
                        _disconnect()
                    } else {
                        _connect( moqTracks )
                    }
                }}>{_connected ? 'disconnect' : 'connect' }</button>
            </p>
            <div>
                {_connected && (
                    <div>
                        <div className='recv-messages'>
                        <h2>Received messages</h2>
                            <ul>
                            { _recvDatas.map( ( mesg, idx ) => (
                                <li key={idx}>{mesg}</li>
                            ))}
                            </ul>
                        </div>
                    </div>
                )}
            </div>
            <p>
                {!!_errMessage ? `Error::${_errMessage}` : '' }
            </p>
        </div>
    )
}
import { useCallback, useEffect, useRef, useState } from 'react'
import Moqt from '../libs/moqt'
import { MoqtTracks } from '../types/moqt'

const moqTracks: MoqtTracks = {
    data: {
        id: 0,
        namespace: "simplechat",
        name: "foo",
        packagerType: 'raw',
        maxInFlightRequests: 5,
        isHipri: false,
        authInfo: "secret"
    }
}

type Props = {
    endpoint:String
}

export default function Sender(props:Props) {
    const { endpoint } = props
    const [ _connected, setConnected ] = useState( false )
    const [ _errMessage, setErrorMessage ] = useState('')

    const [ _sendData, setSendData ] = useState('hi')
    const _seqId = useRef(0)

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
            .then( async mesg => {
                // to avoid LINT error.
                if( !_moqt.current ) return

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
    }, [ endpoint ])

    const _send = useCallback( () => {
        if( _moqt.current && !!_sendData ) {
            _moqt.current.send({
                type: "data",
                chunk: _sendData,
                seqId: _seqId.current
            })
            _seqId.current++
        }
    }, [ _sendData ])

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
        <div className="Sender">
            <h3>Sender</h3>
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
            </div>
            <div>
                {_connected && (
                    <div>
                        <input type="text" value={_sendData} onChange={ e => setSendData(e.target.value)} />
                        <button onClick={_send} disabled={!_sendData}>send</button>
                    </div>
                )}
            </div>
            <div>
                {!!_errMessage ? `Error::${_errMessage}` : '' }
            </div>
        </div>
    )
}
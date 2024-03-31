import { useCallback, useEffect, useRef, useState } from 'react'
import Moqt from '../../libs/moqt'

type Props = {
    endpoint:String
}

export default function Sender(props:Props) {
    const { endpoint } = props
    const [ _connected, setConnected ] = useState( false )
    const [ _errMessage, setErrorMessage ] = useState('')

    const _moqt = useRef<Moqt>()

    useEffect(() => {
        return function() {
            if( _moqt.current ) {
                _moqt.current.disconnect()
            }
        }
    }, [])

    const _connect = useCallback(() => {
        if(_moqt.current) return

        _moqt.current = new Moqt()
        _moqt.current.connect({ endpoint })
            .then( mesg => {
                setConnected( true )
            })
            .catch( (err:Error) => {
                setErrorMessage( err.message )
                setConnected( false )
            })

        _moqt.current.addListener('closed', () => {
            setConnected( false )
            _moqt.current = undefined
        })
    }, [ endpoint ])

    const _disconnect = useCallback( async () => {
        if( _moqt.current ) {
            await _moqt.current.disconnect()
            _moqt.current = undefined
        }
        setConnected( false )
    }, [])

    return (
        <div className="Sender">
            <h1>Sender</h1>
            <p>
                state: {_connected ? 'connected' : 'disconnected'}
            </p>
            <p>
                <button onClick={() => {
                    if( _connected ) {
                        _disconnect()
                    } else {
                        _connect()
                    }
                }}>{_connected ? 'disconnect' : 'connect' }</button>
            </p>
            <p>
                {_errMessage}
            </p>
        </div>
    )
}
import { StateEnum } from "./utils"

import { 
    Role, 
    sendSetupRequest,
    recvSetupResponse,
    sendAnnounceRequest,
    recvAnnounceResponse,
    recvSubscribe,
    sendSubscribeResponse,
} from "../../utils/messages"

declare var WebTransport: any

type Data = {
    type:String,
    meta?:any
    payload?:any
}

type MoqtContext = {
    endpoint: string,
    wt: any,
    controlStream: any,
    controlWriter: any,
    controlReader: any,
    tracks: object,
    inFlightRequests: object,
    workerState: StateEnum
}

const _moqt:MoqtContext = {
    endpoint: '',
    wt: null,
    controlStream: null,
    controlWriter: null,
    controlReader: null,
    tracks: {},
    inFlightRequests: {},
    workerState: StateEnum.Created
}

const postResponseMessage = ( kind:String, payload: any) => {
    postMessage({
        type: 'response',
        meta: {
            kind
        },
        payload
    })
}

const postCloseMessage = () => {
    postMessage({
        type: 'closed'
    })
}

const postErrorMessage = ( kind:String, message: any) => {
    postMessage({
        type: 'error',
        meta: {
            kind,
        },
        payload: message
    })
}



/* eslint-disable-next-line no-restricted-globals */
self.addEventListener( 'message', async ({ data }:{data:Data}) => {
    if( _moqt.workerState === StateEnum.Created ) {
        _moqt.workerState = StateEnum.Instantiated
    }

    if( _moqt.workerState === StateEnum.Stopped ) {
        console.log(`Moqt is stopped. This does not accept any messages`)
    }

    switch( data.type ) {
        case 'ping': {
            postMessage('pong: `' + data.payload + '`')
            break
        }
        case 'connect': {
            const { endpoint } = data.payload

            if( !endpoint ) {
                postErrorMessage( data.type, 'endpoint MUST be specified')
                break
            }

            _moqt.endpoint = endpoint

            const url = new URL( _moqt.endpoint )
            url.protocol = 'https'

            _moqt.wt = new WebTransport(url.href)

            _moqt.wt.closed
                .then( postCloseMessage )
                .catch( (err:Error) => postErrorMessage('close', err.message))

            await _moqt.wt.ready
            _moqt.controlStream = await _moqt.wt.createBidirectionalStream()
            _moqt.controlWriter = _moqt.controlStream.writable
            _moqt.controlReader = _moqt.controlStream.readable

            postResponseMessage( data.type, endpoint )

            break
        }
        case 'createPublisher': {
            try {
                const { tracks } = data.payload

                if( !(tracks && typeof tracks === 'object' && typeof tracks.data === 'object' )) {
                    postErrorMessage( data.type, 'tracks MUST be specified as Object')
                    break
                }

                _moqt.tracks = { ..._moqt.tracks, ...tracks }

                // SETUP
                await sendSetupRequest( _moqt.controlWriter, Role.ROLE_CLIENT_SEND )
                const resp = await recvSetupResponse( _moqt.controlReader )

                // ANNOUNCE
                console.log('createPublisher: tracks:%o', _moqt.tracks )

                const announcedNamespaces:Array<string> = []
                for( const trackData of Object.values( _moqt.tracks )) {
                    if( !announcedNamespaces.includes( trackData.namespace )) {
                        await sendAnnounceRequest( _moqt.controlWriter, trackData.namespace, trackData.authInfo )
                        const announceResp = await recvAnnounceResponse( _moqt.controlReader )
                        if( trackData.namespace !== announceResp.namespace ) {
                            throw new Error(`Expecting namespace ${trackData.namespace}, but got ${JSON.stringify(announceResp)}`)
                        }
                        announcedNamespaces.push(trackData.namespace)
                    }
                }

                _moqt.inFlightRequests = _initInFlightReqData()

                _moqt.workerState = StateEnum.Running

                _startSubscriptionLoop( _moqt.controlReader, _moqt.controlWriter )
                    .then( _ => {
                        console.log('Exited receiving subscription message in control stream')
                    })
                    .catch( (err:Error) => {
                        if( _moqt.workerState !== StateEnum.Stopped ) {
                            console.error(`Error in receiving subscription message in control stream. Error: ${JSON.stringify( err )}`)
                        } else {
                            console.log(`Exited receiving subscription message in control stream. Err: ${JSON.stringify(err)}`)
                        }
                    })


                postResponseMessage( data.type, resp)
            } catch( err ) {
                console.error(`Error detected while createProducer. Err: ${JSON.stringify(err)}`)
            }
            break
        }
        case 'disconnect': {
            try {
                if( _moqt.controlWriter ) {
                    await _moqt.controlWriter.close()
                }
                if( _moqt.wt ) {
                    await _moqt.wt.close()
                }
            } catch( err:any ) {
                postErrorMessage('disconnect', err?.message )
            } finally {
                _moqt.wt = null
                postCloseMessage()
            }
            break
        }
        default: 
            // noop
    }
})


//////////////////////////////////////////////////////////
// private
//
//////////////////////////////////////////////////////////

async function _startSubscriptionLoop( readerStream:ReadableStream, writerStream:WritableStream ) {
    while ( _moqt.workerState === StateEnum.Running ) {
        // TODO: set correct type
        const subscribe:any = await recvSubscribe( readerStream )

        const track = _getTrack( subscribe.namespace, subscribe.trackName )
        if( track === null ) {
            console.warn(`Unknown subscribe received ${subscribe.namespace}/${subscribe.trackName}`)
        } else {
            if( track.authInfo !== subscribe.parameters?.authInfo ) {
                console.warn(`Invalid authInfo ${subscribe.parameters?.authInfo} received for ${subscribe.namespace}/${subscribe.trackName}`)
            } else {
                if( 'numSubscribers' in track ) {
                    track.numSubscribers++
                } else {
                    track.numSubscribers = 1
                }
                console.log(`New subscriber for track ${subscribe.namespace}/${subscribe.trackName}. Current num of subscribers: ${track.numSubscribers}`)
                await sendSubscribeResponse( writerStream, subscribe.namespace, subscribe.trackName, track.id, 0 )
            }
        }
    }
}

// Helper

function _initInFlightReqData() {
    const ret:any = {}
    for( const type of Object.keys(_moqt.tracks) ) {
        ret[type] = {}
    }
    return ret
}

function _getTrack( namespace:string, trackName:string ) {
    for( const data of Object.values( _moqt.tracks )) {
        if( data.namespace === namespace && data.name === trackName ) {
            return data
        }
    }
    // when pair of namespace and trackName is not found
    return null
}



export {}
import { StateEnum } from "./utils"

import { 
    Role, 
    sendSetupRequest,
    recvSetupResponse,
    sendAnnounceRequest,
    recvAnnounceResponse,
    sendSubscribe,
    recvSubscribe,
    sendSubscribeResponse,
    recvSubscribeResponse
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
    tracks: object
}

const _moqt:MoqtContext = {
    endpoint: '',
    wt: null,
    controlStream: null,
    controlWriter: null,
    controlReader: null,
    tracks: {}
}

let workerState:StateEnum = StateEnum.Created
let inFlightRequests = {}

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
    switch( data.type ) {
        case 'ping': 
            postMessage('pong: `' + data.payload + '`')
            break
        case 'connect': 
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
        case 'createPublisher':
            const { tracks } = data.payload

            console.log( tracks )

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

            /**
             * todo:
             * for( const track of tracks ) {
             *  await sendAnnounceRequest( _moqt.controlWriter, ...)
             *  await recvAnnounceResponse( _moqt.controlReader )
             * }
             */

            postResponseMessage( data.type, resp)

            break
        case 'disconnect':
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
        default: 
            // noop
    }
})

async function _startSubscriptionLoop( readerStream:ReadableStream, writerStream:WritableStream ) {
    while ( workerState === StateEnum.Running ) {
        const subscribe = await recvSubscribe(readerStream)
    }
}

function _initInflightReqData() {
    const ret:any = {}
    for( const type of Object.keys(_moqt.tracks) ) {
        ret[type] = {}
    }
    return ret
}


export {}
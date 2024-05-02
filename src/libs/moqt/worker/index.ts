import { StateEnum } from "./utils"

import { 
    Role, 
    sendSetupRequest,
    recvSetupResponse,
    sendAnnounceRequest,
    recvAnnounceResponse,
    recvSubscribe,
    sendSubscribeResponse,
    sendObject
} from "../../utils/messages"

import { RawPackager } from "../../packager/raw_packager"
import { LocPackager } from "../../packager/loc_packager"

import { MoqtTracks } from "../../../types/moqt"

declare var WebTransport: any


interface InFlightRequests {
    [key:string]: object
}

interface PublisherState {
    [key:number]: PublisherStateObject
}

type PublisherStateObject = {
    currentGroupSeq: number,
    currentObjectSeq: number
}


type MessageData = {
    type:string,
    meta?:any
    payload?:any,
    firstFrameClkms?: number,
    compensatedTs?: number,
    estimatedDuration?: number,
    seqId?: number,
    metadata?: any,
    chunk?: any
}

type ChunkData = {
    mediaType: string,
    firstFrameClkms: number,
    compensatedTs: number,
    estimatedDuration: number,
    packagerType: string,
    seqId: number,
    chunk: any,
    metadata: any
}
type MoqtContext = {
    endpoint: string,
    wt: any,
    controlStream: any,
    controlWriter: any,
    controlReader: any,
    tracks: MoqtTracks,
    inFlightRequests: InFlightRequests,
    publisherState: PublisherState,
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
    publisherState: {},
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
self.addEventListener( 'message', async ({ data }:{data:MessageData}) => {
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


                postResponseMessage( data.type, resp )
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
            if( _moqt.workerState !== StateEnum.Running ) {
                console.warn("MOQT is not open yet.")
                break
            }
            if( !(data.type in _moqt.tracks) ) {
                postErrorMessage("warn", `unknown type "${data.type}" received. ignored.` )
                break
            }

            if( !( data.type && 'numSubscribers' in _moqt.tracks[data.type])) {
                postErrorMessage("info", "no subscriber found")
                // break
            }
            const firstFrameClkms = ( data.firstFrameClkms === undefined || data.firstFrameClkms < 0 ) ? 0 : data.firstFrameClkms
            const compensatedTs = ( data.compensatedTs === undefined || data.compensatedTs < 0 ) ? 0 : data.compensatedTs
            const estimatedDuration = ( data.estimatedDuration === undefined || data.estimatedDuration < 0 ) ? 0 : data.estimatedDuration
            const seqId = (data.seqId === undefined ) ? 0 : data.seqId
            const packagerType = _moqt.tracks[data.type].packagerType || 'raw'

            const chunkData:ChunkData = { mediaType: data.type, firstFrameClkms, compensatedTs, estimatedDuration, seqId, packagerType, chunk: data.chunk, metadata: data.metadata }
            _sendChunk( chunkData, _moqt.inFlightRequests[data.type], _moqt.tracks[data.type].maxInFlightRequests  )
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
                if( 'numSubscribers' in track && track.numSubscribers !== undefined ) {
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

async function _sendChunk( chunkData:ChunkData, inFlightRequest:object, maxInFlightRequests: number ) {
    if( chunkData === null ) {
        return { dropped: true, message: 'chunkData is null'}
    }
    if( Object.keys(inFlightRequest).length >= maxInFlightRequests ) {
        return { droppped: true, message: 'too many inflight requests' }
    }
    return _createRequest(chunkData)
}

async function _createRequest( chunkData:ChunkData ) {
    let packet = null

    if( chunkData.packagerType === 'loc' ) {
        packet = new LocPackager()
        const chunkDataBuffer = new Uint8Array( chunkData.chunk.byteLength )
        chunkData.chunk.copyTo( chunkDataBuffer )

        packet.SetData( 
            chunkData.mediaType, 
            chunkData.compensatedTs, 
            chunkData.estimatedDuration, 
            chunkData.chunk.type, 
            chunkData.seqId, 
            chunkData.firstFrameClkms,
            chunkData.metadata,
            chunkDataBuffer
        )
    } else if( chunkData.packagerType === 'raw') {
        packet = new RawPackager()
        packet.SetData( 
            chunkData.mediaType, 
            'key', 
            chunkData.seqId, 
            chunkData.chunk 
        )
    } else {
        return { dropped: true, message: `unknown packagerType: "${chunkData.packagerType}".` }
    }
    return _createSendPromise(packet)
}

async function _createSendPromise( packet:RawPackager|LocPackager) {
    if( _moqt.wt === null ) {
        throw new Error('transport is not open')
    }
    if(!( packet.GetData().mediaType in _moqt.tracks )) {
        throw new Error('mediaType is not found in tracck')
    }
    const trackId = _moqt.tracks[packet.GetData().mediaType].id

    if( !( trackId in _moqt.publisherState ) ) {
        if( packet.GetData().chunkType === 'delta' ) {
            return { dropped: true, message: "Dropped chunk because first object cannot be delta"}
        }
        _moqt.publisherState[trackId] = _createTrackState()
    }

    const sendOrder = _calculateSendOrder( packet )

    const uniStream = await _moqt.wt.createUnidirectionalStream({ options: { sendOrder } })
    const uniWriter = uniStream.getWriter()

    if( packet.GetData().chunkType !== 'delta' ) {
        _moqt.publisherState[trackId].currentGroupSeq++
        _moqt.publisherState[trackId].currentObjectSeq = 0
    }
    const groupSeq = _moqt.publisherState[trackId].currentGroupSeq
    const objSeq = _moqt.publisherState[trackId].currentObjectSeq

    // not wait until sendObject resolved.
    console.log( packet.data )
    console.log( packet.ToBytes())
    sendObject( uniWriter, trackId, groupSeq, objSeq, sendOrder, packet.ToBytes() )

    _moqt.publisherState[trackId].currentObjectSeq++

    const p = uniWriter.close()
    p.id = packet.GetData().pId

    _addToInflight( packet.GetData().mediaType, p )

    p.finally(() => {
        _removeFromInflight( packet.GetData().mediaType, packet.GetData().pId )
    })

    return p
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

function _createTrackState () {
    return {
        currentGroupSeq: 0,
        currentObjectSeq: 0
    }
}

function _calculateSendOrder (packet:RawPackager|LocPackager) {
    // Prioritize:
    // Audio over video
    // New over old

    let ret = packet.GetData().seqId
    if (ret < 0) {
        // Send now
        ret = Number.MAX_SAFE_INTEGER
    } else {
        if (_moqt.tracks[packet.GetData().mediaType].isHipri) {
            ret = Math.floor(ret + Number.MAX_SAFE_INTEGER / 2)
        }
    }
    return ret
}

function _addToInflight(mediaType:string, p:any) {
    if (p.id in _moqt.inFlightRequests[mediaType]) {
        postErrorMessage("error", "id already exists in inflight which should never happen")
    } else {
        // @ts-ignore
        _moqt.inFlightRequests[mediaType][p.id] = p
    }
}

function _removeFromInflight(mediaType:string, id:string) {
    if (id in _moqt.inFlightRequests[mediaType]) {
        // @ts-ignore
        delete _moqt.inFlightRequests[mediaType][id]
    }
}



export {}
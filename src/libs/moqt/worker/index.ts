import { StateEnum } from "../../utils/utils"

import { 
    sendSetupRequest,
    recvSetupResponse,
    sendAnnounceRequest,
    recvAnnounceResponse,
    sendSubscribeRequest,
    recvSubscribeResponse,
    recvSubscribeRequest,
    sendSubscribeResponse,
    recvObjectHeader,
    sendObject,
    ROLE_PARAMETER_PUBLISHER,
    ROLE_PARAMETER_SUBSCRIBER
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



const EXPIRATION_TIMEOUT_DEF_MS = 10000

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

                if( !(tracks && typeof tracks === 'object' )) {
                    postErrorMessage( data.type, 'tracks MUST be specified as Object')
                    break
                }

                _moqt.tracks = { ..._moqt.tracks, ...tracks }

                // SETUP
                await sendSetupRequest( _moqt.controlWriter, ROLE_PARAMETER_PUBLISHER )
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

                // TODO - move to close state when error occured
                _startSubscriptionLoop( _moqt.controlReader, _moqt.controlWriter )
                    .then( _ => {
                        console.log('Exited receiving subscription message in control stream')
                    })
                    .catch( (err:Error) => {
                        if( _moqt.workerState !== StateEnum.Stopped ) {
                            postErrorMessage("error", `Error in receiving subscription message in control stream. Error: ${JSON.stringify( err )}`)
                        } else {
                            postErrorMessage("error", `Exited receiving subscription message in control stream. Err: ${JSON.stringify(err)}`)
                        }
                    })


                postResponseMessage( data.type, resp )
            } catch( err ) {
                postErrorMessage("error", `Error detected while createProducer. Err: ${JSON.stringify(err)}`)
            }
            break
        }
        case 'createSubscriber': {
            try {
                const { tracks } = data.payload

                if( !(tracks && typeof tracks === 'object' )) {
                    postErrorMessage( data.type, 'tracks MUST be specified as Object')
                    break
                }

                _moqt.tracks = { ..._moqt.tracks, ...tracks }

                // SETUP
                await sendSetupRequest( _moqt.controlWriter, ROLE_PARAMETER_SUBSCRIBER )
                const resp = await recvSetupResponse( _moqt.controlReader )

                // SUBSCRIBE _moqt.tracks
                console.log('createSubscriber: tracks:%o', _moqt.tracks )

                for( const trackData of Object.values( _moqt.tracks )) {
                    // TODO - implement
                    await sendSubscribeRequest( _moqt.controlWriter, trackData.namespace, trackData.name, trackData.authInfo )

                    // TODO - implement
                    const subscribeResp = await recvSubscribeResponse( _moqt.controlReader )
                    if( trackData.namespace !== subscribeResp.namespace || trackData.name !== subscribeResp.trackName ) {
                        postErrorMessage("error", `SUBSCRIBE error - expecting ${trackData.namespace}/${trackData.name}, but got ${subscribeResp.namespace}/${subscribeResp.trackName}`)
                        return
                    }
                    trackData.id = subscribeResp.trackId
                }
                _moqt.workerState = StateEnum.Running

                // TODO - implement
                _startReceiveObjects( EXPIRATION_TIMEOUT_DEF_MS )

                postResponseMessage( data.type, resp )
            } catch( err ) {
                postErrorMessage("error", `Error detected while createSubscriber. Err: ${JSON.stringify(err)}`)
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
        default: { 
            ////////////////////////////////////////////////////////////////////////
            // send chunk. ex case data.type === 'data' or 'video' or 'audio'
            //
            if( _moqt.workerState !== StateEnum.Running ) {
                console.warn("MOQT is not open yet.")
                break
            }
            if( !(data.type in _moqt.tracks) ) {
                postErrorMessage("warn", `unknown type "${data.type}" received. ignored.` )
                break
            }

            if( !( typeof _moqt.tracks[data.type].maxInFlightRequests === 'number' ) ) {
                postErrorMessage("error", `maxInFlightRequests is not set in track definition:${data.type}`)
                break
            }

            const packagerType = _moqt.tracks[data.type].packagerType || 'raw'

            if( !( packagerType === 'raw' || packagerType === 'loc' )) {
                postErrorMessage("error", `packagerType MUST be "raw" or "loc", but got ${packagerType}.`)
            }

            if( !( data.type && 'numSubscribers' in _moqt.tracks[data.type])) {
                postErrorMessage("info", "no subscriber found")
                break
            }

            const firstFrameClkms = ( data.firstFrameClkms === undefined || data.firstFrameClkms < 0 ) ? 0 : data.firstFrameClkms
            const compensatedTs = ( data.compensatedTs === undefined || data.compensatedTs < 0 ) ? 0 : data.compensatedTs
            const estimatedDuration = ( data.estimatedDuration === undefined || data.estimatedDuration < 0 ) ? 0 : data.estimatedDuration
            const seqId = (data.seqId === undefined ) ? 0 : data.seqId
            const chunkData:ChunkData = { mediaType: data.type, firstFrameClkms, compensatedTs, estimatedDuration, seqId, packagerType, chunk: data.chunk, metadata: data.metadata }

            // work around. since I cannot avoid LINT error.
            // @ts-ignore
            _sendChunk( chunkData, _moqt.inFlightRequests[data.type], _moqt.tracks[data.type].maxInFlightRequests  )

            break
        }
    }
})


//////////////////////////////////////////////////////////
// private
//
//////////////////////////////////////////////////////////

async function _startSubscriptionLoop( readerStream:ReadableStream, writerStream:WritableStream ) {
    while ( _moqt.workerState === StateEnum.Running ) {
        // TODO: set correct type
        const subscribe:any = await recvSubscribeRequest( readerStream )

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

async function _startReceiveObjects( expire:number ) {
    if( _moqt.workerState === StateEnum.Stopped ) {
        postErrorMessage("error", "start receiving objects failed: state is STOPPED.")
        return
    }

    if( _moqt.wt === null ) {
        postErrorMessage("error", "start receiving objects failed: WT does not initialized.")
    }

    const incomingStreams = _moqt.wt.incomingUnidirectionalStreams
    const readableStreams = incomingStreams.getReader()

    while ( _moqt.workerState !== StateEnum.Stopped ) {
        const stream = await readableStreams.read()

        try {
            if( !stream.done ) {
                await _recvProcessObjects( stream.value )
            }
        } catch( err ) {
            postErrorMessage("error", `dropped stream. Error: ${JSON.stringify(err)}`)
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
    return _createSendRequest(chunkData)
}

async function _createSendRequest( chunkData:ChunkData ) {
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
    } else if( chunkData.packagerType === 'raw' ) {
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

async function _recvProcessObjects( readerStream:ReadableStream ) {
    const startTime = Date.now()

    const objHeader = await recvObjectHeader( readerStream )
    const trackType = _getTrackTypeFromTrackId( objHeader.trackId )

    if( trackType === undefined ) {
        throw new Error(`Unexpected trackId received ${objHeader.trackId}.`)
    }

    if( trackType !== 'data' ) {
        const packet = new LocPackager()
        await packet.ReadBytes( readerStream )

        const chunkData = packet.GetData()

        if( chunkData.chunkType === undefined ||  chunkData.mediaType === undefined ) {
            throw new Error(`Corrupted headers, we can NOT parse the data, headers: ${packet.GetDataStr()}`)
        }

        let chunk
        if( chunkData.mediaType === 'audio' ) {
            // @ts-ignore
            chunk = new EncodedAudioChunk({
                timestamp: chunkData.timestamp,
                type: chunkData.chunkType,
                data: chunkData.data,
                duration: chunkData.duration
            })
        } else if( chunkData.mediaType === 'video' && ( chunkData.chunkType === 'key' || chunkData.chunkType === 'delta' ) ) {
            // @ts-ignore
            chunk = new EncodedVideoChunk({
                timestamp: chunkData.timestamp,
                type: chunkData.chunkType,
                data: chunkData.data,
                duration: chunkData.duration
            })
        }
        postMessage({
            type: chunkData.mediaType + "chunk",
            metadata: {
                clkms: Date.now(),
                captureClkms: chunkData.firstFrameClkms,
                seqId: chunkData.seqId,
                metadata: chunkData.metadata
            },
            payload: chunk
        })

        const latencyMs = Date.now() - startTime
        postMessage({
            type: "latencyMs",
            payload: latencyMs,
            metadata: {
                durationMs: chunkData.duration / 1_000, 
                mediaType: chunkData.mediaType,
                seqId: chunkData.seqId,
                ts: chunkData.timestamp
            }
        })
    } else {
        const packet = new RawPackager()
        await packet.ReadBytes( readerStream )
        postMessage({
            type: 'data',
            payload: packet.GetData().data
        })
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

function _getTrackTypeFromTrackId( trackId:number ) {
    let ret
    for( const [trackType, trackData] of Object.entries(_moqt.tracks)) {
        if( trackData.id === trackId ) {
            ret = trackType
            break
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
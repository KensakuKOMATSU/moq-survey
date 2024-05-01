import { numberToVarInt, varIntToNumber } from './varint'
import { concatBuffer, buffRead } from './buffer_utils'
import { read } from 'fs'
import { Writable } from 'stream'

// MOQT definitions
// https://datatracker.ietf.org/doc/draft-ietf-moq-transport/01/

const MOQ_DRAFT01_VERSION = 0xff000001
const MOQ_SUPPORTED_VERSIONS = [MOQ_DRAFT01_VERSION]

export const MOQ_MAX_PARAMS = 256
export const MOQ_MAX_ARRAY_LENGTH = 1024


export const OBJECT_WITH_LENGTH    = 0x0
export const OBJECT_WITHOUT_LENGTH = 0x2
export const SUBSCRIBE             = 0x3
export const SUBSCRIBE_OK          = 0x4
export const SUBSCRIBE_ERROR       = 0x5
export const ANNOUNCE              = 0x6
export const ANNOUNCE_OK           = 0x7
export const ANNOUNCE_ERROR        = 0x8
export const UNANNOUNCE            = 0x9
export const UNSUBSCRIBE           = 0xa
export const SUBSCRIBE_FIN         = 0xb
export const SUBSCRIBE_RST         = 0xc
export const GOAWAY                = 0x10
export const CLIENT_SETUP          = 0x40
export const SERVER_SETUP          = 0x41

export const ROLE_PARAMETER     = 0x0
export const AUTHINFO_PARAMETER = 0x2

export const ROLE_PARAMETER_INVALID    = 0x0
export const ROLE_PARAMETER_PUBLISHER  = 0x1
export const ROLE_PARAMETER_SUBSCRIBER = 0x2
export const ROLE_PARAMETER_BOTH       = 0x3

export const LOCATION_MODE_NONE              = 0x0
export const LOCATION_MODE_ABSOLUTE          = 0x1
export const LOCATION_MODE_RELATIVE_PREVIOUS = 0x2
export const LOCATION_MODE_RELATIVE_NEXT     = 0x3



export enum Role {
    ROLE_CLIENT_SEND = 1,
    ROLE_SERVER_SEND = 2,
    ROLE_BOTH_SEND   = 3
}

// 6. Messages
//
// MOQT Message {
//   Message Type (i),
//   Message Payload (..),
// } 
//
// CLIENT_SETUP Message Payload {
//     Number of Supported Versions (i),
//     Supported Version (i) ...,
//     Number of Parameters (i) ...,
//     SETUP Parameters (..) ...,
// }
//
// SERVER_SETUP Message Payload {
//     Selected Version (i),
//     Number of Parameters (i) ...,
//     SETUP Parameters (..) ...,
// }
//
// SETUP Parameters
//   Role Parameters
//    0x01:  Only the client is expected to send objects on the connection.
//       This is commonly referred to as the ingestion case.
// 
//    0x02:  Only the server is expected to send objects on the connection.
//       This is commonly referred to as the delivery case.
// 
//    0x03:  Both the client and the server are expected to send objects.


////////////////////////////////////////////
// SETUP
//
////////////////////////////////////////////
export async function sendSetupRequest( writeStream:WritableStream, role:Role ) {
    const mesg = _createSetupMessage( role )
    await _send( writeStream, mesg )
}


export async function recvSetupResponse( readerStream:ReadableStream ) {
    const ret = { version: 0, parameters: null }

    const type = await varIntToNumber( readerStream )
    if( type !== SERVER_SETUP ) {
        throw new Error(`Invalid type received for setup request:${type}`)
    }
    ret.version = await varIntToNumber( readerStream )
    if( !MOQ_SUPPORTED_VERSIONS.includes( ret.version )) {
        throw new Error(`Unsupported version received:${ret.version}`)
    }

    ret.parameters = await _readParameters( readerStream )
    console.log( ret )

    return ret
}


////////////////////////////////////////////
// ANNOUNCE
//
////////////////////////////////////////////
export async function sendAnnounceRequest( writerStream:WritableStream, namespace:string, authInfo:string ) {
    const mesg = _createAnnounceMessage( namespace, authInfo )
    await _send(writerStream, mesg )
}

export async function recvAnnounceResponse( readerStream:ReadableStream ) {
    const type = await varIntToNumber( readerStream )
    if( type !== ANNOUNCE_OK ) {
        throw new Error(`ANNOUNCE answer type must be ${ANNOUNCE_OK}, but got ${type}`)
    }
    const namespace = await _stringRead( readerStream )
    console.log('namespace:%s', namespace )

    return { namespace }
}


////////////////////////////////////////////
// SUBSCRIBE
//
////////////////////////////////////////////
export async function sendSubscribe( writeStream:WritableStream, namespace:string, trackName:string, authInfo:string ) {
    const mesg = _createSubscribeMessage( namespace, trackName, authInfo )
    return await _send( writeStream, mesg )
}

export async function sendSubscribeResponse( writeStream:WritableStream, namespace:string, trackName:string, trackId:number, expiresMs:number ) {
    const mesg = _createSubscribeResponseMessage( namespace, trackName, trackId, expiresMs )
    return await _send( writeStream, mesg )
}

export async function recvSubscribe( readerStream:ReadableStream ) {
    const ret = {
        namespace: '',
        trackName: '',
        startGroup: -1,
        startObject: -1,
        endGroup: -1,
        endObject: -1,
        parameters: null
    }

    const type = await varIntToNumber( readerStream )
    if( type !== SUBSCRIBE ) {
        throw new Error(`SUBSCRIBE type must be ${SUBSCRIBE}, but got ${type}`)
    }

    ret.namespace = await _stringRead( readerStream )
    ret.trackName = await _stringRead( readerStream )

    ret.startGroup = await varIntToNumber( readerStream )
    if( ret.startGroup !== LOCATION_MODE_NONE ) {
        await varIntToNumber( readerStream )
        // TODO: check spec
    }

    ret.startObject = await varIntToNumber( readerStream )
    if( ret.startObject !== LOCATION_MODE_NONE ) {
        await varIntToNumber( readerStream )
        // TODO: check spec
    }
    
    ret.endGroup = await varIntToNumber( readerStream )
    if( ret.endGroup !== LOCATION_MODE_NONE ) {
        await varIntToNumber( readerStream )
        // TODO: check spec
    }
    ret.endObject = await varIntToNumber( readerStream )
    if( ret.endObject !== LOCATION_MODE_NONE ) {
        await varIntToNumber( readerStream )
        // TODO: check spec
    }

    ret.parameters = await _readParameters( readerStream )

    return ret
}

export async function recvSubscribeResponse( readerStream:ReadableStream ) {
    const ret = { namespace: '', trackName: '', trackId: -1, expires: -1 }
    const type = await varIntToNumber( readerStream )
    if( type !== SUBSCRIBE_OK ) {
        throw new Error(`SUBSCRIBE answer type must be ${SUBSCRIBE_OK}, but got ${type}`)
    }

    ret.namespace = await _stringRead( readerStream )
    ret.trackName = await _stringRead( readerStream )
    ret.trackId = await varIntToNumber( readerStream )
    ret.expires = await varIntToNumber( readerStream )

    return ret
}

////////////////////////////////////////////
// private
//
////////////////////////////////////////////
function _createSetupMessage(role:Role) {
    const viRole = numberToVarInt( role )

    return concatBuffer([
        numberToVarInt(CLIENT_SETUP),
        numberToVarInt(1),     // number of supported versions
        numberToVarInt(MOQ_DRAFT01_VERSION),
        numberToVarInt(1),     // number of parameters
        numberToVarInt(ROLE_PARAMETER),
        numberToVarInt(viRole.byteLength),
        viRole
    ])
}

function _createAnnounceMessage( namespace:string, authInfo:string ) {
    return concatBuffer([
        numberToVarInt( ANNOUNCE ),
        _createStringBytes( namespace ),
        numberToVarInt( 1 ), // number of parameters
        numberToVarInt( AUTHINFO_PARAMETER ),
        _createStringBytes( authInfo )
    ])
}

function _createSubscribeMessage( namespace:string, trackName:string, authInfo:string ) {
    return concatBuffer([
        numberToVarInt( SUBSCRIBE ),
        _createStringBytes( namespace ),
        _createStringBytes( trackName ),
        numberToVarInt( LOCATION_MODE_RELATIVE_NEXT ), // start group bytes mode
        numberToVarInt( 0 ), // start group bytes value
        numberToVarInt( LOCATION_MODE_ABSOLUTE ), // start object bytes mode
        numberToVarInt( 0 ), // start object bytes value
        numberToVarInt( LOCATION_MODE_NONE ), // end group bytes mode
        numberToVarInt( LOCATION_MODE_NONE ), // end object bytes mode
        numberToVarInt( 1 ), // number of params
        numberToVarInt( AUTHINFO_PARAMETER ),
        _createStringBytes( authInfo ) // length + payload
    ])
}

function _createSubscribeResponseMessage( namespace:string, trackName:string, trackId:number, expiresMs:number ) {
    return concatBuffer([
        numberToVarInt(SUBSCRIBE_OK),
        _createStringBytes(namespace),
        _createStringBytes(trackName),
        numberToVarInt(trackId),
        numberToVarInt(expiresMs)
    ])
}


////////////////////////////////////////////////////////////////////
// Helper
//
////////////////////////////////////////////////////////////////////

async function _readParameters( readerStream:ReadableStream ): Promise<any> {
    const ret:any = {}

    const numParams = await varIntToNumber(readerStream)
    if( numParams > MOQ_MAX_PARAMS ) {
        throw new Error(`exceeds the max number of parameters:${numParams}`)
    }
    for( let i = 0; i < numParams; i++ ) {
        const id = await varIntToNumber( readerStream )
        if( id === AUTHINFO_PARAMETER ) {
            ret.authInfo = await _stringRead(readerStream)
        } else if ( id === ROLE_PARAMETER ) {
            await varIntToNumber( readerStream ) // read length, but ignored.
            ret.role = await varIntToNumber( readerStream )
        } else {
            /* ignore unknown id */
            const len = await varIntToNumber( readerStream )
            const skip = await buffRead( readerStream, len )
            ret[`unknown-${i}-${id}-${len}`] = JSON.stringify(skip)
        }
    }

    return ret
}

async function _stringRead( readerStream:ReadableStream ): Promise<string> {
    const size = await varIntToNumber( readerStream )
    const buffer = await buffRead( readerStream, size )

    return buffer ? new TextDecoder().decode(buffer) : ''
}

async function _send( writeStream:WritableStream, data:Uint8Array ) {
    const writer = writeStream.getWriter()
    writer.write( data )
    await writer.ready
    writer.releaseLock()
}

function _createStringBytes( str:string ) {
    const dataStrBytes = new TextEncoder().encode( str )
    const dataStrLengthBytes = numberToVarInt( dataStrBytes.byteLength )
    return concatBuffer([dataStrLengthBytes, dataStrBytes])
}
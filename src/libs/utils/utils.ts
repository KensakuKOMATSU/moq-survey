export class StateEnum {
    static Created = new StateEnum('created')
    static Instantiated = new StateEnum('instantiated')
    static Running = new StateEnum('running')
    static Stopped = new StateEnum('stopped')

    _name:string

    constructor( name:string ) {
        this._name = name
    }
}

export type MetaData = {
    [ key:string]: any
}

export function serializeMetadata( metadata:MetaData ):Uint8Array|undefined {
    let ret
    if ( _isMetadataValid( metadata ) ) {
        const newData:MetaData = {}
        newData.decoderConfig = Object.assign({}, metadata.decoderConfig )

        if( 'description' in metadata.decoderConfig ) {
            newData.decoderConfig.descriptionInBase64 = _arrayBufferToBase64( metadata.decoderConfig.description )
            delete newData.description
        }
        const encoder = new TextEncoder()
        ret = encoder.encode(JSON.stringify(newData))
    }
    return ret
}

export function deSerializeMetadata( metadata:Buffer) {
    const decoder = new TextDecoder()
    const str = decoder.decode( metadata )
    const data = JSON.parse(str)

    if(( 'decoderConfig' in data ) && ('descriptionInBase64' in data.decoderConfig )) {
        const description = _base64ToArrayBuffer( data.decoderConfig.descriptionInBase64 )
        data.decoderConfig = { ...data.decoderConfig, description }
        delete data.decoderConfig.descriptionInBase64
    }
    return data.decoderConfig
}

function _isMetadataValid( metadata:MetaData ) {
    return metadata !== undefined && 'decoderConfig' in metadata
}

function _arrayBufferToBase64( buffer:Buffer ):string {
    let binary = ''
    const bytes = new Uint8Array( buffer )

    const len = bytes.byteLength
    for( let i = 0; i < len; i++ ) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
}

function _base64ToArrayBuffer( base64:string ) {
    const binaryString = atob( base64 )
    const len = binaryString.length
    const bytes = new Uint8Array( len )
    for( let i = 0; i < len; i++ ) {
        bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
}
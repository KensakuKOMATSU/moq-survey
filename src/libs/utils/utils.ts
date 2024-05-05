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
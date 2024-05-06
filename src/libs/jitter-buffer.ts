type Props = {
    minJitterBufferMs?:number
}

type MetaData = {
    clkms: number,
    seqId: number
}

type DataType = {
    metadata:MetaData|undefined
}

const DEFAULT_MIN_JITTER_BUFFER_MS = 100

export default class JitterBuffer {
    _buffer: Array<any>
    _maxLen: number
    _lastSeqId: number
    _minJitterBufferMs: number

    constructor( props:Props = {} ) {
        this._buffer = [] 
        this._maxLen = 30
        this._lastSeqId = -1
        this._minJitterBufferMs = props.minJitterBufferMs ? props.minJitterBufferMs : DEFAULT_MIN_JITTER_BUFFER_MS
    }

    get minJitterBufferMs():number {
        return this._minJitterBufferMs
    }

    set minJitterBufferMs( val:number ) {
        this._minJitterBufferMs = val
    }

    get length():number {
        return this._buffer.length
    }

    get lastSeqId():number {
        return this._lastSeqId 
    }

    addItem( data: DataType ) {
        this._buffer.push( data )

        if( this._buffer.length > this._maxLen ) {
            this._buffer = this._buffer.slice()
            this._buffer = this._buffer.slice( 1 )
        }
        this._sortBySeqId()
    }

    getItem() {
        if( this._buffer.length > 1 ) {
            const th = Date.now() - this._minJitterBufferMs
            const firstClkms = this._buffer[0].metadata.clkms
            
            if( firstClkms < th ) {
                this._lastSeqId = this._buffer[0].metadata.seqId
                return this._buffer.shift()
            } else {
                return null
            }
        } else {
            return null
        }
    }

    _sortBySeqId() {
        this._buffer.sort( ( a, b ) => ( a.metadata.seqId < b.metadata.seqId ? -1 : 1 ))
    }
}
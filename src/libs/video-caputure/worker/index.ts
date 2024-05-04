import { MessageData } from "../../../types/moqt"

let mainLoopInterval:number|null = null
let isMainLoopInExecution:boolean = false

const postErrorMessage = ( message:string ) => {
    console.log( message )

    // eslint-disable-next-line no-restricted-globals
    self.postMessage({
        type: "error",
        payload: message
    })
}

// TODO - fix type
const postVFframe = ( vFrame:any ) => {
    // eslint-disable-next-line no-restricted-globals
    self.postMessage({
        type: 'vFrame',
        metadata: {
            clkms: Date.now()
        },
        payload: vFrame
        // @ts-ignore
    }, [vFrame])
}

/* eslint-disable-next-line no-restricted-globals */
self.addEventListener( 'message', async ({ data }:{data:MessageData}) => {
    const { type } = data

    switch( type ) {
        case 'start': {
            if( mainLoopInterval ) { 
                postErrorMessage( "video-capture already started.")
                return
            }
            const stream = data.payload
            const reader = stream.getReader()
            console.log( data )

            // @ts-ignore
            mainLoopInterval = setInterval( _mainLoop, 1, reader )


            break
        }
        case 'stop': {
            if( mainLoopInterval ) {
                clearInterval( mainLoopInterval)
                mainLoopInterval = null
                isMainLoopInExecution = false
            }
            break
        }
        default: {
            postErrorMessage(`unknown message - type:${type}`)
            break
        }
    }
})

// @ts-ignore
function _mainLoop( reader ) {
    return new Promise( ( resolve, reject ) => {
        if( isMainLoopInExecution ) {
            return resolve( false )
        }

        isMainLoopInExecution = true
        reader.read()
        // @ts-ignore
            .then( res => {
                if ( res.done ) {
                    console.log( 'call ended')
                    reader.cancel('ended')
                        .then( console.log )
                } else {
                    return new Promise( r => r( res ) )
                }
            })
            // @ts-ignore
            .then( res => {
                console.log( res )
                if( res === 'ended' ) {
                    isMainLoopInExecution = false
                    return resolve( false )
                } else {
                    const vFrame = res.value
                    postVFframe( vFrame )
                    isMainLoopInExecution = false
                    return resolve( true )
                }
            })
            // @ts-ignore
            .catch( err => {
                postErrorMessage(`video-capture:_mainLoop got error:${JSON.stringify(err)}`)
                reject( err )
            })
    })
}

export {}
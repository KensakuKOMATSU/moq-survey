declare var WebTransport: any
// import { createMessage } from './util'

type Data = {
    type:String,
    meta?:any
    payload?:any
}

type Context = {
    endpoint: string,
    wt: any
}

const context:Context = {
    endpoint: '',
    wt: null
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

            context.endpoint = endpoint

            const url = new URL( context.endpoint )
            url.protocol = 'https'

            context.wt = new WebTransport(url.href)

            context.wt.closed
                .then( postCloseMessage )
                .catch( (err:Error) => postErrorMessage('close', err.message))
            await context.wt.ready
            postResponseMessage( data.type, endpoint )

            break
        case 'disconnect':
            if( context.wt ) {
                await context.wt.close()
                context.wt = null
                postCloseMessage()
            }
            break
        default: 
            // noop
    }
})

export {}
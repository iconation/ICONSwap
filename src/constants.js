export const Networks = Object.freeze({
    LOCALHOST: Symbol('LOCALHOST'),
    MAINNET: Symbol('MAINNET'),
    EULJIRO: Symbol('EULJIRO'),
    YEOUIDO: Symbol('YEOUIDO')
})

export const WALLET_LOCAL_STORAGE_KEY = 'wallet'

// SCORE Configuration
export const SCORE_ENDPOINT = 'cxf83517356e3157a23658b89fd5ec685b7073a649'
export const SCORE_NETWORK = Networks.YEOUIDO
// export const SCORE_ENDPOINT = "cx9c08deb7f3f6bbc4a66e9b34d04c1d05a54708d3"
// export const SCORE_NETWORK = Networks.LOCALHOST

// ICX Configuration
export const ICX_TOKEN_CONTRACT = 'cx0000000000000000000000000000000000000000'
export const ICX_TOKEN_DECIMALS = 18

// MAX_ITERATION_LOOP is defined in SCORE contract
export const MAX_ITERATION_LOOP = 100
import React, { useState } from 'react'
import { IconConverter } from 'icon-sdk-js'
import { api } from './API'
import OrderChoser from './OrderChoser'
import './Homepage.css'
import swapPicture from './static/img/swap.png'
import { useHistory } from 'react-router-dom'
import { truncateDecimals, convertTsToNumericDate, displayFloat, getPrice } from './utils'
import InfoBox from './InfoBox'
import LoadingOverlay from './LoadingOverlay'
import CustomInput from './CustomInput'
import { ReactComponent as SwapSvg } from './static/svg/Swap.svg'
import Switch from "react-switch";
import { IconValidator } from 'icon-sdk-js'

const Homepage = ({ wallet }) => {
    const emptyOrder = {
        contract: null,
        amount: null,
        contractError: null,
        amountError: null,
    }
    const [orders, setOrders] = useState([{ ...emptyOrder }, { ...emptyOrder }])
    const [whitelist, setWhitelist] = useState(null)
    const [waitForSwapCreation, setWaitForSwapCreation] = useState(false)
    const [errorUi, setErrorUi] = useState(null)
    const [switchPrivate, setSwitchPrivate] = useState(false)
    const [privateSwapAddress, setPrivateSwapAddress] = useState(null)
    const [privateAddressError, setPrivateAddressError] = useState(false)
    const [marketPrice, setMarketPrice] = useState(null)

    const maker = orders[0]
    const taker = orders[1]

    const history = useHistory();

    !whitelist && api.getWhitelist().then(contract => {
        const promises = contract.map(contract => {
            return api.getTokenDetails(wallet, contract)
        })

        Promise.all(promises).then(whitelist => {
            whitelist = whitelist.reduce(function (map, obj) {
                map[obj.contract] = obj
                return map
            }, {})
            setWhitelist(whitelist)
        }).catch((error) => {
            setErrorUi(error)
        })
    })

    const doSwitchPrivate = () => {
        setSwitchPrivate(!switchPrivate)
    }

    const createSwapClicked = () => {
        if (!swappable()) {
            // Highlight form that hasn't been filled correctly
            !maker.contract && setContractError(0, true);
            !taker.contract && setContractError(1, true);
            !maker.amount && setAmountError(0, true);
            !taker.amount && setAmountError(1, true);
            switchPrivate && !IconValidator.isEoaAddress(privateSwapAddress) && setPrivateAddressError(true)
            if (maker.contract === taker.contract && maker.contract !== null) {
                setContractError(1, true)
                setErrorUi("You cannot trade the same pair")
            }
        } else {
            // Check market price
            const curPrice = parseFloat(getPairDisplayPrice(taker, maker))
            if (curPrice < (marketPrice / 1.5)) {
                const result = window.confirm(`Your swap price (${curPrice}) seems much lower than the market price (${marketPrice}), are you sure you want to create this swap ?`)
                if (!result) {
                    return
                }
            }

            if (curPrice > (marketPrice * 1.3)) {
                const result = window.confirm(`Your swap price (${curPrice}) seems much higher than the market price (${marketPrice}), are you sure you want to create this swap ?`)
                if (!result) {
                    return
                }
            }

            setWaitForSwapCreation(true)
            api.createSwap(
                wallet,
                maker.contract,
                IconConverter.toBigNumber(maker.amount).multipliedBy(IconConverter.toBigNumber('10').exponentiatedBy(maker.decimals)),
                taker.contract,
                IconConverter.toBigNumber(taker.amount).multipliedBy(IconConverter.toBigNumber('10').exponentiatedBy(taker.decimals)),
                privateSwapAddress
            ).then(swapInfo => {
                if (swapInfo) {
                    history.push("/swap/" + swapInfo['swapId']);
                    setWaitForSwapCreation(false)
                }
            }).finally(() => {
                setWaitForSwapCreation(false)
            }).catch((error) => {
                setErrorUi(error)
            })
        }
    }

    const swappable = () => {
        return maker.contract
            && taker.contract
            && orders[0].amount
            && taker.contract
            && maker.contract !== taker.contract
            && (!switchPrivate || (switchPrivate && IconValidator.isEoaAddress(privateSwapAddress)))
    }

    const setContract = (index, value) => {
        let newOrders = [...orders]
        newOrders[index].contract = value
        api.getDecimals(value).then(decimals => {
            newOrders[index].decimals = decimals
            setOrders(newOrders)
            setContractError(index, false)
            setMarketPrice(null)
        })
    }

    const setContractError = (index, value) => {
        let newOrders = [...orders]
        newOrders[index].contractError = value
        setOrders(newOrders)
    }

    const setAmount = (index, value) => {
        let newOrders = [...orders]
        newOrders[index].amount = value
        newOrders[index].amountError = false
        setOrders(newOrders)
        setAmountError(index, false)
    }

    const setAmountError = (index, value) => {
        let newOrders = [...orders]
        newOrders[index].amountError = value
        setOrders(newOrders)
    }

    const getPairDisplayPrice = (o1, o2) => {
        if (!(o1.contract !== null && o2.contract !== null &&
            o1.amount !== null && o2.amount !== null &&
            parseFloat(o1.amount) !== 0 && parseFloat(o2.amount) !== 0 &&
            o1.amount !== "" && o2.amount !== "")) {
            return "?"
        }
        return truncateDecimals(IconConverter.toBigNumber(o1['amount']).dividedBy(IconConverter.toBigNumber(o2['amount'])), 8)
    }

    const getMarketPrice = (c1, c2, d1, d2) => {
        const pairs = c1 + '/' + c2
        const pairsArr = [c1, c2]

        return api.getMarketFilledSwaps(pairs, 0).then(swaps => {

            var lastDate = null;
            var lastHigh = 0;
            var lastLow = 0;
            var init = 1;
            var prices = []

            for (const [key, swap] of Object.entries(swaps)) {
                const curPrice = getPrice(swap, pairsArr, [d1, d2])
                // Fix the log 0 price chart bug
                if (curPrice === 0) continue;
                // Fix the abnormal prices
                if (lastHigh !== 0 && curPrice > (lastHigh * 3)) continue
                if (lastLow !== 0 && curPrice < (lastLow / 3)) continue

                prices.push(parseFloat(curPrice))

                // init
                if (init) {
                    lastDate = convertTsToNumericDate(swap['timestamp_swap'])
                    lastHigh = curPrice;
                    lastLow = curPrice;
                    init = 0;
                }

                const curDate = convertTsToNumericDate(swap['timestamp_swap'])
                if (lastDate !== curDate) {
                    // New day, push the previous one
                    break
                }
            }

            // Average
            var total = 0;
            for (var i = 0; i < prices.length; i++) {
                total += prices[i];
            }

            return total / prices.length;
        })
    }

    const getPairDisplaySymbol = (o) => {
        if (o.contract === null) {
            return ""
        }
        return whitelist[o.contract].symbol
    }

    const setPrivateAddress = (value) => {
        setPrivateSwapAddress(value.trim())
        setPrivateAddressError(false)
    }

    const loadingText = waitForSwapCreation ? 'Creating Swap, please wait...' : 'Loading Wallet...'
    const over = (whitelist !== null)

    !marketPrice && (maker.contract && taker.contract) &&
        getMarketPrice(maker.contract, taker.contract, maker.decimals, taker.decimals).then(price => {
            setMarketPrice(price)
        })

    return (
        <>
            <LoadingOverlay over={over && !waitForSwapCreation} text={loadingText} />
            {errorUi && <InfoBox setErrorUi={setErrorUi} type={"error"} content={"An error occured : " + errorUi} />}

            {over && <>

                <div className="split left">
                    <div className="homepage-orders-centered">
                        <OrderChoser
                            whitelist={whitelist}
                            setContract={setContract}
                            setAmount={setAmount}
                            titleText={"I am offering"}
                            orders={orders}
                            index={0} />
                    </div>
                </div>

                <div className="split right">
                    <div className="homepage-orders-centered">
                        <OrderChoser
                            whitelist={whitelist}
                            setContract={setContract}
                            setAmount={setAmount}
                            titleText={"I am receiving"}
                            orders={orders}
                            index={1} />
                    </div>
                </div>

                {whitelist && <div className="center swap-logo">
                    <img src={swapPicture} height="60" alt="logo" />
                </div>}

                {whitelist && <div id="homepage-create-swap-container">

                    <div className="homepage-create-swap-item" id="homepage-price-container">

                        <div className="homepage-create-swap-title">Swap Price</div>
                        <div className="homepage-create-swap-content">
                            {maker.contract && taker.contract && <>
                                <div>1 {getPairDisplaySymbol(maker)} ≈ {getPairDisplayPrice(taker, maker)} {getPairDisplaySymbol(taker)}</div>
                                <div>1 {getPairDisplaySymbol(taker)} ≈ {getPairDisplayPrice(maker, taker)} {getPairDisplaySymbol(maker)}</div>
                            </>}
                            {!(maker.contract && taker.contract) && <>
                                <div id="homepage-price-wait-price-input">
                                    <div className="loadingDots">
                                        <span>.</span> <span>.</span> <span>.</span>
                                    </div>
                                </div>
                            </>}
                        </div>
                    </div>

                    <div className="homepage-create-swap-item" id="homepage-price-container">

                        <div className="homepage-create-swap-title">Market Price</div>
                        <div className="homepage-create-swap-content">
                            {maker.contract && taker.contract && marketPrice && <>
                                <div>1 {getPairDisplaySymbol(maker)} ≈ {displayFloat(marketPrice)} {getPairDisplaySymbol(taker)}</div>
                                <div>1 {getPairDisplaySymbol(taker)} ≈ {displayFloat(1 / marketPrice)} {getPairDisplaySymbol(maker)}</div>
                            </>}
                            {!(maker.contract && taker.contract) && <>
                                <div id="homepage-price-wait-price-input">
                                    <div className="loadingDots">
                                        <span>.</span> <span>.</span> <span>.</span>
                                    </div>
                                </div>
                            </>}
                        </div>
                    </div>

                    <div className="homepage-create-swap-item" id="homepage-swap-settings-container">

                        <div className="homepage-create-swap-title">Swap Settings</div>
                        <div className="homepage-create-swap-content">

                            <div id="homepage-private-toggle-container" className="tooltip">
                                <span className="tooltiptext">
                                    Private Swaps aren't listed on the Market. <br />
                                    Only the given ICON address will be able to fulfill the swap.
                                </span>
                                <div id="homepage-private-toggle">
                                    <Switch onChange={() => { doSwitchPrivate() }} checked={switchPrivate} />
                                    <div id="homepage-private-text">Private Swap</div>
                                </div>
                            </div>
                            {switchPrivate && <>
                                <div id="homepage-private-address-container">
                                    <CustomInput
                                        error={privateAddressError}
                                        label="Address"
                                        locked={!switchPrivate}
                                        active={false}
                                        onChange={(value) => { setPrivateAddress(value) }}
                                    />
                                </div>
                            </>}
                        </div>
                    </div>

                    <div className="homepage-create-swap-item" id="homepage-create-swap-button-container">
                        <button className="big-button button-svg-container homepage-create-swap-button" onClick={() => { createSwapClicked() }}>
                            <div className="svg-icon-button"><SwapSvg /></div>
                            <div className="svg-text-button">Create Swap</div>
                        </button>
                    </div>

                </div>}
            </>}
        </>
    )
}

export default Homepage
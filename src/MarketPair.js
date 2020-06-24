import React, { useState, useEffect, useRef } from 'react'
import LoadingOverlay from './LoadingOverlay'
import { api } from './API'
import './MarketPair.css'
import { useHistory } from 'react-router-dom';
import { showPriceChart, showDepthChart } from './MarketCharts'
import {
    convertTsToDate,
    displayBigNumber,
    balanceToUnit,
    balanceToUnitDisplay,
    isBuyer,
    getPriceBigNumber,
    getPrice,
    truncateDecimals
} from './utils'
import { IconConverter } from 'icon-sdk-js'
import { ReactComponent as WalletSvg } from './static/svg/Wallet.svg'
import { ReactComponent as SwapSpotSvg } from './static/svg/SwapSpot.svg'


const MarketPair = ({ match, wallet }) => {

    const history = useHistory();

    const [pairs, setPairs] = useState([match.params.pair1, match.params.pair2])
    const [buyers, setBuyers] = useState(null)
    const [sellers, setSellers] = useState(null)
    const [market, setMarket] = useState(null)
    const [chartView, setChartView] = useState('price')
    const [isInverted, setIsInverted] = useState(false)

    const chartCanvas = useRef(null)
    const buyPriceInput = useRef(null)
    const buyAmountInput = useRef(null)
    const buyTotalInput = useRef(null)
    const sellPriceInput = useRef(null)
    const sellAmountInput = useRef(null)
    const sellTotalInput = useRef(null)

    const pairName = pairs.join('/')

    const FormIndexes = {
        PRICE_FORM_INDEX: 0,
        AMOUNT_FORM_INDEX: 1,
        TOTAL_FORM_INDEX: 2,
    }

    useEffect(() => {

        const percentVolumeSwaps = (swaps) => {
            var makerAmountSum = IconConverter.toBigNumber(0)
            var takerAmountSum = IconConverter.toBigNumber(0)

            swaps.forEach(swap => {
                makerAmountSum = makerAmountSum.plus(IconConverter.toBigNumber(swap['maker']['amount']))
                takerAmountSum = takerAmountSum.plus(IconConverter.toBigNumber(swap['taker']['amount']))
            })

            // Determine the volume percent
            swaps.forEach(swap => {
                swap['maker']['volume_percent'] = parseFloat(IconConverter.toBigNumber(swap['maker']['amount']).dividedBy(makerAmountSum)) * 100
                swap['taker']['volume_percent'] = parseFloat(IconConverter.toBigNumber(swap['taker']['amount']).dividedBy(takerAmountSum)) * 100
            })
        }

        const groupSwaps = (swaps, sellSide) => {
            if (swaps.length === 0) return swaps

            // Group swaps in a dict with a price key
            let dictionary = {}
            swaps.forEach(swap => {
                if (!(getPrice(swap, pairs, false) in dictionary)) {
                    dictionary[getPrice(swap, pairs, false)] = [swap]
                } else {
                    dictionary[getPrice(swap, pairs, false)].push(swap)
                }
            })

            var result = []

            // Sort keys by value
            const sortedKeys = Object.keys(dictionary).sort((a, b) => {
                return sellSide ? parseFloat(a) - parseFloat(b) : parseFloat(b) - parseFloat(a)
            })

            // Iterate the dictionary
            sortedKeys.forEach(key => {
                const swapsPrice = dictionary[key]
                var sumSwap = swapsPrice.reduce((acc, cur) => {
                    acc['maker']['amount'] = IconConverter.toHex(IconConverter.toBigNumber(acc['maker']['amount'])
                        .plus(cur['maker']['amount']))
                    acc['taker']['amount'] = IconConverter.toHex(IconConverter.toBigNumber(acc['taker']['amount'])
                        .plus(IconConverter.toBigNumber(cur['taker']['amount'])))
                    return acc
                })
                result.push(sumSwap)
            })

            return result
        }

        const refreshMarket = () => {

            let promises = [
                api.getBalance(wallet, pairs[0]),
                api.getBalance(wallet, pairs[1]),
                api.getMarketBuyersPendingSwaps(pairName),
                api.getMarketSellerPendingSwaps(pairName),
                api.getDecimals(pairs[0]),
                api.getDecimals(pairs[1]),
                api.tokenSymbol(pairs[0]),
                api.tokenSymbol(pairs[1]),
                api.getManyMarketFilledSwaps(pairName, 0, 1500)
            ]

            return Promise.all(promises).then(async market => {
                const [
                    balance1, balance2,
                    buySide, sellSide,
                    decimal1, decimal2,
                    symbol1, symbol2,
                    history
                ] = market

                // Restructure market into dict
                market = {
                    balances: [balance1, balance2],
                    swaps: [buySide, sellSide],
                    decimals: [decimal1, decimal2],
                    symbols: {
                        [pairs[0]]: symbol1,
                        [pairs[1]]: symbol2
                    },
                    history: history
                }

                // Check if inverted view
                if (market.swaps[0].length !== 0) {
                    if (market.swaps[0][0].maker.contract === pairs[1]) {
                        setIsInverted(false)
                        const buyersGroup = groupSwaps(market.swaps[0], false)
                        const sellersGroup = groupSwaps(market.swaps[1], true)
                        setBuyers(buyersGroup)
                        setSellers(sellersGroup)
                        percentVolumeSwaps(buyersGroup)
                        percentVolumeSwaps(sellersGroup)
                    } else {
                        // inverted
                        setIsInverted(true)
                        const sellersGroup = groupSwaps(market.swaps[0], true)
                        const buyersGroup = groupSwaps(market.swaps[1], false)
                        setBuyers(buyersGroup)
                        setSellers(sellersGroup)
                        percentVolumeSwaps(buyersGroup)
                        percentVolumeSwaps(sellersGroup)
                    }
                }
                else if (market.swaps[1].length !== 0) {
                    if (market.swaps[1][0].maker.contract === pairs[0]) {
                        setIsInverted(false)
                        const buyersGroup = groupSwaps(market.swaps[0], false)
                        const sellersGroup = groupSwaps(market.swaps[1], true)
                        setBuyers(buyersGroup)
                        setSellers(sellersGroup)
                        percentVolumeSwaps(buyersGroup)
                        percentVolumeSwaps(sellersGroup)
                    } else {
                        // inverted
                        setIsInverted(true)
                        const sellersGroup = groupSwaps(market.swaps[0], true)
                        const buyersGroup = groupSwaps(market.swaps[1], false)
                        setBuyers(buyersGroup)
                        setSellers(sellersGroup)
                        percentVolumeSwaps(buyersGroup)
                        percentVolumeSwaps(sellersGroup)
                    }
                }

                setMarket(market)
            })
        }

        refreshMarket()
    }, [pairs, pairName, wallet]);

    useEffect(() => {
        switch (chartView) {
            case 'price':
                if (chartCanvas.current) showPriceChart(market, pairs, isInverted);
                break;

            case 'depth':
                if (chartCanvas.current) showDepthChart(market, pairs, isInverted);
                break;

            default:
                console.error("Undefined chartview mode")
        }
    }, [market, chartView, isInverted, pairs]);

    const goToSwap = (swap) => {
        window.open("#/swap/" + parseInt(swap['id'], 16), '_blank')
    }

    const selectPercentWallet = (percentValue, sideSell) => {
        const indexBalance = sideSell ? 0 : 1

        if (sideSell) {
            const amount = IconConverter.toBigNumber(market.balances[indexBalance]).multipliedBy(percentValue).dividedBy(100)
            sellAmountInput.current.value = parseFloat(balanceToUnitDisplay(amount, market.decimals[indexBalance]).trim())
            makerOrderFieldChange(sideSell, FormIndexes.AMOUNT_FORM_INDEX)
        } else {
            const total = IconConverter.toBigNumber(market.balances[indexBalance]).multipliedBy(percentValue).dividedBy(100)
            buyTotalInput.current.value = parseFloat(balanceToUnitDisplay(total, market.decimals[indexBalance]).trim())
            makerOrderFieldChange(sideSell, FormIndexes.TOTAL_FORM_INDEX)
        }
    }

    const sanitizeOrderFieldInputs = (sideSell, price = null, amount = null, total = null) => {

        const priceInput = (sideSell ? sellPriceInput : buyPriceInput)
        const amountInput = (sideSell ? sellAmountInput : buyAmountInput)
        const totalInput = (sideSell ? sellTotalInput : buyTotalInput)

        if (price !== null) priceInput.current.value = price ? truncateDecimals(price, 7) : price === 0 ? '0' : ''
        if (amount !== null) amountInput.current.value = amount ? truncateDecimals(amount, 7) : amount === 0 ? '0' : ''
        if (total !== null) totalInput.current.value = total ? truncateDecimals(total, 7) : total === 0 ? '0' : ''
    }

    const makerOrderFieldChange = (sideSell, indexChanged) => {

        const priceInput = (sideSell ? sellPriceInput : buyPriceInput)
        const amountInput = (sideSell ? sellAmountInput : buyAmountInput)
        const totalInput = (sideSell ? sellTotalInput : buyTotalInput)

        const isInputEmpty = (input) => {
            return input.current.value.length === 0
        }

        var price = parseFloat(priceInput.current.value)
        var amount = parseFloat(amountInput.current.value)
        var total = parseFloat(totalInput.current.value)

        switch (indexChanged) {
            case FormIndexes.PRICE_FORM_INDEX: // price
                if (isInputEmpty(priceInput) || isInputEmpty(amountInput)) break
                total = parseFloat(IconConverter.toBigNumber(amount).multipliedBy(IconConverter.toBigNumber(price)))
                sanitizeOrderFieldInputs(sideSell, null, null, total)
                break
            case FormIndexes.AMOUNT_FORM_INDEX: // amount
                if (isInputEmpty(priceInput) || isInputEmpty(amountInput)) break
                total = parseFloat(IconConverter.toBigNumber(amount).multipliedBy(IconConverter.toBigNumber(price)))
                sanitizeOrderFieldInputs(sideSell, null, null, total)
                break
            case FormIndexes.TOTAL_FORM_INDEX: // total
                if (isInputEmpty(priceInput) || isInputEmpty(totalInput)) break
                amount = parseFloat(IconConverter.toBigNumber(total).dividedBy(IconConverter.toBigNumber(price)))
                sanitizeOrderFieldInputs(sideSell, null, amount)
                break
            default:
                console.error("makerOrderFieldChange: Invalid index")
        }
    }

    const clickOrderLimit = (sideSell) => {

        const amountInput = (sideSell ? sellAmountInput : buyAmountInput)
        const totalInput = (sideSell ? sellTotalInput : buyTotalInput)

        const maker_amount = sideSell ? parseFloat(amountInput.current.value) : parseFloat(totalInput.current.value)
        const taker_amount = sideSell ? parseFloat(totalInput.current.value) : parseFloat(amountInput.current.value)

        const maker_contract = sideSell ? pairs[0] : pairs[1]
        const taker_contract = sideSell ? pairs[1] : pairs[0]

        api.marketCreateLimitOrder(wallet, maker_contract, maker_amount, taker_contract, taker_amount)
    }

    const clickOnBookOrder = (swap, index, swaps, sideSell) => {
        const price = getPriceBigNumber(swap, pairs)

        // Get amount
        var amount = IconConverter.toBigNumber(0);
        const sideOrder = sideSell ? 'maker' : 'taker'
        for (var curIndex = index; curIndex >= 0; curIndex--) {
            amount = amount.plus(IconConverter.toBigNumber(swaps[curIndex][sideOrder]['amount']))
        }

        // Check if amount exceed balance
        const indexBalance = sideSell ? 1 : 0
        const balance = IconConverter.toBigNumber(market.balances[indexBalance])
        if (sideSell) {
            const total = amount.multipliedBy(price)
            if (total.comparedTo(balance) === 1) {
                amount = IconConverter.toBigNumber(balance).dividedBy(IconConverter.toBigNumber(price))
            }
        } else {
            if (amount.comparedTo(balance) === 1) {
                amount = balance
            }
        }

        const total = amount.multipliedBy(price)
        sanitizeOrderFieldInputs(!sideSell,
            parseFloat(price),
            parseFloat(balanceToUnit(amount, market.decimals[0])),
            parseFloat(balanceToUnit(total, market.decimals[1]))
        )
    }

    const getSpread = (swapBid, swapAsk, pairs) => {
        if (!swapBid | !swapAsk) return 0;

        const bid = getPriceBigNumber(swapBid, pairs)
        const ask = getPriceBigNumber(swapAsk, pairs)
        return displayBigNumber(bid.minus(ask).dividedBy(ask.plus(bid).dividedBy(2)).multipliedBy(100).abs())
    }

    const swapSpot = () => {
        history.push("/market/" + pairs[1] + "/" + pairs[0])
        setBuyers(null)
        setPairs([pairs[1], pairs[0]])
    }

    const isUserSwap = (swap) => {
        return (swap.maker.provider === wallet || swap.taker.provider === wallet)
    }

    const over = market && buyers && sellers
    const swapsFilled = market && market.history.slice(0, 250)

    const loadingText = 'Loading Market...'

    return (<>
        <LoadingOverlay over={over} text={loadingText} />

        <div id="market-pair-root">
            {over && <>
                <div id="market-pair-container">
                    <div id="market-pair-title">

                        {market.symbols[pairs[0]]}/{market.symbols[pairs[1]]}

                        <button id="market-pair-swap-spots" className="big-button button-svg-container tooltip"
                            onClick={() => { swapSpot() }}>
                            <div className="svg-icon-button"><SwapSpotSvg /></div>
                        </button>

                    </div>

                    <div id="market-pair-view">
                        <div id="market-pair-left">
                            <table id="market-pair-sellers" className="market-pair-table">
                                <tbody id="market-pair-sellers-entries">
                                    {sellers && sellers.map((swap, index) => (
                                        <tr
                                            style={{ background: `linear-gradient(to left, #ec4b7033 ${swap['maker']['volume_percent'] * 10}%, #ffffff00 0%)` }}
                                            className="market-pair-tr-percent-volume market-pair-tr-clickeable"
                                            onClick={() => { clickOnBookOrder(swap, index, sellers, true) }}
                                            key={swap['id']}>
                                            <td className={"market-pair-left-status tooltip"}>{isUserSwap(swap) && <>
                                                <span className="market-pair-yourswap market-pair-yourswap-seller">⮞</span>
                                                <span className="tooltiptext">You created this swap</span>
                                            </>}
                                            </td>
                                            <td className="market-pair-left-price market-pair-sellers-text" >{getPrice(swap, pairs)}</td>
                                            <td className="market-pair-left-amount">{balanceToUnitDisplay(swap['maker']['amount'], market.decimals[1])}</td>
                                            <td className="market-pair-left-total">{balanceToUnitDisplay(swap['taker']['amount'], market.decimals[0])}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <table className="market-pair-table">
                                <thead>
                                    <tr>
                                        <th className="market-pair-left-status"></th>
                                        <th className="market-pair-left-price">Price ({market.symbols[pairs[1]]}) </th>
                                        <th className="market-pair-left-amount">Amount ({market.symbols[pairs[0]]})</th>
                                        <th className="market-pair-left-total">Total ({market.symbols[pairs[1]]})</th>
                                    </tr>
                                </thead>
                            </table>

                            <div id="market-pair-middleinfo">
                                <div id="market-pair-spread">Spread: <br /> {getSpread(sellers[0], buyers[0], pairs)} %</div>
                                <div id="market-pair-lastprice">Last Price : <br /> {(swapsFilled.length > 0 && getPrice(swapsFilled[0], pairs)) || 0}</div>
                            </div>

                            <table className="market-pair-table">
                                <thead>
                                    <tr>
                                        <th className="market-pair-left-status"></th>
                                        <th className="market-pair-left-price">Price ({market.symbols[pairs[1]]}) </th>
                                        <th className="market-pair-left-amount">Amount ({market.symbols[pairs[0]]})</th>
                                        <th className="market-pair-left-total">Total ({market.symbols[pairs[1]]})</th>
                                    </tr>
                                </thead>
                            </table>

                            <table id="market-pair-buyers" className="market-pair-table">
                                <tbody id="market-pair-buyers-entries">
                                    {buyers && buyers.map((swap, index) => (
                                        <tr style={{ background: `linear-gradient(to left, #74aa1733 ${swap['taker']['volume_percent'] * 10}%, #ffffff00 0%)` }}
                                            className="market-pair-tr-clickeable"
                                            onClick={() => { clickOnBookOrder(swap, index, buyers, false) }}
                                            key={swap['id']}>
                                            <td className={"market-pair-left-status tooltip"}>{isUserSwap(swap) && <>
                                                <span className="market-pair-yourswap market-pair-yourswap-buyer">⮞</span>
                                                <span className="tooltiptext tooltiptext-bottom">You created this swap</span>
                                            </>}
                                            </td>
                                            <td className="market-pair-left-price market-pair-buyers-text" >{getPrice(swap, pairs)}</td>
                                            <td className="market-pair-left-amount">{balanceToUnitDisplay(swap['taker']['amount'], market.decimals[0])}</td>
                                            <td className="market-pair-left-total">{balanceToUnitDisplay(swap['maker']['amount'], market.decimals[1])}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div id="market-pair-middle">
                            <div id="market-pair-chart">
                                <div id="market-pair-chart-choser">

                                    <button className="small-button tooltip" onClick={() => { setChartView('depth') }}>
                                        Depth
                                    </button>

                                    <button className="small-button tooltip" onClick={() => { setChartView('price') }}>
                                        Price
                                    </button>
                                </div>

                                <div ref={chartCanvas} id="market-pair-chart-canvas"></div>
                            </div>


                            <div id="market-pair-make-order">
                                <div id="market-pair-buy-order">
                                    <div className="market-pair-make-order-header">
                                        <div className="market-pair-make-order-title">Buy {market.symbols[pairs[0]]}</div>

                                        <div className="market-pair-make-order-balance">
                                            <div className="svg-icon-button"><WalletSvg /></div>&nbsp;
                                        {balanceToUnitDisplay(market.balances[1], market.decimals[1])} {market.symbols[pairs[1]]}
                                        </div>
                                    </div>

                                    <div className="market-pair-make-order-fields">
                                        <div className={"market-pair-make-order-hz market-pair-make-order-price"}>
                                            <div className="market-pair-make-order-textfield">Price ({market.symbols[pairs[1]]}):</div>
                                            <input onChange={() => { makerOrderFieldChange(false, FormIndexes.PRICE_FORM_INDEX) }} ref={buyPriceInput} className="market-pair-make-order-inputfield" type="number"></input>
                                        </div>
                                        <div className={"market-pair-make-order-hz market-pair-make-order-amount"}>
                                            <div className="market-pair-make-order-textfield">Amount ({market.symbols[pairs[0]]}):</div>
                                            <input onChange={() => { makerOrderFieldChange(false, FormIndexes.AMOUNT_FORM_INDEX) }} ref={buyAmountInput} className="market-pair-make-order-inputfield" type="number"></input>
                                        </div>
                                        <div className={"market-pair-make-order-hz market-pair-make-order-percent"}>
                                            <button onClick={() => { selectPercentWallet(25, false) }} className={"market-pair-percent-button"}>25%</button>
                                            <button onClick={() => { selectPercentWallet(50, false) }} className={"market-pair-percent-button"}>50%</button>
                                            <button onClick={() => { selectPercentWallet(75, false) }} className={"market-pair-percent-button"}>75%</button>
                                            <button onClick={() => { selectPercentWallet(100, false) }} className={"market-pair-percent-button"}>100%</button>
                                        </div>
                                        <div className={"market-pair-make-order-hz market-pair-make-order-total"}>
                                            <div className="market-pair-make-order-textfield">Total ({market.symbols[pairs[1]]}):</div>
                                            <input onChange={() => { makerOrderFieldChange(false, FormIndexes.TOTAL_FORM_INDEX) }} ref={buyTotalInput} className="market-pair-make-order-inputfield" type="number"></input>
                                        </div>

                                        <button className="market-pair-buysell-button market-pair-buy-button"
                                            onClick={() => { clickOrderLimit(false) }}>
                                            Buy {market.symbols[pairs[0]]}</button>
                                    </div>
                                </div>

                                <div id="market-pair-sell-order">

                                    <div className="market-pair-make-order-header">
                                        <div className="market-pair-make-order-title">Sell {market.symbols[pairs[0]]}</div>

                                        <div className="market-pair-make-order-balance">
                                            <div className="svg-icon-button"><WalletSvg /></div>&nbsp;
                                        {balanceToUnitDisplay(market.balances[0], market.decimals[0])} {market.symbols[pairs[0]]}
                                        </div>
                                    </div>

                                    <div className="market-pair-make-order-fields">
                                        <div className={"market-pair-make-order-hz market-pair-make-order-price"}>
                                            <div className="market-pair-make-order-textfield">Price ({market.symbols[pairs[1]]}):</div>
                                            <input onChange={() => { makerOrderFieldChange(true, FormIndexes.PRICE_FORM_INDEX) }} ref={sellPriceInput} className="market-pair-make-order-inputfield" type="number"></input>
                                        </div>
                                        <div className={"market-pair-make-order-hz market-pair-make-order-amount"}>
                                            <div className="market-pair-make-order-textfield">Amount ({market.symbols[pairs[0]]}):</div>
                                            <input onChange={() => { makerOrderFieldChange(true, FormIndexes.AMOUNT_FORM_INDEX) }} ref={sellAmountInput} className="market-pair-make-order-inputfield" type="number"></input>
                                        </div>
                                        <div className={"market-pair-make-order-hz market-pair-make-order-percent"}>
                                            <button onClick={() => { selectPercentWallet(25, true) }} className={"market-pair-percent-button"}>25%</button>
                                            <button onClick={() => { selectPercentWallet(50, true) }} className={"market-pair-percent-button"}>50%</button>
                                            <button onClick={() => { selectPercentWallet(75, true) }} className={"market-pair-percent-button"}>75%</button>
                                            <button onClick={() => { selectPercentWallet(100, true) }} className={"market-pair-percent-button"}>100%</button>
                                        </div>
                                        <div className={"market-pair-make-order-hz market-pair-make-order-total"}>
                                            <div className="market-pair-make-order-textfield">Total ({market.symbols[pairs[1]]}):</div>
                                            <input onChange={() => { makerOrderFieldChange(true, FormIndexes.TOTAL_FORM_INDEX) }} ref={sellTotalInput} className="market-pair-make-order-inputfield" type="number"></input>
                                        </div>

                                        <button className="market-pair-buysell-button market-pair-sell-button"
                                            onClick={() => { clickOrderLimit(true) }}>
                                            Sell {market.symbols[pairs[0]]}</button>

                                    </div>
                                </div>
                            </div>
                        </div>

                        <div id="market-pair-right">

                            <table className="market-pair-table">
                                <thead>
                                    <tr>
                                        <th className="market-pair-history-price">Price ({market.symbols[pairs[1]]}) </th>
                                        <th className="market-pair-history-amount">Amount ({market.symbols[pairs[0]]})</th>
                                        <th className="market-pair-history-total">Total ({market.symbols[pairs[1]]})</th>
                                        <th className="market-pair-history-filled">Time filled</th>
                                    </tr>
                                </thead>
                            </table>

                            <div id="market-pair-history">
                                <table className="market-pair-table">
                                    <tbody>
                                        {swapsFilled && swapsFilled.map(swap => (
                                            <tr className="market-pair-tr-clickeable" onClick={() => { goToSwap(swap) }} key={swap['id']}>
                                                {isBuyer(swap, pairs) && <>
                                                    <td className="market-pair-history-price market-pair-buyers-text" >{getPrice(swap, pairs)}</td>
                                                    <td className="market-pair-history-amount">{balanceToUnitDisplay(swap['taker']['amount'], market.decimals[0])}</td>
                                                    <td className="market-pair-history-total">{balanceToUnitDisplay(swap['maker']['amount'], market.decimals[1])}</td>
                                                    <td className="market-pair-history-filled">{convertTsToDate(swap['timestamp_swap'])}</td>
                                                </>}
                                                {!isBuyer(swap, pairs) && <>
                                                    <td className="market-pair-history-price market-pair-sellers-text" >{getPrice(swap, pairs)}</td>
                                                    <td className="market-pair-history-amount">{balanceToUnitDisplay(swap['maker']['amount'], market.decimals[1])}</td>
                                                    <td className="market-pair-history-total">{balanceToUnitDisplay(swap['taker']['amount'], market.decimals[0])}</td>
                                                    <td className="market-pair-history-filled">{convertTsToDate(swap['timestamp_swap'])}</td>
                                                </>}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </>}
        </div>
    </>)
}

export default MarketPair
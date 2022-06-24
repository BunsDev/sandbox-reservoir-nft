import { useEffect, useState } from 'react'
import { useConnect, useSigner, useAccount, useNetwork } from 'wagmi'
import { buyToken, Execute } from '@reservoir0x/client-sdk'
import { WalletConnector } from './utils/walletConnector'
import getTokens, { Token } from './getTokens'

type BuyingQuery = Parameters<typeof buyToken>['0']['query']

async function buy(
  query: BuyingQuery,
  progressCallback: (message: string) => void,
  signer: ReturnType<typeof useSigner>['data']
) {
  // Required parameters to complete the transaction
  if (!signer) {
    throw new ReferenceError('Missing a signer')
  }

  try {
    // Finally we supply these parameters to the buyToken
    // There are a couple of key parameters which we'll dive into
    await buyToken({
      // The expectedPrice is used to protect against price mismatch issues when prices are rapidly changing
      // The expectedPrice can be omitted but the best practice is to supply this
      query,
      signer,
      apiBase: 'https://api-rinkeby.reservoir.tools',
      // The setState callback function is used to update the caller of the buyToken method
      // It passes in a set of steps that the SDK is following to process the transaction
      // It's useful for determining what step we're currently on and displaying a message to the user
      setState: (steps: Execute['steps']) => {
        if (!steps) {
          return
        }

        const currentStep = steps.find((step) => step.status === 'incomplete')
        if (currentStep) {
          progressCallback(currentStep.message || '')
        }
      },
      handleSuccess: () => {
        progressCallback('Success')
      },
      handleError: (error) => {
        progressCallback(`Error: ${error.message}`)
      },
    })

    return true
  } catch (err) {
    console.error(err)
    throw err
  }
}

export default function List() {
  const { data: signer } = useSigner()
  const { data: account } = useAccount()
  const { connectors, isConnected } = useConnect()
  const { activeChain } = useNetwork()
  const [progressText, setProgressText] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [tokens, setTokens] = useState<Token[]>([])
  const [contract, setContract] = useState(
    '0x4d68e14cd7dec510c84326f54ee41f88e8fad59b'
  )
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([])

  const connector = connectors[0]

  const handleOnChange = (tokenId: string) => {
    const selected = selectedTokenIds.includes(tokenId)
    let updatedSelectedTokenIds = selectedTokenIds.slice()

    if (selected) {
      updatedSelectedTokenIds = selectedTokenIds.filter(
        (selectedTokenId) => tokenId !== selectedTokenId
      )
    } else {
      updatedSelectedTokenIds.push(tokenId)
    }

    setSelectedTokenIds(updatedSelectedTokenIds)
  }

  return (
    <>
      <WalletConnector />

      {isConnected && (
        <>
          <label style={{ marginRight: 10 }} htmlFor="listing-price">
            Collection Contract Address
          </label>
          <input
            id="listing-price"
            className="collection-input"
            type="text"
            value={contract}
            placeholder="Contract address"
            onChange={(e) => setContract(e.target.value)}
          />
          <div style={{ marginBottom: 10 }} />
          <button
            onClick={async () => {
              setErrorText('')
              setLoading(true)
              const tokens = await getTokens(contract)
              setLoading(false)
              const filteredTokens = tokens.filter(({ floorAskPrice }) =>
                Boolean(floorAskPrice)
              )
              if (filteredTokens.length === 0) {
                setErrorText(`There are no tokens available to purchase.`)
              }
              setTokens(filteredTokens)
            }}
          >
            Load tokens to buy
          </button>

          {tokens.length > 0 && (
            <>
              <table className="sweep-list">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Price (ETH)</th>
                    <th>Select</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map(({ contract, tokenId, floorAskPrice }, i) => (
                    <tr key={i}>
                      <td>{`${contract}:${tokenId}`}</td>
                      <td>{floorAskPrice}</td>
                      <td>
                        <input
                          type="checkbox"
                          value={tokenId}
                          checked={selectedTokenIds.includes(tokenId)}
                          onChange={() => handleOnChange(tokenId)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                disabled={!isConnected || loading}
                onClick={async () => {
                  setLoading(true)
                  if (activeChain?.id !== 4) {
                    alert(
                      'You are connected to the wrong network. Please, switch to the Rinkeby Test Network.'
                    )

                    setLoading(false)
                    return
                  }

                  if (!account?.address) {
                    setLoading(false)
                    return
                  }

                  if (!isConnected) {
                    await connector.connect()
                  }

                  setProgressText('')
                  const taker = account?.address

                  const query: BuyingQuery = {
                    taker,
                  }

                  selectedTokenIds?.forEach(
                    (tokenId, index) =>
                      //@ts-ignore
                      (query[`tokens[${index}]`] = `${contract}:${tokenId}`)
                  )

                  await buy(query, setProgressText, signer)

                  setLoading(false)
                }}
              >
                Buy Tokens
              </button>
            </>
          )}
        </>
      )}

      {loading && (
        <div className="progress-text">
          <p>Loading...</p>
        </div>
      )}
      {progressText !== '' && (
        <div className="progress-text">
          <p>Progress:</p> {progressText}
        </div>
      )}
      {errorText !== '' && (
        <div className="progress-text">
          <p>{errorText}</p>
        </div>
      )}
    </>
  )
}
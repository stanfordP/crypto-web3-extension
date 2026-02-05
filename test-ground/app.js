// Test Ground Application for Crypto Trading Journal Extension

class TestGroundApp {
  constructor() {
    this.provider = null
    this.currentAccount = null
    this.currentChainId = null
    this.isConnected = false

    this.init()
  }

  init() {
    this.setupEventListeners()
    this.detectProvider()
    this.log('Test ground initialized', 'info')
  }

  detectProvider() {
    if (typeof window.ethereum !== 'undefined') {
      this.provider = window.ethereum
      this.log('Provider detected: ' + (this.provider.isCryptoJournal ? 'Crypto Trading Journal' : 'Standard wallet'), 'success')
      this.setupProviderListeners()
    } else if (typeof window.cryptoJournal !== 'undefined') {
      this.provider = window.cryptoJournal
      this.log('Provider detected: Crypto Trading Journal (custom)', 'success')
      this.setupProviderListeners()
    } else {
      this.log('No Web3 provider detected. Please install the extension or a wallet.', 'error')
      this.disableControls()
    }
  }

  setupEventListeners() {
    // Connect button
    document.getElementById('connectBtn').addEventListener('click', () => this.connect())

    // Disconnect button
    document.getElementById('disconnectBtn').addEventListener('click', () => this.disconnect())

    // Sign message button
    document.getElementById('signBtn').addEventListener('click', () => this.signMessage())

    // Send transaction button
    document.getElementById('sendTxBtn').addEventListener('click', () => this.sendTransaction())

    // Switch network button
    document.getElementById('switchNetworkBtn').addEventListener('click', () => this.switchNetwork())

    // Clear log button
    document.getElementById('clearLogBtn').addEventListener('click', () => this.clearLog())
  }

  setupProviderListeners() {
    if (!this.provider) return

    this.provider.on('connect', (connectInfo) => {
      this.log(`Provider connected: chainId ${connectInfo.chainId}`, 'success')
      this.currentChainId = connectInfo.chainId
      this.updateUI()
    })

    this.provider.on('disconnect', (error) => {
      this.log(`Provider disconnected: ${error?.message || 'Unknown reason'}`, 'warning')
      this.isConnected = false
      this.currentAccount = null
      this.currentChainId = null
      this.updateUI()
    })

    this.provider.on('accountsChanged', (accounts) => {
      this.log(`Accounts changed: ${accounts.length > 0 ? accounts[0] : 'None'}`, 'info')
      if (accounts.length === 0) {
        this.currentAccount = null
        this.isConnected = false
      } else {
        this.currentAccount = accounts[0]
        this.isConnected = true
      }
      this.updateUI()
    })

    this.provider.on('chainChanged', (chainId) => {
      this.log(`Chain changed to: ${chainId} (${this.getNetworkName(chainId)})`, 'info')
      this.currentChainId = chainId
      this.updateUI()
      // Reload the page as recommended by MetaMask
      // window.location.reload()
    })
  }

  async connect() {
    if (!this.provider) {
      this.log('No provider available', 'error')
      return
    }

    try {
      this.log('Requesting account connection...', 'info')

      // Get selected account mode
      const accountMode = document.querySelector('input[name="accountMode"]:checked').value
      this.log(`Selected account mode: ${accountMode}`, 'info')

      const accounts = await this.provider.request({
        method: 'eth_requestAccounts',
        params: [{ accountMode }] // Pass account mode if extension supports it
      })

      if (accounts && accounts.length > 0) {
        this.currentAccount = accounts[0]
        this.isConnected = true

        // Get chain ID
        this.currentChainId = await this.provider.request({ method: 'eth_chainId' })

        this.log(`Connected successfully to ${this.currentAccount}`, 'success')
        this.log(`Current network: ${this.getNetworkName(this.currentChainId)}`, 'info')

        this.updateUI()
      }
    } catch (error) {
      this.log(`Connection failed: ${error.message}`, 'error')
      console.error('Connection error:', error)
    }
  }

  async disconnect() {
    // Note: Not all providers support programmatic disconnect
    // For the extension, this would trigger the background script to clear session

    try {
      if (this.provider.disconnect) {
        await this.provider.disconnect()
        this.log('Disconnected successfully', 'success')
      } else {
        this.log('Provider does not support disconnect method', 'warning')
      }

      this.isConnected = false
      this.currentAccount = null
      this.currentChainId = null
      this.updateUI()
    } catch (error) {
      this.log(`Disconnect failed: ${error.message}`, 'error')
      console.error('Disconnect error:', error)
    }
  }

  async signMessage() {
    if (!this.isConnected) {
      this.log('Please connect wallet first', 'warning')
      return
    }

    const message = document.getElementById('messageInput').value
    if (!message) {
      this.log('Please enter a message to sign', 'warning')
      return
    }

    try {
      this.log(`Requesting signature for: "${message}"`, 'info')

      const signature = await this.provider.request({
        method: 'personal_sign',
        params: [message, this.currentAccount]
      })

      this.log(`Message signed successfully!`, 'success')
      this.log(`Signature: ${signature.substring(0, 20)}...${signature.substring(signature.length - 20)}`, 'info')
      console.log('Full signature:', signature)
    } catch (error) {
      this.log(`Signing failed: ${error.message}`, 'error')
      console.error('Signing error:', error)
    }
  }

  async sendTransaction() {
    if (!this.isConnected) {
      this.log('Please connect wallet first', 'warning')
      return
    }

    const toAddress = document.getElementById('toAddress').value
    const amount = document.getElementById('txAmount').value

    if (!toAddress || !amount) {
      this.log('Please enter valid transaction details', 'warning')
      return
    }

    try {
      this.log(`Preparing transaction: ${amount} ETH to ${toAddress}`, 'info')

      // Convert amount to hex (wei)
      const valueInWei = '0x' + (parseFloat(amount) * 1e18).toString(16)

      const txHash = await this.provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: this.currentAccount,
          to: toAddress,
          value: valueInWei,
          gas: '0x5208' // 21000 gas for simple transfer
        }]
      })

      this.log(`Transaction sent successfully!`, 'success')
      this.log(`Transaction hash: ${txHash}`, 'info')
      console.log('Full tx hash:', txHash)
    } catch (error) {
      this.log(`Transaction failed: ${error.message}`, 'error')
      console.error('Transaction error:', error)
    }
  }

  async switchNetwork() {
    if (!this.provider) {
      this.log('No provider available', 'error')
      return
    }

    const selectedChainId = document.getElementById('networkSelect').value

    try {
      this.log(`Requesting network switch to: ${this.getNetworkName(selectedChainId)}`, 'info')

      await this.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: selectedChainId }]
      })

      this.log(`Network switched successfully to ${this.getNetworkName(selectedChainId)}`, 'success')
    } catch (error) {
      if (error.code === 4902) {
        this.log(`Network not added to wallet. Please add it manually.`, 'warning')
      } else {
        this.log(`Network switch failed: ${error.message}`, 'error')
      }
      console.error('Network switch error:', error)
    }
  }

  updateUI() {
    // Update status
    const statusEl = document.getElementById('status')
    if (this.isConnected) {
      statusEl.textContent = 'Connected'
      statusEl.className = 'px-3 py-1 rounded-full text-sm bg-green-600'
    } else {
      statusEl.textContent = 'Not Connected'
      statusEl.className = 'px-3 py-1 rounded-full text-sm bg-yellow-600'
    }

    // Update address display
    const addressDisplay = document.getElementById('address-display')
    const addressEl = document.getElementById('address')
    if (this.currentAccount) {
      addressDisplay.classList.remove('hidden')
      addressEl.textContent = this.currentAccount
    } else {
      addressDisplay.classList.add('hidden')
      addressEl.textContent = ''
    }

    // Update chain ID display
    const chainIdDisplay = document.getElementById('chainId-display')
    const chainIdEl = document.getElementById('chainId')
    if (this.currentChainId) {
      chainIdDisplay.classList.remove('hidden')
      chainIdEl.textContent = `${this.currentChainId} (${this.getNetworkName(this.currentChainId)})`
    } else {
      chainIdDisplay.classList.add('hidden')
      chainIdEl.textContent = ''
    }

    // Toggle buttons
    const connectBtn = document.getElementById('connectBtn')
    const disconnectBtn = document.getElementById('disconnectBtn')
    if (this.isConnected) {
      connectBtn.classList.add('hidden')
      disconnectBtn.classList.remove('hidden')
    } else {
      connectBtn.classList.remove('hidden')
      disconnectBtn.classList.add('hidden')
    }

    // Enable/disable action buttons
    const actionButtons = ['signBtn', 'sendTxBtn', 'switchNetworkBtn']
    const actionInputs = ['messageInput', 'toAddress', 'txAmount', 'networkSelect']

    actionButtons.forEach(id => {
      const btn = document.getElementById(id)
      if (this.isConnected) {
        btn.disabled = false
      } else {
        btn.disabled = true
      }
    })

    actionInputs.forEach(id => {
      const input = document.getElementById(id)
      if (this.isConnected) {
        input.disabled = false
      } else {
        input.disabled = true
      }
    })
  }

  disableControls() {
    document.getElementById('connectBtn').disabled = true
    document.getElementById('signBtn').disabled = true
    document.getElementById('sendTxBtn').disabled = true
    document.getElementById('switchNetworkBtn').disabled = true
  }

  log(message, type = 'info') {
    const logEl = document.getElementById('eventLog')
    const timestamp = new Date().toLocaleTimeString()

    let colorClass = 'text-gray-300'
    let icon = 'ℹ️'

    switch (type) {
      case 'success':
        colorClass = 'text-green-400'
        icon = '✅'
        break
      case 'error':
        colorClass = 'text-red-400'
        icon = '❌'
        break
      case 'warning':
        colorClass = 'text-yellow-400'
        icon = '⚠️'
        break
      case 'info':
      default:
        colorClass = 'text-blue-400'
        icon = 'ℹ️'
    }

    // Remove "waiting" message if present
    if (logEl.querySelector('.text-gray-500')) {
      logEl.textContent = ''
    }

    const entry = document.createElement('div')
    entry.className = `log-entry mb-2 ${colorClass}`

    // Use textContent for message to prevent XSS
    const timestampSpan = document.createElement('span')
    timestampSpan.className = 'text-gray-500'
    timestampSpan.textContent = `[${timestamp}]`

    entry.appendChild(timestampSpan)
    entry.appendChild(document.createTextNode(` ${icon} ${message}`))

    logEl.appendChild(entry)
    logEl.scrollTop = logEl.scrollHeight

    // Also log to console
    console.log(`[${timestamp}] ${type.toUpperCase()}: ${message}`)
  }

  clearLog() {
    const logEl = document.getElementById('eventLog')
    // Use textContent instead of innerHTML to prevent potential XSS
    logEl.textContent = ''
    const waitingDiv = document.createElement('div')
    waitingDiv.className = 'text-gray-500'
    waitingDiv.textContent = 'Log cleared. Waiting for events...'
    logEl.appendChild(waitingDiv)
    this.log('Log cleared', 'info')
  }

  getNetworkName(chainId) {
    const networks = {
      '0x1': 'Ethereum Mainnet',
      '0x89': 'Polygon',
      '0xa4b1': 'Arbitrum One',
      '0xa': 'Optimism',
      '0x5': 'Goerli Testnet',
      '0xaa36a7': 'Sepolia Testnet'
    }
    return networks[chainId] || `Unknown (${chainId})`
  }
}

// Initialize app when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.testApp = new TestGroundApp()
  })
} else {
  window.testApp = new TestGroundApp()
}

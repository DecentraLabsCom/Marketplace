export const contractABI = [
    // Add the ABI of your smart contract here
    {
      "constant": true,
      "inputs": [{ "name": "wallet", "type": "address" }],
      "name": "hasActiveBooking",
      "outputs": [{ "name": "", "type": "bool" }],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    }
  ];
  
  export const contractAddress = "YOUR_SMART_CONTRACT_ADDRESS";
# Tokenize and list your lab

The DecentraLabs Marketplace offers two main approaches for tokenizing your laboratory:

#### 1. Full Setup (recommended for beginners)

This option allows you to input all laboratory data directly through the web interface in the marketplace; particularly in the **Lab Panel** ssection (which becomes visible and accessible once you are registered as a provider). This approach stores essential information on-chain while keeping detailed metadata accessible through decentralized storage.

**Steps:**

1. **Access the Web Form**
   * Connect your Web3 wallet
   * Ensure you're on the correct network (Sepolia for testing, Ethereum for production)
   * Navigate to the "Lab Panel" section on the navbar
   * Click on the "Add a New Lab" button on the bottom right
   * Choose the "Full Setup" tab in the modal
2. **Fill Out the Full Setup Form**
   * **Basic Information**: Laboratory name, description, keywords, category...
   * **Pricing and availability**: Hourly rates, available time slots, opening and closing dates
   * **Access Information**: Connection details, credentials
   * **Media Files**: Upload images, documentation, user guides
3. **Review and Submit**
   * Confirm all information is accurate
   * Submit the transaction and pay gas fees
   * Wait for blockchain confirmation
4. **Verification**
   * Your laboratory token will be minted on-chain
   * The marketplace will automatically generate metadata storage
   * Your lab becomes immediately available for booking (if the opening date is not later than the current date)

**Advantages:**

* Simple, guided process
* No technical knowledge of JSON or file hosting required
* Automatic metadata management
* Immediate publication after transaction confirmation

#### 2. Quick Setup (for technical users)

This option is designed for users who prefer to manage their metadata externally or want more control over their data storage. This approach requires only essential on-chain data while referencing external metadata.

**Steps:**

1.  **Prepare Your Metadata File**

    Create a JSON file with your laboratory details following the structure described on the [Tokenized Labs](https://app.gitbook.com/o/JuYQps1HQOxaULtfsWTC/s/PE433sWl3ju7auqqYpTP/) section.
2.  **Host Your Metadata File**

    Make your JSON file publicly accessible through one of these options:

    **Decentralized options:**

    *   **IPFS**: Upload to IPFS and use the resulting hash URL

        ```
        https://ipfs.io/ipfs/QmYourHashHere
        ```
    * **Arweave**: Permanent storage solution
    * **Other decentralized storage networks**

    **Centralized options:**

    *   **GitHub Gist**: Create a public gist with your JSON

        ```
        https://gist.githubusercontent.com/username/gist-id/raw/file.json
        ```
    * **Your own server**: Host the file on your domain
    * **Cloud storage**: Use services like AWS S3, Google Cloud Storage (with public access)
3. **Access to the Web Form**
   * Connect your Web3 wallet
   * Ensure you're on the correct network (Sepolia for testing, Ethereum for production)
   * Navigate to the "Lab Panel" section on the navbar
   * Click on the "Add a New Lab" button on the bottom right
   * Choose the "Quick Setup" tab in the modal
4. **Complete the Quick Setup Form**
   * **Basic on-chain data**: Fill the web form with hourly rate
   * **Metadata URL**: Provide the public URL to your JSON file
5. **Review and Submit**
   * Confirm all information is accurate
   * Submit the transaction and pay gas fees
   * Wait for blockchain confirmation
6. **Verification**
   * Your laboratory token will be minted on-chain
   * Your lab becomes immediately available for booking (if the opening date is not later than the current date)

**Advantages:**

* Greater control over metadata storage
* Decentralized support for metadata storage
* Immediate publication after transaction confirmation

### Post-Tokenization Management

#### Updating Information

* **Full Setup**: Updates only require new transactions when onchain data is modified
* **Quick Setup**: Since all data in this form is stored onchain, any change will trigger and require a new transaction. However, you can still modify your offchain data by simply editing the JSON file in your storage service. Note that IPFS storage will not allow you to modify the file; instead, you will have to upload a new one with the updated info, get its new hash URL, paste it in the Quick Setup form, and execute a transaction to inform the smart contract about the new URL

#### Important Tips for Support and Maintenance

* Provide responsive user support for potential lab availability issues
* Maintain laboratory equipment and software
* Ensure proper lab illumination, reliable internet connectivity and access systems

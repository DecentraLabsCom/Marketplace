---
description: >-
  Learn how to access and use laboratories from the DecentraLabs marketplace
---

# Access Laboratories

DecentraLabs provides a decentralized marketplace where you can discover, book, and access remote laboratories from institutions worldwide. Whether you're a student, researcher, or professional, our platform makes it easy to gain hands-on experience with specialized equipment and environments without geographical limitations.

All bookings are managed through blockchain smart contracts, ensuring transparency, security, and automated payment processing. Once your reservation is confirmed, you'll have guaranteed access to the lab during your allocated time slot.

This guide will walk you through the entire process, from connecting your wallet to accessing your reserved laboratory.

> 📝 **Note:** This guide covers the process for users connecting via **Web3 wallet**. The process for accessing labs using **institutional SSO credentials** will be documented separately once fully implemented.

---

## Prerequisites

Before you can book and access a laboratory, you'll need:

1. **A Web3 Wallet**\
   Such as MetaMask, WalletConnect, or any compatible Ethereum wallet. This wallet will be used to:
   * Authenticate your identity
   * Sign reservation transactions
   * Hold $LAB tokens for payment

2. **$LAB and Network-Specific Tokens**\
   Sufficient $LAB tokens to cover the cost of your reservation and network-specific tokens to pay for the gas. Lab pricing is displayed in $LAB per hour on each lab's detail page.

3. **Browser Requirements**\
   A modern web browser with JavaScript enabled.

---

## Step-by-Step Guide

### 1. Connect Your Wallet

Navigate to the [DecentraLabs Marketplace](https://marketplace.decentralabs.com) and click the **"Connect Wallet"** button in the top right corner.

![Connect Wallet](.gitbook/assets/connect-wallet.png)

Select your preferred wallet provider from the list:
* MetaMask
* WalletConnect

Once connected, your wallet address will be displayed, and you'll have access to all marketplace features.

---

### 2. Browse and Select a Laboratory

Explore the available laboratories on the marketplace homepage. Each lab card displays:
* Lab name and provider
* Price in $LAB per hour
* Category and keywords
* Availability status

Click on any lab card to view its detailed information page.

![Lab Details and Book Button](.gitbook/assets/lab-details-book.png)

On the lab detail page, you'll find:
* Comprehensive lab description
* Available equipment and software
* Documentation and user guides
* Provider information
* Booking button

Review the lab information carefully to ensure it meets your needs. When ready, click the **"Book Lab"** button.

---

### 3. Select Date and Time

After clicking "Book Lab," you'll be taken to the reservation page where you can:

1. **Choose a date** from the calendar
2. **Select a time slot** (start time)
3. **Choose duration** (available time slots: 15 min, 30 min, 1 hour, or custom)

![Booking Calendar](.gitbook/assets/booking-calendar.png)

The system will show you:
* Total cost in $LAB tokens
* Available time slots (unavailable times are grayed out)
* Any scheduling conflicts

Once you've configured your reservation, click **"Request Booking"** to proceed.

---

### 4. Sign the Transaction

Your wallet will prompt you to sign a blockchain transaction to record your reservation request.

![Sign Transaction](.gitbook/assets/sign-transaction.png)

**Important details:**
* Review the transaction details carefully (lab ID, time slot, cost)
* Ensure you have enough $LAB tokens for the reservation
* Confirm you have sufficient ETH for gas fees
* The transaction will transfer $LAB tokens to the smart contract as payment

Click **"Sign"** or **"Confirm"** in your wallet to proceed.

> ⚠️ **Note:** Once signed, the transaction cannot be reversed. Make sure all details are correct before confirming.

---

### 5. Wait for Confirmation

After signing the transaction, two things need to happen:

#### a) On-chain Recording (Almost Immediate)
Your reservation request is first recorded on the blockchain. This typically takes 10-30 seconds depending on network congestion. You'll see a status indicator showing:

```
⏳ Recording reservation on-chain...
```

#### b) Provider Confirmation (Variable)
Once recorded on-chain, the lab provider must confirm your reservation. This is an automated process managed by the provider's infrastructure and is expected to take 20-40 seconds, but timing can vary:

```
⏳ Waiting for provider confirmation...
```

![Confirmation Process](.gitbook/assets/confirmation-waiting.png)

You can monitor the status in real-time on your **User Dashboard** under "Active Bookings."

✅ Once confirmed, you'll receive a notification and your reservation status will change to **"Confirmed"**. The booking is now guaranteed and recorded immutably on-chain.

---

### 6. Access Your Laboratory

On the scheduled date and time of your reservation, follow these steps to access your lab:

#### a) Locate the Lab
Go to your **User Dashboard** and locate your active booking under "Active Bookings.", or just slocate the lab you have a reservation for in the marketplace's homepage.

#### b) Wait for Access Time
The **"Access Lab"** button will become active at your scheduled start time (not before).

![Access Lab Button](.gitbook/assets/access-lab-button.png)

#### c) Click "Access Lab"
When the button becomes active:
1. Click **"Access Lab"**
2. The system will verify your reservation on-chain
3. You'll be redirected to the lab's remote desktop interface

#### d) Connect to the Lab
You'll be presented with a remote desktop session running the laboratory environment. You will see:
* A web-based remote desktop app
* Pre-configured software and instruments
* Video feedback from the lab

![Lab Remote Desktop](.gitbook/assets/lab-remote-desktop.png)

#### e) During Your Session
* Your access is valid for the entire duration you booked
* The session timer will show your remaining time (To be implemented)
* You can disconnect and reconnect during your allocated period
* You can save and download the data generated during your experimentation session (depending on lab configuration)

#### f) Session End
When your reserved time expires:
* You'll receive a warning 5 minutes before the end 
* The session will automatically close at the end time
* Make sure to save any important work before time runs out

---

## Frequently Asked Questions

### What happens if the provider doesn't confirm my reservation?

If a provider fails to confirm your reservation within a reasonable timeframe (typically 24 hours), you can cancel the booking through your dashboard. You are not charged $LAB tokens until the provider confirms the reservation, so no refund is needed in if you cancel before confirmation.

### Can I cancel a confirmed reservation?

Yes, but cancellation policies depend on timing:
* **More than 24 hours before:** Full refund (minus a small processing fee)
* **Less than 24 hours before:** Partial refund (50%)
* **No-show (no cancellation):** No refund

Always check the specific lab's cancellation policy on its detail page.

### What if I can't access the lab at my scheduled time?

First, check that:
1. Your reservation is confirmed (check dashboard)
2. It's within your allocated time window
3. Your wallet is still connected

If problems persist, contact the lab provider directly through the marketplace messaging system or reach out to DecentraLabs support.

### Can I extend my session?

Currently, session extensions must be booked as a separate reservation. Make sure to book consecutive time slots if you need more time. A "extend session" feature is planned for future releases.

### What happens if I lose connection during my session?

You can reconnect at any time during your allocated period by clicking "Access Lab" again from the marketplace. Your session and any unsaved work may be preserved depending on the lab's configuration.

---

## Coming Soon: Institutional SSO Access

We're developing a streamlined access method for users from partner institutions using **federated Single Sign-On (SSO)** via eduGAIN. This will allow:

* Passwordless access using your institutional credentials
* Automatic verification of your academic/research status
* Simplified billing and payment through your institution
* No need for a personal Web3 wallet

Stay tuned for updates on institutional access methods!

---

## Summary

Accessing laboratories through DecentraLabs is straightforward:

1. ✅ Connect your Web3 wallet
2. 🔍 Browse and select a laboratory
3. 📅 Choose your date and time
4. ✍️ Sign the blockchain transaction
5. ⏳ Wait for on-chain recording and provider confirmation
6. 🚀 Access your lab at the scheduled time

The entire process is secured by blockchain smart contracts, ensuring transparency, guaranteed access, and automated payment handling. Happy experimenting!

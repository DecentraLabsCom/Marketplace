---
description: >-
  Learn how institutional users reserve and access laboratories in the
  DecentraLabs marketplace.
---

# Access Laboratories

DecentraLabs provides an institutional marketplace where students, researchers, and staff can reserve and access remote laboratories operated by integrated providers.

Customer access in the marketplace now follows a managed institutional model:

* users authenticate with their institution;
* reservations are handled through the marketplace and institutional backend;
* laboratory access is granted through short-lived gateway tokens issued after reservation checks.

Personal wallet login is not part of the customer access flow described in this guide.

---

## Prerequisites

Before you can reserve and access a laboratory, you need:

1. **Institutional access**\
   Your institution must be integrated with DecentraLabs and you must be able to sign in through the institutional login flow.

2. **Available service-credit entitlement**\
   Your institution or provider configuration must allow the reservation you want to make.

3. **Browser requirements**\
   A modern browser with JavaScript enabled.

---

## Step-by-Step Guide

### 1. Sign in with Your Institution

Navigate to the [DecentraLabs Marketplace](https://marketplace.decentralabs.com) and use **Institutional Login**.

After a successful sign-in, the marketplace creates an institutional session for your user and loads the reservations and credits available to your organization.

---

### 2. Browse and Select a Laboratory

Explore the laboratories listed on the marketplace homepage. Each lab card shows:

* lab name and provider;
* price or credit consumption model;
* category and keywords;
* availability status.

Open the laboratory details page to review:

* description and documentation;
* supported equipment or software;
* provider information;
* booking and access requirements.

---

### 3. Reserve a Time Slot

From the reservation page, choose:

1. a date;
2. a start time;
3. a duration.

The marketplace shows:

* available slots;
* estimated credit usage;
* reservation constraints or conflicts.

Submit the reservation request to continue.

---

### 4. Wait for Reservation Confirmation

Once the reservation request is submitted:

1. the marketplace records and validates the request against the configured backend and reservation model;
2. the provider side completes confirmation and scheduling;
3. the booking appears in your **User Dashboard**.

When confirmation succeeds, the reservation status changes to **Confirmed**.

---

### 5. Access the Laboratory

At the scheduled time:

1. go to your **User Dashboard** or the lab page;
2. locate the active reservation;
3. click **Access** when the reservation window is open.

The marketplace then:

* validates the active reservation;
* performs institutional check-in when required;
* requests a short-lived lab access token from the configured lab gateway;
* redirects you to the remote lab interface.

---

### 6. During the Session

During the reserved window:

* you can use the remote interface exposed by the provider;
* you may reconnect while the reservation remains active, depending on provider policy;
* you should save any work before the reservation end time.

At the end of the reservation window, access is closed automatically by the provider-side access controls.

---

## Frequently Asked Questions

### What if my institution is not integrated?

You will not be able to use the institutional customer flow until your institution is configured in the platform.

### What if the reservation is not confirmed?

Check your **User Dashboard** for the current status. If the reservation remains pending or fails, contact the provider or platform support according to your institution's support path.

### Can I access the lab before the start time?

No. Access is granted only during the valid reservation window.

### What if I lose connection during the session?

If the reservation is still active, you can return to the marketplace and use **Access** again. Reconnection behavior depends on the provider configuration.

---

## Summary

The customer laboratory-access flow is:

1. sign in with your institution;
2. choose and reserve a lab;
3. wait for confirmation;
4. access the lab during the active reservation window;
5. use the session until the reservation ends.

This keeps customer authentication and access aligned with the institutional and managed-custody model used by the current marketplace.

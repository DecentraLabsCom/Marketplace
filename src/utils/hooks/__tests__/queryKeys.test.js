/**
 * Unit Tests for queryKeys utilities
 *
 * Pure utility functions that generate React Query cache keys - perfect for unit testing.
 * No side effects, no external dependencies, just input → output transformations.
 *
 * Test Behaviors:
 * - All key generators return arrays with proper structure
 * - Parameters are correctly serialized in cache keys
 * - Default parameter values work as expected
 * - Special logic (sorting, flags) produces consistent results
 * - Key uniqueness across different parameter combinations
 */

import {
  bookingQueryKeys,
  labQueryKeys,
  userQueryKeys,
  providerQueryKeys,
  metadataQueryKeys,
  labImageQueryKeys,
} from "../queryKeys";

describe("queryKeys", () => {
  describe("bookingQueryKeys", () => {
    test("all() returns base booking key", () => {
      const result = bookingQueryKeys.all();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual(["bookings"]);
    });

    test("byUser() includes user address", () => {
      const address = "0x123";
      const result = bookingQueryKeys.byUser(address);

      expect(result).toEqual(["bookings", "user", "0x123"]);
    });

    test("byLab() includes lab ID", () => {
      const labId = "42";
      const result = bookingQueryKeys.byLab(labId);

      expect(result).toEqual(["bookings", "lab", "42"]);
    });

    test("byReservationKey() includes reservation key", () => {
      const key = "reservation-123";
      const result = bookingQueryKeys.byReservationKey(key);

      expect(result).toEqual(["bookings", "reservation", "reservation-123"]);
    });

    test("userComposed() includes address and includeDetails flag", () => {
      const address = "0x456";
      const result = bookingQueryKeys.userComposed(address, true);

      expect(result).toEqual(["bookings", "user-composed", "0x456", true]);
    });

    test("userComposed() defaults includeDetails to false", () => {
      const address = "0x456";
      const result = bookingQueryKeys.userComposed(address);

      expect(result).toEqual(["bookings", "user-composed", "0x456", false]);
    });

    test("labComposed() includes labId and includeMetrics flag", () => {
      const labId = "10";
      const result = bookingQueryKeys.labComposed(labId, false);

      expect(result).toEqual(["bookings", "lab-composed", "10", false]);
    });

    test("labComposed() defaults includeMetrics to true", () => {
      const labId = "10";
      const result = bookingQueryKeys.labComposed(labId);

      expect(result).toEqual(["bookings", "lab-composed", "10", true]);
    });

    test("multiLab() sorts lab IDs for consistent caching", () => {
      const labIds = ["3", "1", "2"];
      const result = bookingQueryKeys.multiLab(labIds, true);

      expect(result).toEqual(["bookings", "multi-lab", ["1", "2", "3"], true]);
    });

    test("multiLab() defaults includeMetrics to false", () => {
      const labIds = ["1", "2"];
      const result = bookingQueryKeys.multiLab(labIds);

      expect(result).toEqual(["bookings", "multi-lab", ["1", "2"], false]);
    });

    test("userReservationsComplete() includes userAddress and limit", () => {
      const address = "0x789";
      const limit = 10;
      const result = bookingQueryKeys.userReservationsComplete(address, limit);

      expect(result).toEqual([
        "bookings",
        "userReservationsComplete",
        "0x789",
        10,
      ]);
    });

    test("getReservationsOfToken() includes labId", () => {
      const labId = "5";
      const result = bookingQueryKeys.getReservationsOfToken(labId);

      expect(result).toEqual(["bookings", "reservationsOfToken", "5"]);
    });

    test("getReservationOfTokenByIndex() includes labId and index", () => {
      const labId = "5";
      const index = 2;
      const result = bookingQueryKeys.getReservationOfTokenByIndex(
        labId,
        index
      );

      expect(result).toEqual(["bookings", "reservationOfToken", "5", 2]);
    });

    test("reservationsOf() includes userAddress", () => {
      const address = "0xabc";
      const result = bookingQueryKeys.reservationsOf(address);

      expect(result).toEqual(["bookings", "reservationsOf", "0xabc"]);
    });

    test("reservationKeyOfUserByIndex() includes userAddress and index", () => {
      const address = "0xdef";
      const index = 3;
      const result = bookingQueryKeys.reservationKeyOfUserByIndex(
        address,
        index
      );

      expect(result).toEqual(["bookings", "reservationKeyOfUser", "0xdef", 3]);
    });

    test("getReservationsOfTokenByUser() includes labId, user, offset and limit", () => {
      const labId = "7";
      const user = "0xabc";
      const offset = 10;
      const limit = 20;
      const result = bookingQueryKeys.getReservationsOfTokenByUser(
        labId,
        user,
        offset,
        limit
      );

      expect(result).toEqual([
        "bookings",
        "reservationsOfTokenByUser",
        "7",
        "0xabc",
        10,
        20,
      ]);
    });

    test("totalReservations() returns static key", () => {
      const result = bookingQueryKeys.totalReservations();

      expect(result).toEqual(["bookings", "totalReservations"]);
    });

    test("userOfReservation() includes reservationKey", () => {
      const key = "res-456";
      const result = bookingQueryKeys.userOfReservation(key);

      expect(result).toEqual(["bookings", "userOfReservation", "res-456"]);
    });

    test("checkAvailable() includes labId, start, and duration", () => {
      const labId = "8";
      const start = 1234567890;
      const duration = 3600;
      const result = bookingQueryKeys.checkAvailable(labId, start, duration);

      expect(result).toEqual([
        "bookings",
        "checkAvailable",
        "8",
        1234567890,
        3600,
      ]);
    });

    test("hasActiveBooking() includes userAddress", () => {
      const address = "0x111";
      const result = bookingQueryKeys.hasActiveBooking(address);

      expect(result).toEqual(["bookings", "hasActiveBooking", "0x111"]);
    });

    test("hasActiveBookingByToken() includes labId", () => {
      const labId = "12";
      const result = bookingQueryKeys.hasActiveBookingByToken(labId);

      expect(result).toEqual(["bookings", "hasActiveBookingByToken", "12"]);
    });

    test("activeReservationKeyForUser() includes labId and userAddress", () => {
      const labId = "9";
      const address = "0x222";
      const result = bookingQueryKeys.activeReservationKeyForUser(
        labId,
        address
      );

      expect(result).toEqual([
        "bookings",
        "activeReservationKey",
        "9",
        "0x222",
      ]);
    });

    test("labTokenAddress() returns static key", () => {
      const result = bookingQueryKeys.labTokenAddress();

      expect(result).toEqual(["bookings", "labTokenAddress"]);
    });

    test("safeBalance() includes userAddress", () => {
      const address = "0x333";
      const result = bookingQueryKeys.safeBalance(address);

      expect(result).toEqual(["bookings", "safeBalance", "0x333"]);
    });
  });

  describe("labQueryKeys", () => {
    test("all() returns base lab key", () => {
      const result = labQueryKeys.all();

      expect(result).toEqual(["labs"]);
    });

    test("list() returns labs list key", () => {
      const result = labQueryKeys.list();

      expect(result).toEqual(["labs", "list"]);
    });

    test("byId() includes labId", () => {
      const labId = "15";
      const result = labQueryKeys.byId(labId);

      expect(result).toEqual(["labs", "data", "15"]);
    });

    test("owner() includes labId", () => {
      const labId = "20";
      const result = labQueryKeys.owner(labId);

      expect(result).toEqual(["labs", "owner", "20"]);
    });

    test("metadata() includes uri", () => {
      const uri = "ipfs://abc123";
      const result = labQueryKeys.metadata(uri);

      expect(result).toEqual(["labs", "metadata", "ipfs://abc123"]);
    });

    test("decimals() returns static key", () => {
      const result = labQueryKeys.decimals();

      expect(result).toEqual(["labs", "decimals"]);
    });

    test("getAllLabs() returns static key", () => {
      const result = labQueryKeys.getAllLabs();

      expect(result).toEqual(["labs", "getAllLabs"]);
    });

    test("getLab() includes labId", () => {
      const labId = "25";
      const result = labQueryKeys.getLab(labId);

      expect(result).toEqual(["labs", "getLab", "25"]);
    });

    test("balanceOf() includes ownerAddress", () => {
      const address = "0x444";
      const result = labQueryKeys.balanceOf(address);

      expect(result).toEqual(["labs", "balanceOf", "0x444"]);
    });

    test("ownerOf() includes labId", () => {
      const labId = "30";
      const result = labQueryKeys.ownerOf(labId);

      expect(result).toEqual(["labs", "ownerOf", "30"]);
    });

    test("tokenOfOwnerByIndex() includes ownerAddress and index", () => {
      const address = "0x555";
      const index = 4;
      const result = labQueryKeys.tokenOfOwnerByIndex(address, index);

      expect(result).toEqual(["labs", "tokenOfOwnerByIndex", "0x555", 4]);
    });

    test("tokenURI() includes labId", () => {
      const labId = "35";
      const result = labQueryKeys.tokenURI(labId);

      expect(result).toEqual(["labs", "tokenURI", "35"]);
    });

    test("isTokenListed() includes labId", () => {
      const labId = "40";
      const result = labQueryKeys.isTokenListed(labId);

      expect(result).toEqual(["labs", "isTokenListed", "40"]);
    });

    test("derivedByLabId() returns derived keys for lab invalidation", () => {
      const labId = "42";
      const result = labQueryKeys.derivedByLabId(labId);

      expect(result).toEqual([
        ["labs", "getLab", "42"],
        ["labs", "tokenURI", "42"],
        ["labs", "isTokenListed", "42"],
        ["labs", "ownerOf", "42"],
      ]);
    });

    test("labsForMarket() returns specialized market key", () => {
      const result = labQueryKeys.labsForMarket();

      expect(result).toEqual(["labs", "specialized", "market"]);
    });

    test("labsForProvider() includes ownerAddress", () => {
      const address = "0x666";
      const result = labQueryKeys.labsForProvider(address);

      expect(result).toEqual(["labs", "specialized", "provider", "0x666"]);
    });

    test("labsForReservation() returns specialized reservation key", () => {
      const result = labQueryKeys.labsForReservation();

      expect(result).toEqual(["labs", "specialized", "reservation"]);
    });

    test("labById() includes labId", () => {
      const labId = "45";
      const result = labQueryKeys.labById(labId);

      expect(result).toEqual(["labs", "specialized", "byId", "45"]);
    });
  });

  describe("userQueryKeys", () => {
    test("all() returns base user key", () => {
      const result = userQueryKeys.all();

      expect(result).toEqual(["users"]);
    });

    test("byAddress() includes address", () => {
      const address = "0x777";
      const result = userQueryKeys.byAddress(address);

      expect(result).toEqual(["user", "profile", "0x777"]);
    });

    test("providerStatus() includes address", () => {
      const address = "0x888";
      const result = userQueryKeys.providerStatus(address);

      expect(result).toEqual(["provider", "status", "0x888"]);
    });

    test("ssoSession() returns static key", () => {
      const result = userQueryKeys.ssoSession();

      expect(result).toEqual(["auth", "sso", "session"]);
    });
  });

  describe("providerQueryKeys", () => {
    test("all() returns base provider key", () => {
      const result = providerQueryKeys.all();

      expect(result).toEqual(["providers"]);
    });

    test("list() returns providers list key", () => {
      const result = providerQueryKeys.list();

      expect(result).toEqual(["providers", "list"]);
    });

    test("byAddress() includes address", () => {
      const address = "0x999";
      const result = providerQueryKeys.byAddress(address);

      expect(result).toEqual(["provider", "profile", "0x999"]);
    });

    test("status() includes identifier and isEmail flag", () => {
      const identifier = "user@example.com";
      const result = providerQueryKeys.status(identifier, true);

      expect(result).toEqual(["provider", "status", "user@example.com", true]);
    });

    test("status() defaults isEmail to false", () => {
      const identifier = "0xaaa";
      const result = providerQueryKeys.status(identifier);

      expect(result).toEqual(["provider", "status", "0xaaa", false]);
    });

    test("name() includes wallet address", () => {
      const wallet = "0xbbb";
      const result = providerQueryKeys.name(wallet);

      expect(result).toEqual(["provider", "name", "0xbbb"]);
    });

    test("getLabProviders() returns static key", () => {
      const result = providerQueryKeys.getLabProviders();

      expect(result).toEqual(["providers", "getLabProviders"]);
    });

    test("isLabProvider() includes address", () => {
      const address = "0xccc";
      const result = providerQueryKeys.isLabProvider(address);

      expect(result).toEqual(["providers", "isLabProvider", "0xccc"]);
    });
  });

  describe("metadataQueryKeys", () => {
    test("all() returns base metadata key", () => {
      const result = metadataQueryKeys.all();

      expect(result).toEqual(["metadata"]);
    });

    test("byUri() includes uri", () => {
      const uri = "https://example.com/metadata.json";
      const result = metadataQueryKeys.byUri(uri);

      expect(result).toEqual(["metadata", "https://example.com/metadata.json"]);
    });
  });

  describe("labImageQueryKeys", () => {
    test("all() returns base labImage key", () => {
      const result = labImageQueryKeys.all();

      expect(result).toEqual(["labImage"]);
    });

    test("byUrl() includes imageUrl", () => {
      const imageUrl = "https://example.com/lab.jpg";
      const result = labImageQueryKeys.byUrl(imageUrl);

      expect(result).toEqual(["labImage", "https://example.com/lab.jpg"]);
    });
  });

  describe("Key uniqueness", () => {
    test("different parameters generate different booking keys", () => {
      const key1 = bookingQueryKeys.byUser("0x111");
      const key2 = bookingQueryKeys.byUser("0x222");

      expect(key1).not.toEqual(key2);
    });

    test("different parameters generate different lab keys", () => {
      const key1 = labQueryKeys.byId("1");
      const key2 = labQueryKeys.byId("2");

      expect(key1).not.toEqual(key2);
    });

    test("multiLab sorting ensures consistent keys regardless of input order", () => {
      const key1 = bookingQueryKeys.multiLab(["3", "1", "2"]);
      const key2 = bookingQueryKeys.multiLab(["1", "2", "3"]);
      const key3 = bookingQueryKeys.multiLab(["2", "3", "1"]);

      expect(key1).toEqual(key2);
      expect(key2).toEqual(key3);
    });
  });
});

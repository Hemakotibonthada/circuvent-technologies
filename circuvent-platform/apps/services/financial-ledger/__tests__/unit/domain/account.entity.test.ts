// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Account Entity (Financial Ledger)
// Tests debit/credit behavior for different account types.
// ══════════════════════════════════════════════════════════════════════════════

import { AccountEntity, AccountType, AccountSubType } from "../../../src/domain/entities/account.entity";
import { MoneyVO } from "../../../src/domain/value-objects/money.vo";

function createAccount(type: AccountType, balance: number = 0): AccountEntity {
  return new AccountEntity({
    id: `acc-${type}`,
    code: type === AccountType.ASSET ? "1100" : type === AccountType.LIABILITY ? "2100" : type === AccountType.REVENUE ? "4100" : type === AccountType.EXPENSE ? "6100" : "3100",
    name: `Test ${type}`,
    type,
    subType: AccountSubType.CASH,
    balance,
  });
}

describe("AccountEntity", () => {
  describe("Normal Balance", () => {
    it("ASSET has DEBIT normal balance", () => {
      const acc = createAccount(AccountType.ASSET);
      expect(acc.normalBalance).toBe("DEBIT");
    });

    it("EXPENSE has DEBIT normal balance", () => {
      const acc = createAccount(AccountType.EXPENSE);
      expect(acc.normalBalance).toBe("DEBIT");
    });

    it("LIABILITY has CREDIT normal balance", () => {
      const acc = createAccount(AccountType.LIABILITY);
      expect(acc.normalBalance).toBe("CREDIT");
    });

    it("REVENUE has CREDIT normal balance", () => {
      const acc = createAccount(AccountType.REVENUE);
      expect(acc.normalBalance).toBe("CREDIT");
    });

    it("EQUITY has CREDIT normal balance", () => {
      const acc = createAccount(AccountType.EQUITY);
      expect(acc.normalBalance).toBe("CREDIT");
    });
  });

  describe("Debit/Credit Operations", () => {
    it("Debit INCREASES Asset balance", () => {
      const acc = createAccount(AccountType.ASSET, 1000);
      acc.debit(MoneyVO.of(500));
      expect(acc.balance.toMajor()).toBe(1500);
    });

    it("Credit DECREASES Asset balance", () => {
      const acc = createAccount(AccountType.ASSET, 1000);
      acc.credit(MoneyVO.of(300));
      expect(acc.balance.toMajor()).toBe(700);
    });

    it("Debit DECREASES Liability balance", () => {
      const acc = createAccount(AccountType.LIABILITY, 1000);
      acc.debit(MoneyVO.of(400));
      expect(acc.balance.toMajor()).toBe(600);
    });

    it("Credit INCREASES Liability balance", () => {
      const acc = createAccount(AccountType.LIABILITY, 1000);
      acc.credit(MoneyVO.of(500));
      expect(acc.balance.toMajor()).toBe(1500);
    });

    it("Debit INCREASES Expense balance", () => {
      const acc = createAccount(AccountType.EXPENSE, 0);
      acc.debit(MoneyVO.of(75000));
      expect(acc.balance.toMajor()).toBe(75000);
    });

    it("Credit INCREASES Revenue balance", () => {
      const acc = createAccount(AccountType.REVENUE, 0);
      acc.credit(MoneyVO.of(100000));
      expect(acc.balance.toMajor()).toBe(100000);
    });
  });

  describe("Account Classification", () => {
    it("should identify Balance Sheet accounts", () => {
      expect(createAccount(AccountType.ASSET).isBalanceSheet()).toBe(true);
      expect(createAccount(AccountType.LIABILITY).isBalanceSheet()).toBe(true);
      expect(createAccount(AccountType.EQUITY).isBalanceSheet()).toBe(true);
    });

    it("should identify Income Statement accounts", () => {
      expect(createAccount(AccountType.REVENUE).isIncomeStatement()).toBe(true);
      expect(createAccount(AccountType.EXPENSE).isIncomeStatement()).toBe(true);
    });

    it("Revenue is NOT on Balance Sheet", () => {
      expect(createAccount(AccountType.REVENUE).isBalanceSheet()).toBe(false);
    });
  });

  describe("Validation", () => {
    it("should reject posting to group (non-postable) account", () => {
      const acc = new AccountEntity({
        id: "group", code: "1000", name: "Assets (Group)", type: AccountType.ASSET,
        subType: AccountSubType.CASH, isPostable: false,
      });
      expect(() => acc.debit(MoneyVO.of(100))).toThrow("not postable");
    });

    it("should reject posting to inactive account", () => {
      const acc = new AccountEntity({
        id: "inactive", code: "1999", name: "Closed Account", type: AccountType.ASSET,
        subType: AccountSubType.CASH, active: false,
      });
      expect(() => acc.credit(MoneyVO.of(100))).toThrow("inactive");
    });
  });
});

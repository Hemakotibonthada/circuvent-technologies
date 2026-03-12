// ══════════════════════════════════════════════════════════════════════════════
// Financial Ledger — GST Calculation Engine
// Handles CGST, SGST, IGST computation for Indian goods and services.
// Supports HSN/SAC code-based rate lookup and reverse charge mechanism.
// ══════════════════════════════════════════════════════════════════════════════

import { MoneyVO } from "../value-objects/money.vo";

/**
 * GST rate slabs as per Indian GST law.
 */
export type GSTRate = 0 | 0.25 | 3 | 5 | 12 | 18 | 28;

/**
 * GST computation result.
 */
export interface GSTComputation {
  /** Original base amount (exclusive of tax) */
  baseAmount: MoneyVO;
  /** GST rate applied */
  rate: GSTRate;
  /** Whether this is inter-state (IGST) or intra-state (CGST+SGST) */
  isInterState: boolean;
  /** Central GST (half of total GST for intra-state) */
  cgst: MoneyVO;
  /** State GST (half of total GST for intra-state) */
  sgst: MoneyVO;
  /** Integrated GST (full GST for inter-state) */
  igst: MoneyVO;
  /** Total GST amount */
  totalGST: MoneyVO;
  /** Grand total (base + GST) */
  grandTotal: MoneyVO;
  /** HSN/SAC code for the product/service */
  hsnSacCode?: string;
  /** Whether reverse charge applies */
  reverseCharge: boolean;
}

/**
 * GST Return summary for GSTR-3B filing.
 */
export interface GSTR3BSummary {
  /** Filing period (e.g., "March 2026") */
  period: string;
  /** Tax on outward supplies (sales) */
  outputTax: {
    taxableValue: MoneyVO;
    cgst: MoneyVO;
    sgst: MoneyVO;
    igst: MoneyVO;
  };
  /** Input tax credit (purchases) */
  inputCredit: {
    cgst: MoneyVO;
    sgst: MoneyVO;
    igst: MoneyVO;
  };
  /** Net liability (output - input) */
  netLiability: {
    cgst: MoneyVO;
    sgst: MoneyVO;
    igst: MoneyVO;
    total: MoneyVO;
  };
  /** Interest on late payment (if any) */
  interest: MoneyVO;
  /** Total payable */
  totalPayable: MoneyVO;
}

/**
 * HSN/SAC code to GST rate mapping.
 * Based on common items for an AI-IoT-Electronics company.
 */
const HSN_RATE_MAP: Record<string, GSTRate> = {
  // Electronics & IoT Hardware
  "8542": 18,  // Electronic integrated circuits
  "8543": 18,  // Electrical machines (IoT devices)
  "8471": 18,  // Computers & PCBs
  "8504": 18,  // Transformers, converters
  "8536": 28,  // Switches, connectors
  // Software & Services
  "998314": 18, // IT software services
  "998315": 18, // IT infrastructure management
  "998316": 18, // IT consulting
  "998319": 18, // Other IT services
  // Consulting
  "998311": 18, // Management consulting
  "998312": 18, // Business consulting
  // R&D
  "998313": 18, // R&D services
};

/**
 * GST Calculation Engine for Circuvent Technologies.
 *
 * Handles:
 * - Forward charge GST (standard)
 * - Reverse charge mechanism (for imported services)
 * - HSN/SAC code-based rate determination
 * - GSTR-3B return summary generation
 * - GST reconciliation between input and output
 *
 * @example
 * ```ts
 * const engine = new GSTEngineService();
 *
 * // Calculate GST on a consulting invoice
 * const result = engine.calculateGST({
 *   amount: 100000,
 *   rate: 18,
 *   isInterState: true, // Client in different state
 * });
 *
 * console.log(result.igst.format());      // ₹18,000.00
 * console.log(result.grandTotal.format()); // ₹1,18,000.00
 * ```
 */
export class GSTEngineService {

  /**
   * Calculates GST on a given amount.
   *
   * @param params.amount Base amount (exclusive of tax)
   * @param params.rate GST rate percentage
   * @param params.isInterState True if supplier and recipient are in different states
   * @param params.hsnSacCode Optional HSN/SAC code (overrides rate if provided)
   * @param params.reverseCharge Whether reverse charge applies
   * @returns Complete GST computation breakdown
   */
  calculateGST(params: {
    amount: number;
    rate?: GSTRate;
    isInterState?: boolean;
    hsnSacCode?: string;
    reverseCharge?: boolean;
  }): GSTComputation {
    const { amount, isInterState = false, hsnSacCode, reverseCharge = false } = params;

    // Determine rate from HSN code or use provided rate
    let rate: GSTRate = params.rate ?? 18;
    if (hsnSacCode && HSN_RATE_MAP[hsnSacCode]) {
      rate = HSN_RATE_MAP[hsnSacCode];
    }

    const baseAmount = MoneyVO.of(amount);
    const totalGST = baseAmount.multiply(rate / 100);

    let cgst = MoneyVO.zero();
    let sgst = MoneyVO.zero();
    let igst = MoneyVO.zero();

    if (isInterState) {
      // IGST = full rate (e.g., 18%)
      igst = totalGST;
    } else {
      // CGST = half rate, SGST = half rate (e.g., 9% + 9%)
      cgst = totalGST.multiply(0.5);
      sgst = totalGST.multiply(0.5);
    }

    return {
      baseAmount,
      rate,
      isInterState,
      cgst,
      sgst,
      igst,
      totalGST,
      grandTotal: baseAmount.add(totalGST),
      hsnSacCode,
      reverseCharge,
    };
  }

  /**
   * Extracts GST from a tax-inclusive amount (reverse calculation).
   * Example: ₹118,000 inclusive of 18% GST → base = ₹100,000, GST = ₹18,000
   */
  extractGSTFromInclusive(params: {
    inclusiveAmount: number;
    rate: GSTRate;
    isInterState?: boolean;
  }): GSTComputation {
    const baseAmount = params.inclusiveAmount / (1 + params.rate / 100);
    return this.calculateGST({
      amount: Number(baseAmount.toFixed(2)),
      rate: params.rate,
      isInterState: params.isInterState,
    });
  }

  /**
   * Looks up the GST rate for an HSN/SAC code.
   * @returns The rate, or undefined if the code is not in our map
   */
  lookupRate(hsnSacCode: string): GSTRate | undefined {
    return HSN_RATE_MAP[hsnSacCode];
  }

  /**
   * Generates a GSTR-3B return summary for a period.
   *
   * @param outputInvoices Sales invoices with GST
   * @param inputInvoices Purchase invoices with input credit
   * @param period Filing period string
   */
  generateGSTR3B(
    outputInvoices: GSTComputation[],
    inputInvoices: GSTComputation[],
    period: string,
  ): GSTR3BSummary {
    // Aggregate output tax
    const outputTax = {
      taxableValue: outputInvoices.reduce((s, inv) => s.add(inv.baseAmount), MoneyVO.zero()),
      cgst: outputInvoices.reduce((s, inv) => s.add(inv.cgst), MoneyVO.zero()),
      sgst: outputInvoices.reduce((s, inv) => s.add(inv.sgst), MoneyVO.zero()),
      igst: outputInvoices.reduce((s, inv) => s.add(inv.igst), MoneyVO.zero()),
    };

    // Aggregate input credit
    const inputCredit = {
      cgst: inputInvoices.reduce((s, inv) => s.add(inv.cgst), MoneyVO.zero()),
      sgst: inputInvoices.reduce((s, inv) => s.add(inv.sgst), MoneyVO.zero()),
      igst: inputInvoices.reduce((s, inv) => s.add(inv.igst), MoneyVO.zero()),
    };

    // Net liability = output - input (minimum 0)
    const netCGST = outputTax.cgst.subtract(inputCredit.cgst);
    const netSGST = outputTax.sgst.subtract(inputCredit.sgst);
    const netIGST = outputTax.igst.subtract(inputCredit.igst);
    const netTotal = netCGST.add(netSGST).add(netIGST);

    return {
      period,
      outputTax,
      inputCredit,
      netLiability: {
        cgst: netCGST.isNegative() ? MoneyVO.zero() : netCGST,
        sgst: netSGST.isNegative() ? MoneyVO.zero() : netSGST,
        igst: netIGST.isNegative() ? MoneyVO.zero() : netIGST,
        total: netTotal.isNegative() ? MoneyVO.zero() : netTotal,
      },
      interest: MoneyVO.zero(),
      totalPayable: netTotal.isNegative() ? MoneyVO.zero() : netTotal,
    };
  }

  /**
   * Validates GST compliance for a set of invoices.
   * Checks for common errors before filing.
   */
  validateForFiling(invoices: GSTComputation[]): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < invoices.length; i++) {
      const inv = invoices[i];

      // Check for zero-rate on normally taxable items
      if (inv.rate === 0 && inv.hsnSacCode && HSN_RATE_MAP[inv.hsnSacCode]) {
        warnings.push(`Invoice #${i + 1}: Zero rate applied but HSN ${inv.hsnSacCode} normally attracts ${HSN_RATE_MAP[inv.hsnSacCode]}%`);
      }

      // Check for inter-state with CGST/SGST (should be IGST)
      if (inv.isInterState && (inv.cgst.isPositive() || inv.sgst.isPositive())) {
        errors.push(`Invoice #${i + 1}: Inter-state transaction has CGST/SGST — should be IGST only`);
      }

      // Check for intra-state with IGST (should be CGST+SGST)
      if (!inv.isInterState && inv.igst.isPositive()) {
        errors.push(`Invoice #${i + 1}: Intra-state transaction has IGST — should be CGST+SGST`);
      }

      // Check for missing HSN/SAC code
      if (!inv.hsnSacCode) {
        warnings.push(`Invoice #${i + 1}: Missing HSN/SAC code — required for GSTR-1 filing`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

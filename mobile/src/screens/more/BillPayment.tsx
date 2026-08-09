import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput } from "react-native";
import { Screen, Card, SectionLabel, useTheme, IconButton, useBackHandler, useToast, ToastHost } from "../../ui";
import { TAP_SLOP } from "../../theme";
import {
  PROVIDERS, PAY_METHODS, getAccounts, addAccount, removeAccount, getPayments,
  recordPayment, estimateBill, isBillPaid,
  type ConsumerAccount, type Bill, type Payment,
} from "../../billpay";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function BillPayment({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const [accounts, setAccounts] = useState<ConsumerAccount[]>([]);
  const [selId, setSelId] = useState<string>("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<Bill | null>(null);
  const [billPaid, setBillPaid] = useState(false);

  const reload = useCallback(async () => {
    const [a, p] = await Promise.all([getAccounts(), getPayments()]);
    setAccounts(a); setPayments(p);
    setSelId((prev) => prev || a[0]?.id || "");
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const sel = accounts.find((a) => a.id === selId) || null;
  const bill = sel ? estimateBill(sel) : null;

  useEffect(() => { (async () => { if (sel && bill) setBillPaid(await isBillPaid(sel.id, bill.billNumber)); })(); }, [sel, bill?.billNumber]);

  useBackHandler(() => {
    if (paying) { setPaying(null); return true; }
    if (adding) { setAdding(false); return true; }
    onBack();
    return true;
  });

  const onPaid = async (method: string) => {
    if (!sel || !paying) return;
    await recordPayment({ accountId: sel.id, consumerNumber: sel.consumerNumber, provider: sel.provider, billNumber: paying.billNumber, amount: paying.amountDue, method });
    setPaying(null);
    await reload();
    setBillPaid(true);
    toast.show("Payment successful", "success");
  };

  if (paying && sel) return <PayFlow c={c} account={sel} bill={paying} onCancel={() => setPaying(null)} onPay={onPaid} />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <IconButton glyph="‹" onPress={onBack} />
          <Text style={{ color: c.text, fontSize: 24, fontWeight: "800", flex: 1 }}>Pay bills</Text>
          <IconButton glyph="＋" onPress={() => setAdding((v) => !v)} />
        </View>

        {adding && <AddAccount c={c} onDone={async (a) => { if (a) { const list = await addAccount(a); setAccounts(list); setSelId(list[list.length - 1].id); toast.show("Account added", "success"); } setAdding(false); }} />}

        {accounts.length === 0 && !adding ? (
          <Card padded style={{ alignItems: "center", paddingVertical: 40 }}>
            <Text style={{ fontSize: 40 }}>🧾</Text>
            <Text style={{ color: c.textDim, marginTop: 12, textAlign: "center" }}>No consumer accounts yet.{"\n"}Add your electricity connection to fetch bills.</Text>
            <Pressable onPress={() => setAdding(true)} style={{ marginTop: 16, backgroundColor: c.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22 }}>
              <Text style={{ color: c.onAccent || "#fff", fontWeight: "800" }}>＋ Add account</Text>
            </Pressable>
          </Card>
        ) : (
          <>
            <SectionLabel>Account</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8 }}>
              {accounts.map((a) => (
                <Pressable key={a.id} onPress={() => setSelId(a.id)}>
                  <Card padded style={{ width: 190, borderColor: selId === a.id ? c.accentHi : undefined, borderWidth: selId === a.id ? 1 : 0 }}>
                    <Text style={{ color: c.text, fontWeight: "800" }} numberOfLines={1}>{a.consumerName || a.consumerNumber}</Text>
                    <Text style={{ color: c.faint, fontSize: 12 }} numberOfLines={1}>{a.provider}</Text>
                    <Text style={{ color: c.faint, fontSize: 11, marginTop: 2 }}>#{a.consumerNumber}</Text>
                  </Card>
                </Pressable>
              ))}
            </ScrollView>

            {sel && bill && (
              <>
                <SectionLabel>CURRENT BILL · {bill.period}</SectionLabel>
                <Card padded style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View>
                      <Text style={{ color: c.faint, fontSize: 12 }}>Amount due</Text>
                      <Text style={{ color: c.text, fontSize: 34, fontWeight: "900" }}>{inr(bill.amountDue)}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: billPaid ? c.green : c.amber, fontWeight: "800", fontSize: 12 }}>{billPaid ? "PAID" : "DUE"}</Text>
                      <Text style={{ color: c.faint, fontSize: 12, marginTop: 2 }}>by {fmtDate(bill.dueDate)}</Text>
                    </View>
                  </View>
                  <View style={{ height: 1, backgroundColor: c.border, marginVertical: 12 }} />
                  <Line c={c} label={`Units consumed`} value={`${bill.unitsConsumed} kWh`} />
                  <Line c={c} label="Energy charge" value={inr(bill.energyCharge)} />
                  <Line c={c} label="Fixed charge" value={inr(bill.fixedCharge)} />
                  <Line c={c} label="Tax (9%)" value={inr(bill.taxAmount)} />
                  {bill.subsidyAmount > 0 && <Line c={c} label="Subsidy" value={`- ${inr(bill.subsidyAmount)}`} green />}
                  <View style={{ height: 1, backgroundColor: c.border, marginVertical: 8 }} />
                  <Line c={c} label="Total" value={inr(bill.totalAmount)} bold />
                  <Text style={{ color: c.faint, fontSize: 11, marginTop: 8 }}>Bill #{bill.billNumber} · {sel.provider}</Text>
                </Card>

                {billPaid ? (
                  <Card padded style={{ marginBottom: 14, alignItems: "center" }}>
                    <Text style={{ color: c.green, fontWeight: "800" }}>✓ This bill is paid</Text>
                  </Card>
                ) : (
                  <Pressable onPress={() => setPaying(bill)} style={{ backgroundColor: c.accent, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginBottom: 14 }}>
                    <Text style={{ color: c.onAccent || "#fff", fontWeight: "800", fontSize: 16 }}>Pay {inr(bill.amountDue)}</Text>
                  </Pressable>
                )}

                <Pressable hitSlop={TAP_SLOP} onPress={async () => { const list = await removeAccount(sel.id); setAccounts(list); setSelId(list[0]?.id || ""); }} style={{ alignSelf: "center", marginBottom: 8 }}>
                  <Text style={{ color: c.faint }}>Remove this account</Text>
                </Pressable>
              </>
            )}

            {payments.length > 0 && (
              <>
                <SectionLabel>Payment history</SectionLabel>
                {payments.slice(0, 20).map((p) => (
                  <Card key={p.id} padded style={{ marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Text style={{ fontSize: 20 }}>✅</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontWeight: "700" }}>{inr(p.amount)} · {p.method}</Text>
                      <Text style={{ color: c.faint, fontSize: 11 }} numberOfLines={1}>{p.provider} · #{p.consumerNumber} · {p.txnId}</Text>
                    </View>
                    <Text style={{ color: c.faint, fontSize: 11 }}>{fmtDate(p.at)}</Text>
                  </Card>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
      <ToastHost toast={toast.toast} onHide={toast.hide} />
    </Screen>
  );
}

function Line({ c, label, value, bold, green }: { c: ReturnType<typeof useTheme>["c"]; label: string; value: string; bold?: boolean; green?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
      <Text style={{ color: c.textDim, fontWeight: bold ? "800" : "400" }}>{label}</Text>
      <Text style={{ color: green ? c.green : c.text, fontWeight: bold ? "800" : "600" }}>{value}</Text>
    </View>
  );
}

function PayFlow({ c, account, bill, onCancel, onPay }: { c: ReturnType<typeof useTheme>["c"]; account: ConsumerAccount; bill: Bill; onCancel: () => void; onPay: (method: string) => void }) {
  const [method, setMethod] = useState(PAY_METHODS[0]);
  const [processing, setProcessing] = useState(false);

  const pay = () => {
    setProcessing(true);
    // Simulate a gateway round-trip, then record the receipt.
    setTimeout(() => onPay(method), 1400);
  };

  useBackHandler(() => { if (!processing) onCancel(); return true; });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 40 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <IconButton glyph="‹" onPress={onCancel} />
          <Text style={{ color: c.text, fontSize: 22, fontWeight: "800" }}>Confirm payment</Text>
        </View>
        <Card padded style={{ marginBottom: 16, alignItems: "center" }}>
          <Text style={{ color: c.faint, fontSize: 12 }}>Paying</Text>
          <Text style={{ color: c.text, fontSize: 34, fontWeight: "900" }}>{inr(bill.amountDue)}</Text>
          <Text style={{ color: c.faint, fontSize: 12, marginTop: 4 }}>{account.provider} · #{account.consumerNumber}</Text>
          <Text style={{ color: c.faint, fontSize: 11 }}>Bill #{bill.billNumber}</Text>
        </Card>
        <SectionLabel>Payment method</SectionLabel>
        {PAY_METHODS.map((m) => (
          <Pressable key={m} onPress={() => setMethod(m)} disabled={processing}>
            <Card padded style={{ marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 12, borderColor: method === m ? c.accentHi : undefined, borderWidth: method === m ? 1 : 0 }}>
              <Text style={{ fontSize: 20 }}>{m === "UPI" ? "📲" : m === "Card" ? "💳" : m === "Wallet" ? "👛" : "🏦"}</Text>
              <Text style={{ color: c.text, fontWeight: "700", flex: 1 }}>{m}</Text>
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: method === m ? c.accent : c.border, alignItems: "center", justifyContent: "center" }}>
                {method === m && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} />}
              </View>
            </Card>
          </Pressable>
        ))}
        <Pressable onPress={pay} disabled={processing} style={{ backgroundColor: processing ? c.card : c.accent, borderColor: c.border, borderWidth: processing ? 1 : 0, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 8 }}>
          <Text style={{ color: processing ? c.textDim : c.onAccent || "#fff", fontWeight: "800", fontSize: 16 }}>{processing ? "Processing…" : `Pay ${inr(bill.amountDue)}`}</Text>
        </Pressable>
        <Text style={{ color: c.faint, fontSize: 11, textAlign: "center", marginTop: 12 }}>Secured payment · a receipt is saved to your history.</Text>
      </ScrollView>
    </Screen>
  );
}

function AddAccount({ c, onDone }: { c: ReturnType<typeof useTheme>["c"]; onDone: (a: Omit<ConsumerAccount, "id"> | null) => void }) {
  const [provider, setProvider] = useState(PROVIDERS[0]);
  const [consumerNumber, setConsumerNumber] = useState("");
  const [consumerName, setConsumerName] = useState("");
  const [mobile, setMobile] = useState("");
  const [load, setLoad] = useState("");

  const save = () => {
    if (!consumerNumber.trim()) return;
    onDone({ provider, consumerNumber: consumerNumber.trim(), consumerName: consumerName.trim(), mobile: mobile.trim() || undefined, sanctionedLoadKw: Number(load) || undefined });
  };

  return (
    <Card padded style={{ marginBottom: 16 }}>
      <SectionLabel>Add consumer account</SectionLabel>
      <Text style={{ color: c.textDim, fontSize: 12, marginBottom: 6 }}>Provider (DISCOM)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ gap: 8 }}>
        {PROVIDERS.map((p) => (
          <Pressable hitSlop={TAP_SLOP} key={p} onPress={() => setProvider(p)} style={{ borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: provider === p ? c.accent : c.card, borderColor: provider === p ? c.accent : c.border, borderWidth: 1 }}>
            <Text style={{ color: provider === p ? c.onAccent || "#fff" : c.textDim, fontSize: 12 }}>{p}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Fld c={c} label="Consumer number *" value={consumerNumber} onChangeText={setConsumerNumber} placeholder="e.g. 1002345678" keyboardType="number-pad" />
      <Fld c={c} label="Account name" value={consumerName} onChangeText={setConsumerName} placeholder="e.g. Home" />
      <Fld c={c} label="Registered mobile (optional)" value={mobile} onChangeText={setMobile} placeholder="9xxxxxxxxx" keyboardType="phone-pad" />
      <Fld c={c} label="Sanctioned load kW (optional)" value={load} onChangeText={setLoad} placeholder="3" keyboardType="numeric" />
      <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
        <Pressable onPress={() => onDone(null)} style={{ flex: 1, borderColor: c.border, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}><Text style={{ color: c.textDim, fontWeight: "700" }}>Cancel</Text></Pressable>
        <Pressable onPress={save} style={{ flex: 1, backgroundColor: c.accent, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}><Text style={{ color: c.onAccent || "#fff", fontWeight: "800" }}>Add</Text></Pressable>
      </View>
    </Card>
  );
}

function Fld({ c, label, ...props }: { c: ReturnType<typeof useTheme>["c"]; label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: c.textDim, fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <TextInput placeholderTextColor={c.faint} style={{ color: c.text, backgroundColor: c.cardHi, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: c.border }} {...props} />
    </View>
  );
}

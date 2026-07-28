import { useState, useEffect, useMemo, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  LayoutDashboard, Users, Wallet, TrendingUp, Target, Plus, X, Check,
  AlertTriangle, Trash2, PiggyBank, HeartHandshake, Receipt,
} from "lucide-react";

// ---------- Brand tokens ----------
const NAVY = "#071B3B";
const PETROL = "#0D2B45";
const GOLD = "#D4AF37";
const ICE = "#F8FAFC";
const GREY = "#94A3B8";

const CATEGORIES = ["Salário", "Imposto", "Caridade", "Equipamento", "Transporte", "Alimentação", "Serviços contratados", "Outros"];
const GOAL_TYPES = ["Faturamento mensal", "Caixa acumulado", "Reserva patrimonial", "Lucro líquido", "Redução de despesas"];

const brl = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const uid = () => Math.random().toString(36).slice(2, 10);

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
};
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);

// ---------- Persistence ----------
async function loadAll() {
  const keys = ["clients", "payments", "expenses", "goals"];
  const out = {};
  for (const k of keys) {
    try {
      const r = await window.storage.get(k, false);
      out[k] = r ? JSON.parse(r.value) : [];
    } catch {
      out[k] = [];
    }
  }
  return out;
}
async function saveKey(key, value) {
  try {
    await window.storage.set(key, JSON.stringify(value), false);
  } catch (e) {
    console.error("storage save failed", key, e);
  }
}

// ---------- Small UI atoms ----------
function Card({ children, className = "", style = {} }) {
  return (
    <div
      className={`rounded-2xl border ${className}`}
      style={{ background: "#fff", borderColor: "#E7EAF0", ...style }}
    >
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <Card className="p-5 flex-1 min-w-[160px]">
      <p className="text-xs font-medium tracking-wide uppercase" style={{ color: GREY }}>{label}</p>
      <p className="text-2xl font-semibold mt-2" style={{ color: NAVY, fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: accent || GREY }}>{sub}</p>}
    </Card>
  );
}

function Badge({ status }) {
  const map = {
    Pago: { bg: "#E8F5EC", fg: "#1F8A4C" },
    Pendente: { bg: "#FDF3E0", fg: "#B7791F" },
    Atrasado: { bg: "#FBE7E7", fg: "#C0392B" },
  };
  const c = map[status] || { bg: "#EEE", fg: "#555" };
  return (
    <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: c.bg, color: c.fg }}>
      {status}
    </span>
  );
}

function Button({ children, onClick, variant = "primary", className = "", type = "button" }) {
  const styles = {
    primary: { background: NAVY, color: ICE },
    gold: { background: GOLD, color: NAVY },
    ghost: { background: "transparent", color: NAVY, border: "1px solid #E7EAF0" },
    danger: { background: "#FBE7E7", color: "#C0392B" },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      className={`text-sm font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-85 ${className}`}
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium" style={{ color: GREY }}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2";
const inputStyle = { borderColor: "#E7EAF0" };

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#E7EAF0" }}>
          <h3 className="font-semibold" style={{ color: NAVY }}>{title}</h3>
          <button onClick={onClose}><X size={18} color={GREY} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ProgressBar({ pct, color = GOLD }) {
  return (
    <div className="w-full h-2 rounded-full" style={{ background: "#EDF0F5" }}>
      <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

// ---------- Financial engine ----------
const RESERVE = { patrimony: 0.10, charity: 0.10, tax: 90 };

function computeMonth(key, clients, payments, expenses) {
  const paid = payments.filter((p) => p.month === key && p.status === "Pago");
  const grossRevenue = paid.reduce((s, p) => s + Number(p.amount), 0);
  const patrimony = grossRevenue * RESERVE.patrimony;
  const charity = grossRevenue * RESERVE.charity;
  const tax = grossRevenue > 0 ? RESERVE.tax : 0;
  const monthExpenses = expenses
    .filter((e) => monthKey(new Date(e.date)) === key)
    .reduce((s, e) => s + Number(e.amount), 0);
  const netResult = grossRevenue - monthExpenses - tax;
  const operationalCash = netResult - patrimony - charity;
  return { key, grossRevenue, patrimony, charity, tax, monthExpenses, netResult, operationalCash };
}

function healthStatus(m) {
  const margin = m.grossRevenue > 0 ? (m.netResult / m.grossRevenue) * 100 : 0;
  if (m.grossRevenue === 0) return { level: "neutral", color: GREY, label: "Sem dados", phrase: "Cadastre receitas para calcular a saúde financeira." };
  if (margin >= 30) return { level: "green", color: "#1F8A4C", label: "Excelente", phrase: "A empresa está operando com alta segurança financeira." };
  if (margin >= 15) return { level: "yellow", color: "#B7791F", label: "Atenção", phrase: "As despesas estão consumindo uma parcela relevante da receita." };
  return { level: "red", color: "#C0392B", label: "Crítico", phrase: "Risco de comprometimento do fluxo de caixa nos próximos meses." };
}

// ---------- Views ----------
function DashboardView({ clients, payments, expenses, goals }) {
  const now = new Date();
  const key = monthKey(now);
  const m = computeMonth(key, clients, payments, expenses);
  const health = healthStatus(m);

  const upcoming = clients
    .filter((c) => c.active !== false)
    .map((c) => {
      const p = payments.find((pp) => pp.clientId === c.id && pp.month === key);
      return { client: c, status: p ? p.status : "Pendente" };
    })
    .filter((x) => x.status !== "Pago")
    .sort((a, b) => a.client.dueDay - b.client.dueDay);

  const hour = now.getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="space-y-6">
      <Card className="p-5 flex items-center justify-between" style={{ background: PETROL }}>
        <div>
          <p className="text-sm" style={{ color: GREY }}>{greeting}</p>
          <p className="text-lg font-semibold" style={{ color: ICE }}>Saúde financeira — {monthLabel(key)}</p>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium" style={{ background: health.color, color: "#fff" }}>
            <span className="w-2 h-2 rounded-full bg-white" />
            {health.label}
          </span>
        </div>
      </Card>
      <p className="text-sm -mt-3" style={{ color: GREY }}>{health.phrase}</p>

      <div className="flex flex-wrap gap-4">
        <StatCard label="Faturamento do mês" value={brl(m.grossRevenue)} />
        <StatCard label="Caixa disponível" value={brl(m.operationalCash)} accent={m.operationalCash >= 0 ? "#1F8A4C" : "#C0392B"} sub={m.operationalCash >= 0 ? "Positivo" : "Negativo"} />
        <StatCard label="Reserva patrimonial" value={brl(m.patrimony)} />
        <StatCard label="Reserva de caridade" value={brl(m.charity)} />
        <StatCard label="Despesas do mês" value={brl(m.monthExpenses)} />
        <StatCard label="Resultado líquido" value={brl(m.netResult)} accent={m.netResult >= 0 ? "#1F8A4C" : "#C0392B"} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className="text-sm font-semibold mb-3" style={{ color: NAVY }}>Próximos vencimentos</p>
          {upcoming.length === 0 && <p className="text-sm" style={{ color: GREY }}>Nenhuma pendência este mês.</p>}
          <div className="space-y-2">
            {upcoming.slice(0, 6).map(({ client, status }) => (
              <div key={client.id} className="flex items-center justify-between text-sm">
                <span style={{ color: NAVY }}>{client.name} <span style={{ color: GREY }}>· dia {client.dueDay}</span></span>
                <Badge status={status} />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-semibold mb-3" style={{ color: NAVY }}>Metas em andamento</p>
          {goals.length === 0 && <p className="text-sm" style={{ color: GREY }}>Nenhuma meta cadastrada.</p>}
          <div className="space-y-3">
            {goals.slice(0, 4).map((g) => {
              const pct = g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0;
              return (
                <div key={g.id}>
                  <div className="flex justify-between text-xs mb-1" style={{ color: NAVY }}>
                    <span>{g.title}</span><span>{pct.toFixed(0)}%</span>
                  </div>
                  <ProgressBar pct={pct} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ClientsView({ clients, setClients, payments, setPayments }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", product: "", value: "", dueDay: "10", paymentMethod: "PIX", notes: "" });
  const key = monthKey(new Date());

  const addClient = () => {
    if (!form.name || !form.value) return;
    const client = { id: uid(), name: form.name, product: form.product, value: Number(form.value), dueDay: Number(form.dueDay), paymentMethod: form.paymentMethod, notes: form.notes, active: true };
    setClients((prev) => [...prev, client]);
    setModal(false);
    setForm({ name: "", product: "", value: "", dueDay: "10", paymentMethod: "PIX", notes: "" });
  };

  const removeClient = (id) => {
    setClients((prev) => prev.filter((c) => c.id !== id));
    setPayments((prev) => prev.filter((p) => p.clientId !== id));
  };

  const setStatus = (client, status) => {
    setPayments((prev) => {
      const existing = prev.find((p) => p.clientId === client.id && p.month === key);
      if (existing) {
        return prev.map((p) => (p === existing ? { ...p, status, paidAt: status === "Pago" ? new Date().toISOString() : null } : p));
      }
      return [...prev, { id: uid(), clientId: client.id, month: key, amount: client.value, status, paidAt: status === "Pago" ? new Date().toISOString() : null }];
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: NAVY }}>Clientes & Receitas recorrentes</h2>
        <Button variant="gold" onClick={() => setModal(true)}><span className="inline-flex items-center gap-1"><Plus size={16} />Adicionar cliente</span></Button>
      </div>

      <div className="space-y-2">
        {clients.length === 0 && <p className="text-sm" style={{ color: GREY }}>Nenhum cliente cadastrado ainda.</p>}
        {clients.map((c) => {
          const p = payments.find((pp) => pp.clientId === c.id && pp.month === key);
          const status = p ? p.status : "Pendente";
          return (
            <Card key={c.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-medium" style={{ color: NAVY }}>{c.name}</p>
                <p className="text-xs" style={{ color: GREY }}>{c.product} · {brl(c.value)}/mês · vence dia {c.dueDay} · {c.paymentMethod}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge status={status} />
                <select
                  className="text-xs rounded-lg border px-2 py-1.5"
                  style={inputStyle}
                  value={status}
                  onChange={(e) => setStatus(c, e.target.value)}
                >
                  <option>Pendente</option>
                  <option>Pago</option>
                  <option>Atrasado</option>
                </select>
                <button onClick={() => removeClient(c.id)}><Trash2 size={16} color="#C0392B" /></button>
              </div>
            </Card>
          );
        })}
      </div>

      {modal && (
        <Modal title="Novo cliente" onClose={() => setModal(false)}>
          <div className="space-y-3">
            <Field label="Nome do cliente"><input className={inputCls} style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Produto ou serviço"><input className={inputCls} style={inputStyle} value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valor mensal (R$)"><input type="number" className={inputCls} style={inputStyle} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>
              <Field label="Dia de vencimento"><input type="number" min="1" max="31" className={inputCls} style={inputStyle} value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} /></Field>
            </div>
            <Field label="Observações"><textarea className={inputCls} style={inputStyle} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <Button variant="primary" className="w-full" onClick={addClient}>Salvar cliente</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ExpensesView({ expenses, setExpenses }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ description: "", category: CATEGORIES[0], amount: "", date: new Date().toISOString().slice(0, 10), type: "Fixa", recurring: false });

  const add = () => {
    if (!form.description || !form.amount) return;
    setExpenses((prev) => [...prev, { id: uid(), ...form, amount: Number(form.amount) }]);
    setModal(false);
    setForm({ description: "", category: CATEGORIES[0], amount: "", date: new Date().toISOString().slice(0, 10), type: "Fixa", recurring: false });
  };
  const remove = (id) => setExpenses((prev) => prev.filter((e) => e.id !== id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: NAVY }}>Despesas</h2>
        <Button variant="gold" onClick={() => setModal(true)}><span className="inline-flex items-center gap-1"><Plus size={16} />Nova despesa</span></Button>
      </div>
      <div className="space-y-2">
        {expenses.length === 0 && <p className="text-sm" style={{ color: GREY }}>Nenhuma despesa cadastrada.</p>}
        {[...expenses].sort((a, b) => new Date(b.date) - new Date(a.date)).map((e) => (
          <Card key={e.id} className="p-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-medium" style={{ color: NAVY }}>{e.description}</p>
              <p className="text-xs" style={{ color: GREY }}>{e.category} · {e.type}{e.recurring ? " · recorrente" : ""} · {new Date(e.date).toLocaleDateString("pt-BR")}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-medium text-sm" style={{ color: NAVY }}>{brl(e.amount)}</span>
              <button onClick={() => remove(e.id)}><Trash2 size={16} color="#C0392B" /></button>
            </div>
          </Card>
        ))}
      </div>

      {modal && (
        <Modal title="Nova despesa" onClose={() => setModal(false)}>
          <div className="space-y-3">
            <Field label="Descrição"><input className={inputCls} style={inputStyle} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoria">
                <select className={inputCls} style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Valor (R$)"><input type="number" className={inputCls} style={inputStyle} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data"><input type="date" className={inputCls} style={inputStyle} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
              <Field label="Tipo">
                <select className={inputCls} style={inputStyle} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option>Fixa</option><option>Variável</option>
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm" style={{ color: NAVY }}>
              <input type="checkbox" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} />
              Despesa recorrente (repete todo mês)
            </label>
            <Button variant="primary" className="w-full" onClick={add}>Salvar despesa</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ForecastView({ clients, expenses }) {
  const activeClients = clients.filter((c) => c.active !== false);
  const expectedRevenue = activeClients.reduce((s, c) => s + Number(c.value), 0);
  const recurringExpenses = expenses.filter((e) => e.recurring).reduce((s, e) => s + Number(e.amount), 0);

  const rows = useMemo(() => {
    const out = [];
    let cumulative = 0;
    for (let i = 0; i < 12; i++) {
      const d = addMonths(new Date(), i);
      const key = monthKey(d);
      const patrimony = expectedRevenue * RESERVE.patrimony;
      const charity = expectedRevenue * RESERVE.charity;
      const tax = expectedRevenue > 0 ? RESERVE.tax : 0;
      const balance = expectedRevenue - recurringExpenses - patrimony - charity - tax;
      cumulative += balance;
      out.push({ key, label: monthLabel(key), expectedRevenue, expenses: recurringExpenses, patrimony, charity, tax, balance, cumulative });
    }
    return out;
  }, [expectedRevenue, recurringExpenses]);

  const milestones = [30, 60, 90].map((days) => {
    const idx = Math.round(days / 30) - 1;
    return { days, cumulative: rows[idx]?.cumulative ?? 0 };
  }).concat([
    { label: "6 meses", cumulative: rows[5]?.cumulative ?? 0 },
    { label: "12 meses", cumulative: rows[11]?.cumulative ?? 0 },
  ]);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold" style={{ color: NAVY }}>Previsão de caixa</h2>
      <p className="text-xs" style={{ color: GREY }}>
        Projeção assume que todos os clientes ativos pagam integralmente e que as despesas recorrentes se repetem todo mês.
      </p>

      <div className="flex flex-wrap gap-4">
        {[30, 60, 90].map((d) => (
          <StatCard key={d} label={`${d} dias`} value={brl(rows[Math.round(d / 30) - 1]?.cumulative ?? 0)} />
        ))}
        <StatCard label="6 meses" value={brl(rows[5]?.cumulative ?? 0)} />
        <StatCard label="12 meses" value={brl(rows[11]?.cumulative ?? 0)} />
      </div>

      <Card className="p-5">
        <p className="text-sm font-semibold mb-3" style={{ color: NAVY }}>Evolução do caixa projetado (acumulado)</p>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={rows}>
              <CartesianGrid stroke="#EDF0F5" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: GREY }} axisLine={{ stroke: "#E7EAF0" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: GREY }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => brl(v)} contentStyle={{ borderRadius: 12, border: "1px solid #E7EAF0" }} />
              <Line type="monotone" dataKey="cumulative" stroke={GOLD} strokeWidth={2.5} dot={{ r: 3, fill: NAVY }} name="Caixa acumulado" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: GREY }} className="text-left border-b" >
              <th className="px-4 py-3">Mês</th>
              <th className="px-4 py-3">Receita prevista</th>
              <th className="px-4 py-3">Despesas</th>
              <th className="px-4 py-3">Patrimônio</th>
              <th className="px-4 py-3">Caridade</th>
              <th className="px-4 py-3">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b last:border-0" style={{ borderColor: "#F1F3F7" }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: NAVY }}>{r.label}</td>
                <td className="px-4 py-2.5">{brl(r.expectedRevenue)}</td>
                <td className="px-4 py-2.5">{brl(r.expenses)}</td>
                <td className="px-4 py-2.5">{brl(r.patrimony)}</td>
                <td className="px-4 py-2.5">{brl(r.charity)}</td>
                <td className="px-4 py-2.5 font-medium" style={{ color: r.balance >= 0 ? "#1F8A4C" : "#C0392B" }}>{brl(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function GoalsView({ goals, setGoals }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", type: GOAL_TYPES[0], targetAmount: "", currentAmount: "", dueDate: "" });

  const add = () => {
    if (!form.title || !form.targetAmount) return;
    setGoals((prev) => [...prev, { id: uid(), ...form, targetAmount: Number(form.targetAmount), currentAmount: Number(form.currentAmount || 0) }]);
    setModal(false);
    setForm({ title: "", type: GOAL_TYPES[0], targetAmount: "", currentAmount: "", dueDate: "" });
  };
  const remove = (id) => setGoals((prev) => prev.filter((g) => g.id !== id));
  const bump = (id, delta) => setGoals((prev) => prev.map((g) => g.id === id ? { ...g, currentAmount: Math.max(0, g.currentAmount + delta) } : g));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: NAVY }}>Metas financeiras</h2>
        <Button variant="gold" onClick={() => setModal(true)}><span className="inline-flex items-center gap-1"><Plus size={16} />Nova meta</span></Button>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {goals.length === 0 && <p className="text-sm" style={{ color: GREY }}>Nenhuma meta cadastrada.</p>}
        {goals.map((g) => {
          const pct = g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0;
          const missing = Math.max(0, g.targetAmount - g.currentAmount);
          return (
            <Card key={g.id} className="p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium" style={{ color: NAVY }}>{g.title}</p>
                  <p className="text-xs" style={{ color: GREY }}>{g.type}{g.dueDate ? ` · até ${new Date(g.dueDate).toLocaleDateString("pt-BR")}` : ""}</p>
                </div>
                <button onClick={() => remove(g.id)}><Trash2 size={15} color="#C0392B" /></button>
              </div>
              <div className="mt-3"><ProgressBar pct={pct} /></div>
              <div className="flex justify-between text-xs mt-2" style={{ color: GREY }}>
                <span>{brl(g.currentAmount)} de {brl(g.targetAmount)}</span>
                <span>{pct.toFixed(1)}%</span>
              </div>
              <p className="text-xs mt-1" style={{ color: GREY }}>Falta {brl(missing)}</p>
              <div className="flex gap-2 mt-3">
                <Button variant="ghost" onClick={() => bump(g.id, 100)}>+ R$100</Button>
                <Button variant="ghost" onClick={() => bump(g.id, -100)}>- R$100</Button>
              </div>
            </Card>
          );
        })}
      </div>

      {modal && (
        <Modal title="Nova meta" onClose={() => setModal(false)}>
          <div className="space-y-3">
            <Field label="Título"><input className={inputCls} style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Tipo">
              <select className={inputCls} style={inputStyle} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {GOAL_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Objetivo (R$)"><input type="number" className={inputCls} style={inputStyle} value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} /></Field>
              <Field label="Atual (R$)"><input type="number" className={inputCls} style={inputStyle} value={form.currentAmount} onChange={(e) => setForm({ ...form, currentAmount: e.target.value })} /></Field>
            </div>
            <Field label="Prazo"><input type="date" className={inputCls} style={inputStyle} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
            <Button variant="primary" className="w-full" onClick={add}>Salvar meta</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- App shell ----------
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "clients", label: "Clientes", icon: Users },
  { id: "expenses", label: "Despesas", icon: Receipt },
  { id: "forecast", label: "Previsão", icon: TrendingUp },
  { id: "goals", label: "Metas", icon: Target },
];

export default function BoanergeFinance() {
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [goals, setGoals] = useState([]);

  useEffect(() => {
    loadAll().then((d) => {
      setClients(d.clients);
      setPayments(d.payments);
      setExpenses(d.expenses);
      setGoals(d.goals);
      setLoading(false);
    });
  }, []);

  useEffect(() => { if (!loading) saveKey("clients", clients); }, [clients, loading]);
  useEffect(() => { if (!loading) saveKey("payments", payments); }, [payments, loading]);
  useEffect(() => { if (!loading) saveKey("expenses", expenses); }, [expenses, loading]);
  useEffect(() => { if (!loading) saveKey("goals", goals); }, [goals, loading]);

  const key = monthKey(new Date());
  const m = useMemo(() => computeMonth(key, clients, payments, expenses), [key, clients, payments, expenses]);
  const health = healthStatus(m);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: ICE, color: GREY }}>Carregando…</div>;
  }

  return (
    <div className="min-h-screen flex flex-col sm:flex-row" style={{ background: ICE, fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Sidebar */}
      <aside className="sm:w-56 shrink-0 sm:min-h-screen p-4 flex sm:flex-col justify-between" style={{ background: NAVY }}>
        <div>
          <div className="flex items-center gap-2 px-2 py-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm" style={{ background: GOLD, color: NAVY }}>B</div>
            <span className="font-semibold tracking-wide text-sm" style={{ color: ICE }}>BOANERGE</span>
          </div>
          <nav className="hidden sm:flex flex-col gap-1 mt-4">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = tab === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setTab(n.id)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors"
                  style={{ background: active ? PETROL : "transparent", color: active ? GOLD : "#C7D0DE" }}
                >
                  <Icon size={17} />{n.label}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden flex justify-around border-t bg-white sticky bottom-0 z-40 order-3" style={{ borderColor: "#E7EAF0" }}>
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = tab === n.id;
          return (
            <button key={n.id} onClick={() => setTab(n.id)} className="flex flex-col items-center gap-0.5 py-2 px-3">
              <Icon size={18} color={active ? NAVY : GREY} />
              <span className="text-[10px]" style={{ color: active ? NAVY : GREY }}>{n.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Main */}
      <main className="flex-1 order-2 sm:order-none">
        <header className="flex items-center justify-between px-5 py-4 border-b bg-white" style={{ borderColor: "#E7EAF0" }}>
          <div>
            <p className="text-xs" style={{ color: GREY }}>Boanerge Company</p>
            <p className="text-sm font-medium" style={{ color: NAVY }}>{NAV.find((n) => n.id === tab)?.label}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: health.color, color: "#fff" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-white" />{health.label}
          </span>
        </header>
        <div className="p-5 max-w-5xl mx-auto">
          {tab === "dashboard" && <DashboardView clients={clients} payments={payments} expenses={expenses} goals={goals} />}
          {tab === "clients" && <ClientsView clients={clients} setClients={setClients} payments={payments} setPayments={setPayments} />}
          {tab === "expenses" && <ExpensesView expenses={expenses} setExpenses={setExpenses} />}
          {tab === "forecast" && <ForecastView clients={clients} expenses={expenses} />}
          {tab === "goals" && <GoalsView goals={goals} setGoals={setGoals} />}
        </div>
      </main>
    </div>
  );
}

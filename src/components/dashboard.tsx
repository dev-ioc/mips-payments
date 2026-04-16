import React, { useState, useEffect } from "react";
import { dashboard } from "@wix/dashboard";
import { httpClient } from "@wix/essentials";

const BACKEND = "https://your-backend-domain.com";

// Types
type Credentials = {
  id_merchant: string;
  id_entity: string;
  id_operator: string;
  operator_password: string;
  currency: string;
};

type Payment = {
  id: string;
  id_order: string;
  client_first_name: string;
  client_last_name: string;
  client_email: string;
  amount: string;
  currency: string;
  status: "success" | "pending" | "failed";
  created_at: string;
  payment_link?: string;
};

type Summary = {
  total?: number;
  success?: number;
  pending?: number;
  total_amount?: number;
};

const COLORS = {
  primary: "#2563EB",
  success: "#16A34A",
  warning: "#D97706",
  danger: "#DC2626",
  bg: "#F8FAFC",
  card: "#FFFFFF",
  border: "#E2E8F0",
  text: "#1E293B",
  muted: "#64748B",
};

export default function MipsDashboard(): JSX.Element {
  const [tab, setTab] = useState<"payments" | "credentials">("payments");
  const [credentials, setCredentials] = useState<Credentials>({
    id_merchant: "",
    id_entity: "",
    id_operator: "",
    operator_password: "",
    currency: "MUR",
  });

  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<Summary>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [saveMsg, setSaveMsg] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "success" | "pending" | "failed"
  >("all");
  const [siteId, setSiteId] = useState<string>("");

  useEffect(() => {
    dashboard
      .getPageUrl()
      .then((url: string) => {
        const params = new URLSearchParams(new URL(url).search);
        const sid = params.get("siteId") || "demo-site";
        setSiteId(sid);
        loadCredentials(sid);
        loadPayments(sid, "all");
      })
      .catch(() => {
        const sid = "demo-site";
        setSiteId(sid);
        loadCredentials(sid);
        loadPayments(sid, "all");
      });
  }, []);

  async function loadCredentials(sid: string): Promise<void> {
    try {
      const r = await fetch(
        `${BACKEND}/api/merchant/get-credentials?wix_site_id=${sid}`,
      );
      const data = await r.json();
      if (data.configured && data.merchant) {
        setCredentials((prev) => ({ ...prev, ...data.merchant }));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadPayments(sid: string, status: string): Promise<void> {
    setLoading(true);
    try {
      const url = `${BACKEND}/api/payments?wix_site_id=${sid}&status=${status}&limit=50`;
      const r = await fetch(url);
      const data = await r.json();
      setPayments(data.payments || []);
      setSummary(data.summary || {});
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function saveCredentials(): Promise<void> {
    setLoading(true);
    setSaveMsg("");
    try {
      const r = await fetch(`${BACKEND}/api/merchant/save-credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wix_site_id: siteId, ...credentials }),
      });
      const data = await r.json();
      if (data.success) setSaveMsg("✅ Credentials sauvegardés avec succès !");
      else setSaveMsg("❌ Erreur : " + data.error);
    } catch {
      setSaveMsg("❌ Erreur réseau");
    }
    setLoading(false);
  }

  const statusBadge = (status: string): JSX.Element => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      success: {
        bg: "#DCFCE7",
        color: "#16A34A",
        label: "✓ Succès",
      },
      pending: {
        bg: "#FEF9C3",
        color: "#D97706",
        label: "⏳ En attente",
      },
      failed: {
        bg: "#FEE2E2",
        color: "#DC2626",
        label: "✗ Échoué",
      },
    };

    const s = map[status] || {
      bg: "#F1F5F9",
      color: "#64748B",
      label: status,
    };

    return (
      <span
        style={{
          background: s.bg,
          color: s.color,
          padding: "2px 10px",
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {s.label}
      </span>
    );
  };
  return (
    <div
      style={{
        fontFamily: "Inter, sans-serif",
        background: COLORS.bg,
        minHeight: "100vh",
        padding: 24,
        color: COLORS.text,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 28,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            background: COLORS.primary,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ color: "#fff", fontSize: 20 }}>💳</span>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            MiPS Payment
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: COLORS.muted }}>
            Dashboard Marchand
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 24,
          background: "#E2E8F0",
          borderRadius: 10,
          padding: 4,
          width: "fit-content",
        }}
      >
        {["payments", "credentials"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: tab === t ? "#fff" : "transparent",
              color: tab === t ? COLORS.primary : COLORS.muted,
              fontWeight: tab === t ? 700 : 400,
              fontSize: 14,
              boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              transition: "all 0.2s",
            }}
          >
            {t === "payments" ? "📊 Paiements" : "⚙️ Credentials"}
          </button>
        ))}
      </div>

      {/* ===== TAB: PAYMENTS ===== */}
      {tab === "payments" && (
        <>
          {/* Stats */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 16,
              marginBottom: 24,
            }}
          >
            {[
              {
                label: "Total",
                value: summary.total || 0,
                icon: "📋",
                color: COLORS.primary,
              },
              {
                label: "Succès",
                value: summary.success || 0,
                icon: "✅",
                color: COLORS.success,
              },
              {
                label: "En attente",
                value: summary.pending || 0,
                icon: "⏳",
                color: "#D97706",
              },
              {
                label: "Montant total",
                value: `${(summary.total_amount || 0).toFixed(2)} MUR`,
                icon: "💰",
                color: COLORS.success,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: COLORS.card,
                  borderRadius: 12,
                  padding: "16px 20px",
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 6 }}>{stat.icon}</div>
                <div
                  style={{ fontSize: 24, fontWeight: 700, color: stat.color }}
                >
                  {stat.value}
                </div>
                <div
                  style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Filtres */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {["all", "success", "pending", "failed"].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setFilterStatus(s);
                  loadPayments(siteId, s);
                }}
                style={{
                  padding: "6px 16px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: filterStatus === s ? COLORS.primary : "#fff",
                  color: filterStatus === s ? "#fff" : COLORS.text,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {s === "all"
                  ? "Tous"
                  : s === "success"
                    ? "Succès"
                    : s === "pending"
                      ? "En attente"
                      : "Échoués"}
              </button>
            ))}
            <button
              onClick={() => loadPayments(siteId, filterStatus)}
              style={{
                marginLeft: "auto",
                padding: "6px 16px",
                borderRadius: 8,
                border: `1px solid ${COLORS.primary}`,
                background: "transparent",
                color: COLORS.primary,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              🔄 Rafraîchir
            </button>
          </div>

          {/* Table */}
          <div
            style={{
              background: COLORS.card,
              borderRadius: 12,
              border: `1px solid ${COLORS.border}`,
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    background: "#F8FAFC",
                    borderBottom: `1px solid ${COLORS.border}`,
                  }}
                >
                  {[
                    "Commande",
                    "Client",
                    "Montant",
                    "Statut",
                    "Date",
                    "Lien",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 600,
                        color: COLORS.muted,
                        textTransform: "uppercase",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: 40,
                        textAlign: "center",
                        color: COLORS.muted,
                      }}
                    >
                      Chargement...
                    </td>
                  </tr>
                ) : payments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: 40,
                        textAlign: "center",
                        color: COLORS.muted,
                      }}
                    >
                      Aucun paiement trouvé
                    </td>
                  </tr>
                ) : (
                  payments.map((p, i) => (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: `1px solid ${COLORS.border}`,
                        background: i % 2 === 0 ? "#fff" : "#FAFAFA",
                      }}
                    >
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {p.id_order}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 13 }}>
                        {p.client_first_name} {p.client_last_name}
                        <div style={{ fontSize: 11, color: COLORS.muted }}>
                          {p.client_email}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {parseFloat(p.amount).toFixed(2)} {p.currency}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {statusBadge(p.status)}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 12,
                          color: COLORS.muted,
                        }}
                      >
                        {new Date(p.created_at).toLocaleString("fr-FR")}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {p.payment_link && (
                          <a
                            href={p.payment_link}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: COLORS.primary,
                              fontSize: 12,
                              textDecoration: "none",
                            }}
                          >
                            🔗 Lien
                          </a>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ===== TAB: CREDENTIALS ===== */}
      {tab === "credentials" && (
        <div style={{ maxWidth: 560 }}>
          <div
            style={{
              background: COLORS.card,
              borderRadius: 12,
              border: `1px solid ${COLORS.border}`,
              padding: 28,
            }}
          >
            <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>
              ⚙️ Credentials MiPS
            </h2>
            <p
              style={{ margin: "0 0 24px", fontSize: 13, color: COLORS.muted }}
            >
              Entrez vos identifiants MiPS fournis par votre banque.
            </p>

            {[
              {
                key: "id_merchant",
                label: "ID Merchant",
                placeholder: "q7r79YV13Xji...",
              },
              {
                key: "id_entity",
                label: "ID Entity",
                placeholder: "Dem1091uOLSI...",
              },
              {
                key: "id_operator",
                label: "ID Operator",
                placeholder: "w8kvu7ShJrbR...",
              },
              {
                key: "operator_password",
                label: "Operator Password",
                placeholder: "••••••••••••",
                type: "password",
              },
            ].map((field) => (
              <div key={field.key} style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 6,
                    color: COLORS.text,
                  }}
                >
                  {field.label}
                </label>
                <input
                  type={field.type || "text"}
                  placeholder={field.placeholder}
                  value={credentials[field.key] || ""}
                  onChange={(e) =>
                    setCredentials((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    fontSize: 14,
                    border: `1.5px solid ${COLORS.border}`,
                    outline: "none",
                    fontFamily: "monospace",
                    boxSizing: "border-box",
                    transition: "border-color 0.2s",
                  }}
                />
              </div>
            ))}

            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: COLORS.text,
                }}
              >
                Devise
              </label>
              <select
                value={credentials.currency || "MUR"}
                onChange={(e) =>
                  setCredentials((prev) => ({
                    ...prev,
                    currency: e.target.value,
                  }))
                }
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: `1.5px solid ${COLORS.border}`,
                  fontSize: 14,
                  background: "#fff",
                }}
              >
                <option value="MUR">MUR — Roupie mauricienne</option>
                <option value="USD">USD — Dollar américain</option>
                <option value="EUR">EUR — Euro</option>
              </select>
            </div>

            {saveMsg && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  marginBottom: 16,
                  background: saveMsg.startsWith("✅") ? "#DCFCE7" : "#FEE2E2",
                  color: saveMsg.startsWith("✅") ? "#16A34A" : "#DC2626",
                  fontSize: 13,
                }}
              >
                {saveMsg}
              </div>
            )}

            <button
              onClick={saveCredentials}
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                border: "none",
                background: loading ? "#93C5FD" : COLORS.primary,
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "background 0.2s",
              }}
            >
              {loading ? "Sauvegarde..." : "💾 Sauvegarder les credentials"}
            </button>

            <div
              style={{
                marginTop: 20,
                padding: 14,
                background: "#FEF9C3",
                borderRadius: 8,
                fontSize: 12,
                color: "#92400E",
              }}
            >
              <strong>🔒 Sécurité :</strong> Vos credentials sont chiffrés et
              stockés de manière sécurisée dans Supabase. Ne partagez jamais
              votre Operator Password.
            </div>
          </div>

          {/* Webhook info */}
          <div
            style={{
              background: COLORS.card,
              borderRadius: 12,
              border: `1px solid ${COLORS.border}`,
              padding: 24,
              marginTop: 16,
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>
              🔗 URL Webhook IMN
            </h3>
            <p style={{ fontSize: 13, color: COLORS.muted, marginBottom: 10 }}>
              Configurez cette URL dans votre portail MiPS pour recevoir les
              notifications de paiement :
            </p>
            <code
              style={{
                display: "block",
                background: "#F1F5F9",
                padding: "10px 14px",
                borderRadius: 8,
                fontSize: 12,
                wordBreak: "break-all",
                color: COLORS.primary,
              }}
            >
              https://your-backend-domain.com/api/webhook
            </code>
          </div>
        </div>
      )}
    </div>
  );
}

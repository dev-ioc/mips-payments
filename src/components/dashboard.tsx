import React, { useState, useEffect } from "react";
import { dashboard } from "@wix/dashboard";

declare global {
  interface Window {
    wix: any;
    wixEssentials: any;
    Wix: any;
  }
}

const BACKEND = import.meta.env.PROD
  ? "https://ton-backend-prod.com"
  : "http://localhost:3000";

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
  const [authToken, setAuthToken] = useState<string>("");

  // Fonction pour récupérer le token Wix
  const getWixToken = async (): Promise<string> => {
    try {
      // Méthode 1: Via window.wix (le plus courant)
      if (window.wix && window.wix.auth) {
        const token = await window.wix.auth.getAccessToken();
        if (token) return token;
      }

      // Méthode 2: Via window.wixEssentials
      if (window.wixEssentials && window.wixEssentials.auth) {
        const token = await window.wixEssentials.auth.getAccessToken();
        if (token) return token;
      }

      // Méthode 3: Via l'API dashboard Wix
      const token = await dashboard.getAccessToken();
      if (token) return token;

      console.warn("Aucun token d'authentification trouvé");
      return "";
    } catch (error) {
      console.error("Erreur lors de la récupération du token:", error);
      return "";
    }
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        // Récupérer le token d'authentification
        const token = await getWixToken();
        setAuthToken(token);

        // Récupérer l'ID du site
        const url = await dashboard.getPageUrl({ pageId: "home" });
        const params = new URLSearchParams(new URL(url).search);
        const sid = params.get("siteId") || "demo-site";
        setSiteId(sid);

        console.log("Site ID:", sid);
        console.log("Token présent:", !!token);

        // Charger les données
        await Promise.all([
          loadCredentials(sid, token),
          loadPayments(sid, "all", token),
        ]);
      } catch (error) {
        console.error("Erreur initialisation:", error);
        const sid = "demo-site";
        setSiteId(sid);
        await Promise.all([
          loadCredentials(sid, ""),
          loadPayments(sid, "all", ""),
        ]);
      }
    };

    initialize();
  }, []);

  async function loadCredentials(sid: string, token: string): Promise<void> {
    try {
      console.log("Chargement credentials pour site:", sid);

      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(
        `${BACKEND}/api/merchant/get-credentials?wix_site_id=${sid}`,
        {
          method: "GET",
          headers: headers,
        },
      );

      console.log("Status réponse credentials:", response.status);

      if (!response.ok) {
        if (response.status === 401) {
          console.log("Non authentifié");
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("Réponse credentials:", data);

      if (data.configured && data.merchant) {
        setCredentials((prev) => ({
          ...prev,
          id_merchant: data.merchant.id_merchant || "",
          id_entity: data.merchant.id_entity || "",
          id_operator: data.merchant.id_operator || "",
          currency: data.merchant.currency || "MUR",
          operator_password: "",
        }));
      }
    } catch (e) {
      console.error("Erreur chargement credentials:", e);
    }
  }

  async function loadPayments(
    sid: string,
    status: string,
    token: string,
  ): Promise<void> {
    setLoading(true);
    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const url = `${BACKEND}/api/payments?wix_site_id=${sid}&status=${status}&limit=50`;
      console.log("Chargement paiements:", url);

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("Réponse paiements:", data);

      setPayments(data.payments || []);
      setSummary(data.summary || {});
    } catch (e) {
      console.error("Erreur chargement paiements:", e);
    } finally {
      setLoading(false);
    }
  }

  async function saveCredentials(): Promise<void> {
    if (!credentials.id_merchant.trim()) {
      setSaveMsg("❌ L'ID Merchant est requis");
      return;
    }
    if (!credentials.id_entity.trim()) {
      setSaveMsg("❌ L'ID Entity est requis");
      return;
    }
    if (!credentials.id_operator.trim()) {
      setSaveMsg("❌ L'ID Operator est requis");
      return;
    }
    if (!credentials.operator_password.trim()) {
      setSaveMsg("❌ Le Operator Password est requis");
      return;
    }

    setLoading(true);
    setSaveMsg("");

    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      console.log("Envoi des credentials:", {
        wix_site_id: siteId,
        ...credentials,
      });

      const response = await fetch(`${BACKEND}/api/merchant/save-credentials`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          wix_site_id: siteId,
          ...credentials,
        }),
      });

      console.log("Status réponse:", response.status);

      if (response.status === 401) {
        setSaveMsg("❌ Veuillez vous reconnecter");
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("Réponse:", data);

      if (data.success) {
        setSaveMsg("✅ Credentials sauvegardés avec succès !");
        setTimeout(() => loadCredentials(siteId, authToken), 1000);
        setCredentials((prev) => ({ ...prev, operator_password: "" }));
      } else {
        setSaveMsg(`❌ Erreur : ${data.error || "Erreur inconnue"}`);
      }
    } catch (error) {
      console.error("Erreur réseau:", error);
      setSaveMsg(
        `❌ Erreur: ${error instanceof Error ? error.message : "Impossible de contacter le serveur"}`,
      );
    } finally {
      setLoading(false);
    }
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
            onClick={() => setTab(t as "payments" | "credentials")}
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

      {/* TAB: PAYMENTS */}
      {tab === "payments" && (
        <>
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

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["all", "success", "pending", "failed"] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setFilterStatus(s);
                  loadPayments(siteId, s, authToken);
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
              onClick={() => loadPayments(siteId, filterStatus, authToken)}
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

      {/* TAB: CREDENTIALS */}
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
                key: "id_merchant" as const,
                label: "ID Merchant",
                placeholder: "q7r79YV13Xji...",
              },
              {
                key: "id_entity" as const,
                label: "ID Entity",
                placeholder: "Dem1091uOLSI...",
              },
              {
                key: "id_operator" as const,
                label: "ID Operator",
                placeholder: "w8kvu7ShJrbR...",
              },
              {
                key: "operator_password" as const,
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
              stockés de manière sécurisée dans Supabase.
            </div>
          </div>

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
              {BACKEND}/api/webhook
            </code>
          </div>
        </div>
      )}
    </div>
  );
}

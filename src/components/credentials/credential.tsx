import React, { useState, useEffect } from "react";
// import { dashboard } from "@wix/dashboard";
import { Loader2, Key, CheckCircle } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

declare global {
  interface Window {
    wix: any;
    wixEssentials: any;
    Wix: any;
  }
}

const BACKEND = import.meta.env.PROD
  ? "https://0464-102-18-5-16.ngrok-free.app"
  : "http://localhost:3000";

// type Credentials = {
//   id: string;
//   id_merchant: string;
//   id_entity: string;
//   id_operator: string;
//   operator_password: string;
//   currency: string;
//   request_mode: string;
//   sending_mode: string;
//   wix_site_id: string;
//   is_active: boolean;
// };

const requestModeLabels: Record<string, string> = {
  simple: "Simple (paiement unique)",
  deposit: "Dépôt",
  odrp: "ODRP",
  membership: "Abonnement",
  bill_presentment: "Présentation de facture",
};

const currencyLabels: Record<string, string> = {
  MUR: "MUR — Roupie mauricienne",
  USD: "USD — Dollar américain",
  EUR: "EUR — Euro",
  GBP: "GBP — Livre sterling",
  ZAR: "ZAR — Rand sud-africain",
};

const requestSendingLables: Record<string, string> = {
  link: "Lien (le client reçoit un lien)",
  mail: "Email (MiPS envoie l'email)",
  sms: "SMS (MiPS envoie un SMS)",
};

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: "text" | "password";
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  value,
  onChange,
  error,
  type = "text",
}) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[12px] font-semibold text-gray-600">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2.5 rounded-lg text-[13px] font-mono border border-gray-200 bg-gray-50 focus:border-accent outline-none"
    />
    {error && <p className="text-[11px] text-red-500">{error}</p>}
  </div>
);

const CredentialsPage = () => {
  const [form, setForm] = useState({
    id_merchant: "",
    id_entity: "",
    id_operator: "",
    operator_password: "",
    currency: "MUR",
    request_mode: "simple",
    sending_mode: "link",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [siteId, setSiteId] = useState<string>(
    "3d72081f-c317-4793-8908-49e61bfcae47",
  );
  const [authToken, setAuthToken] = useState<string>("");
  const [isInitializing, setIsInitializing] = useState(true);
  function getSiteIdFromInstance(): string {
    try {
      const params = new URLSearchParams(window.location.search);
      const instance = params.get("instance");
      if (!instance) return "";

      // Le token Wix est un JWT non signé côté client : header.payload.signature
      const parts = instance.split(".");
      if (parts.length < 2) return "";

      // Décoder le payload base64
      const payload = JSON.parse(
        atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      console.log("📦 Instance payload:", payload);

      return (
        payload.metaSiteId || payload.siteOwnerId || payload.instanceId || ""
      );
    } catch (e) {
      console.warn("Décodage instance échoué:", e);
      return "";
    }
  }
  // ── Récupérer le site ID ──
  function getSiteId(): string {
    // Méthode 1 — instance JWT dans l'URL (le plus fiable dans le dashboard Wix)
    const fromInstance = getSiteIdFromInstance();
    if (fromInstance) {
      console.log("✅ Site ID via instance JWT:", fromInstance);
      return fromInstance;
    }

    // Méthode 2 — Path /dashboard/{siteId}/...
    const pathMatch = window.location.pathname.match(
      /\/dashboard\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/,
    );
    if (pathMatch) {
      console.log("✅ Site ID via pathname:", pathMatch[1]);
      return pathMatch[1];
    }

    // Méthode 3 — Query params
    const params = new URLSearchParams(window.location.search);
    const id =
      params.get("tenantId") ||
      params.get("metaSiteId") ||
      params.get("siteId");
    if (id) {
      console.log("✅ Site ID via query param:", id);
      return id;
    }

    // Méthode 4 — Referrer
    if (document.referrer) {
      try {
        const refUrl = new URL(document.referrer);
        const refPathMatch = refUrl.pathname.match(
          /\/dashboard\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/,
        );
        if (refPathMatch) {
          console.log("✅ Site ID via referrer path:", refPathMatch[1]);
          return refPathMatch[1];
        }
        const refParams = new URLSearchParams(refUrl.search);
        const refId = refParams.get("tenantId") || refParams.get("metaSiteId");
        if (refId) {
          console.log("✅ Site ID via referrer params:", refId);
          return refId;
        }
      } catch (e) {}
    }

    console.error("❌ Site ID introuvable");
    return "";
  }
  const getAuthToken = async (): Promise<string | null> => {
    try {
      const localToken = localStorage.getItem("token");
      if (localToken) {
        return localToken;
      }
      const sessionToken = sessionStorage.getItem("token");
      if (sessionToken) {
        return sessionToken;
      }
      if (typeof window !== "undefined" && window.wixEssentials) {
        const token = await window.wixEssentials.auth.getMemberToken();
        if (token) {
          return token;
        }
      }
      if (typeof window !== "undefined" && window.Wix) {
        const token = await window.Wix.getAuthToken();
        if (token) {
          console.log("✅ Token récupéré via Wix SDK");
          return token;
        }
      }
      if (import.meta.env.DEV) {
        console.warn(
          "⚠️ Mode développement: utilisation d'un token temporaire",
        );
        return "dev-token-temp";
      }

      console.error("Impossible de récupérer le token d'authentification");
      return null;
    } catch (error) {
      console.error("Erreur récupération token:", error);
      return null;
    }
  };
  useEffect(() => {
    const init = async () => {
      setIsInitializing(true);
      try {
        const [token, sid] = await Promise.all([getAuthToken(), getSiteId()]);

        if (token) {
          setAuthToken(token);
          localStorage.setItem("token", token);
        }
        if (sid) setSiteId(sid);

        console.log("📍 SiteId:", sid);
        console.log("🔑 Token:", token ? token.slice(0, 20) + "..." : "aucun");

        if (token) await loadCredentials(token);
      } catch (e) {
        console.error("Init error:", e);
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, []);
  // ── Charger les credentials par user_id (via token) ──
  async function loadCredentials(token: string): Promise<void> {
    try {
      const response = await fetch(`${BACKEND}/api/merchant/get-credentials`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        console.warn("Token invalide ou expiré");
        localStorage.removeItem("token");
        return;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      console.log("📦 Credentials chargés:", data);

      if (data.configured && data.merchant) {
        setForm({
          id_merchant: data.merchant.id_merchant || "",
          id_entity: data.merchant.id_entity || "",
          id_operator: data.merchant.id_operator || "",
          operator_password: data.merchant.operator_password || "",
          currency: data.merchant.currency || "MUR",
          request_mode: data.merchant.request_mode || "simple",
          sending_mode: data.merchant.sending_mode || "link",
        });
        setEditing(true);
      }
    } catch (e) {
      console.error("Erreur chargement credentials:", e);
    }
  }

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.id_merchant.trim())
      newErrors.id_merchant = "L'ID Merchant est requis";
    if (!form.id_entity.trim()) newErrors.id_entity = "L'ID Entity est requis";
    if (!form.id_operator.trim())
      newErrors.id_operator = "L'ID Operator est requis";
    if (!form.operator_password.trim() && !editing)
      newErrors.operator_password = "Le mot de passe est requis";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const saveCredentials = async () => {
    if (!validate()) return;
    setIsSaving(true);
    console.log("📍 Sauvegarde avec siteId:", siteId);

    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };

      // Récupérer le token à nouveau avant d'envoyer
      let token = authToken || null;
      if (!token || token === "dev-token-temp") {
        token = await getAuthToken();
        if (token) setAuthToken(token);
      }

      if (token && token !== "dev-token-temp") {
        headers["Authorization"] = `Bearer ${token}`;
        console.log(
          "Token envoyé (premiers 20 chars):",
          token.substring(0, 20),
        );
      } else {
        console.warn("⚠️ Pas de token d'authentification disponible");
      }
      console.log("📍 Sauvegarde avec siteId:", siteId);
      const response = await fetch(`${BACKEND}/api/merchant/save-credentials`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          wix_site_id: "3d72081f-c317-4793-8908-49e61bfcae47",
          ...form,
        }),
      });

      if (response.status === 401) {
        toast.error("Session expirée. Veuillez vous reconnecter.");
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        toast.success(
          editing ? "Credentials mis à jour !" : "Credentials sauvegardés !",
        );
        setEditing(true);
        setForm((prev) => ({ ...prev }));
      } else {
        toast.error(data.error || "Erreur lors de la sauvegarde");
      }
    } catch (error) {
      console.error("Erreur réseau:", error);
      toast.error(
        `Erreur: ${error instanceof Error ? error.message : "Impossible de contacter le serveur"}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isInitializing) {
    return (
      <div className="w-full flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full flex items-center justify-center relative">
      {isSaving && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
        </div>
      )}
      <Toaster position="top-right" reverseOrder={false} />
      <div className="w-full flex-col items-center justify-center credentials-page">
        <div className="md:flex items-center justify-between mb-7 gap-4">
          <div className="py-4">
            <h1 className="text-[22px] font-bold tracking-tight text-gray-900 text-primary">
              Credentials MIPS
            </h1>
            <p className="text-[13px] text-gray-500 mt-1">
              Gérez vos identifiants de connexion.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-[38px] h-[38px] bg-orange-40 rounded-xl flex items-center justify-center">
                <Key size={18} className="text-accent" />
              </div>
              <div>
                <div className="text-[14px] font-bold text-gray-900">
                  Mes identifiants MIPS
                </div>
                <div className="text-[12px] text-gray-500">
                  Fournis par MIPS lors de la création de votre compte
                </div>
              </div>
            </div>
          </div>

          {form.id_merchant && editing && (
            <div className="flex items-center gap-2 bg-teal-50 border border-teal-100 rounded-xl px-4 py-3 text-[13px] text-teal-700 mb-5">
              <CheckCircle size={16} /> Credentials valides — API MIPS
              accessible
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveCredentials();
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-4 mb-4">
              <FormField
                label="Identifiant Marchand"
                value={form.id_merchant}
                onChange={(v) => update("id_merchant", v)}
                error={errors.id_merchant}
                type="password"
              />
              <FormField
                label="Identifiant Entité"
                value={form.id_entity}
                onChange={(v) => update("id_entity", v)}
                error={errors.id_entity}
                type="password"
              />
              <FormField
                label="Identifiant Opérateur"
                value={form.id_operator}
                onChange={(v) => update("id_operator", v)}
                error={errors.id_operator}
                type="password"
              />
              <FormField
                label="Mot de passe Opérateur"
                value={form.operator_password}
                onChange={(v) => update("operator_password", v)}
                type="password"
                error={errors.operator_password}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-gray-600">
                  Mode de paiement
                </label>
                <select
                  value={form.request_mode}
                  onChange={(e) => update("request_mode", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg text-[13px] font-mono border border-gray-200 bg-gray-50 focus:border-accent outline-none"
                >
                  {Object.entries(requestModeLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-gray-600">
                  Devise
                </label>
                <select
                  value={form.currency}
                  onChange={(e) => update("currency", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg text-[13px] font-mono border border-gray-200 bg-gray-50 focus:border-accent outline-none"
                >
                  {Object.entries(currencyLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-gray-600">
                Mode d'envoi
              </label>
              <select
                value={form.sending_mode}
                onChange={(e) => update("sending_mode", e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-[13px] font-mono border border-gray-200 bg-gray-50 focus:border-accent outline-none"
              >
                {Object.entries(requestSendingLables).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2.5">
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 rounded-full text-[13px] font-semibold border border-gray-200 bg-primary text-white hover:border-gray-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? "Enregistrement..." : "Enregistrer les credentials"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CredentialsPage;

import React, { useState, useEffect } from "react";
import { dashboard } from "@wix/dashboard";
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
  ? "https://ton-backend-prod.com"
  : "http://localhost:3000";

type Credentials = {
  id: string;
  id_merchant: string;
  id_entity: string;
  id_operator: string;
  operator_password: string;
  currency: string;
  request_mode: string;
  sending_mode: string;
  wix_site_id: string;
  is_active: boolean;
};

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
  noaction: "Aucune action (lien uniquement)",
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
  const [siteId, setSiteId] = useState<string>("");
  const [authToken, setAuthToken] = useState<string>("");
  const [tokenReady, setTokenReady] = useState<boolean>(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const allowedOrigin = import.meta.env.PROD
        ? "https://ton-domaine-prod.com"
        : "http://localhost:4321";

      if (event.origin !== allowedOrigin) return;

      if (event.data?.type === "AUTH_TOKEN" && event.data?.token) {
        console.log("✅ Token reçu via postMessage");
        setAuthToken(event.data.token);
        setTokenReady(true);
      }
    };

    window.addEventListener("message", handleMessage);
    window.parent.postMessage({ type: "IFRAME_READY" }, "*");

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (!tokenReady || !authToken) return;

    const initialize = async () => {
      try {
        const url = await dashboard.getPageUrl({ pageId: "home" });
        const params = new URLSearchParams(new URL(url).search);
        const sid = params.get("siteId") || "demo-site";
        setSiteId(sid);
        await loadCredentials(sid, authToken);
      } catch (error) {
        console.error("Erreur initialisation:", error);
        const sid = "demo-site";
        setSiteId(sid);
        await loadCredentials(sid, authToken);
      }
    };

    initialize();
  }, [tokenReady, authToken]);

  async function loadCredentials(sid: string, token: string): Promise<void> {
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch(
        `${BACKEND}/api/merchant/get-credentials?wix_site_id=${sid}`,
        { method: "GET", headers },
      );

      if (!response.ok) {
        if (response.status === 401) return;
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.configured && data.merchant) {
        setForm({
          id_merchant: data.merchant.id_merchant || "",
          id_entity: data.merchant.id_entity || "",
          id_operator: data.merchant.id_operator || "",
          operator_password: "",
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

    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const response = await fetch(`${BACKEND}/api/merchant/save-credentials`, {
        method: "POST",
        headers,
        body: JSON.stringify({ wix_site_id: siteId, ...form }),
      });

      if (response.status === 401) {
        toast.error("Veuillez vous reconnecter");
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
        setForm((prev) => ({ ...prev, operator_password: "" }));
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

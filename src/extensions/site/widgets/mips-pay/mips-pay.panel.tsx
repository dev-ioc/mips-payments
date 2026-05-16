// src/extensions/site/widgets/mips-pay/mips-pay.panel.tsx
// Panel de configuration MiPS — credentials chiffrés AES-256-GCM, stockés comme prop Wix

import React, {
  type FC,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { widget } from "@wix/editor";
import {
  SidePanel,
  WixDesignSystemProvider,
  Input,
  FormField,
  ColorInput,
  NumberInput,
  Dropdown,
  Text,
  Divider,
  SectionHelper,
  Button,
  Loader,
  IconButton,
} from "@wix/design-system";
import "@wix/design-system/styles.global.css";

// ─── Clé de dérivation — IDENTIQUE à mips-pay.tsx ────────────────────────────
const DERIVE_PASSPHRASE = "mips-wix-secure-2025";

// ─── Crypto helpers ───────────────────────────────────────────────────────────
async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("mips-salt-fixed"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptCredentials(data: object): Promise<string> {
  const key = await deriveKey(DERIVE_PASSPHRASE);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(data)),
  );
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function decryptCredentials(
  ciphertext: string,
): Promise<Record<string, string>> {
  const key = await deriveKey(DERIVE_PASSPHRASE);
  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface CredentialsForm {
  id_merchant: string;
  id_entity: string;
  id_operator: string;
  operator_password: string;
  imn_salt: string;
  imn_cipher_key: string;
  auth_basic_username: string;
  auth_basic_password: string;
}

interface WidgetConfig {
  "button-text": string;
  "button-color": string;
  amount: string;
  currency: string;
  "payment-title": string;
  "request-mode": string;
  "amount-source": string;
}

const EMPTY_CREDS: CredentialsForm = {
  id_merchant: "",
  id_entity: "",
  id_operator: "",
  operator_password: "",
  imn_salt: "",
  imn_cipher_key: "",
  auth_basic_username: "",
  auth_basic_password: "",
};

// ─── Options dropdowns ────────────────────────────────────────────────────────
const CURRENCY_OPTIONS = [
  { id: "MUR", value: "MUR — Roupie mauricienne" },
  { id: "USD", value: "USD — Dollar américain" },
  { id: "EUR", value: "EUR — Euro" },
  { id: "GBP", value: "GBP — Livre sterling" },
  { id: "MGA", value: "MGA — Ariary malgache" },
];

const REQUEST_MODE_OPTIONS = [
  { id: "simple", value: "Simple (paiement unique)" },
  { id: "deposit", value: "Dépôt" },
  { id: "odrp", value: "ODRP" },
  { id: "membership", value: "Abonnement" },
  { id: "bill_presentment", value: "Présentation de facture" },
];

const AMOUNT_SOURCE_OPTIONS = [
  { id: "fixed", value: "Montant fixe" },
  { id: "cart", value: "Panier Wix (automatique)" },
  { id: "selector", value: "Sélecteur CSS" },
];

// ─── Champ credentials avec toggle visibilité ─────────────────────────────────
const SecureInput: FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}> = ({ label, value, onChange, placeholder, required, hint }) => {
  const [visible, setVisible] = useState(false);
  return (
    <SidePanel.Field>
      <FormField label={`${label}${required ? " *" : ""}`} infoContent={hint}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder || ""}
              type={visible ? "text" : "password"}
            />
          </div>
          <button
            onClick={() => setVisible((v) => !v)}
            style={{
              background: "none",
              border: "1px solid #E2E8F0",
              borderRadius: "6px",
              padding: "6px 8px",
              cursor: "pointer",
              color: "#64748B",
              fontSize: "12px",
              flexShrink: 0,
            }}
            title={visible ? "Masquer" : "Afficher"}
          >
            {visible ? "🙈" : "👁"}
          </button>
        </div>
      </FormField>
    </SidePanel.Field>
  );
};

// ─── Panel principal ──────────────────────────────────────────────────────────
const Panel: FC = () => {
  const [config, setConfig] = useState<WidgetConfig>({
    "button-text": "Payer avec MiPS",
    "button-color": "#2563EB",
    amount: "",
    currency: "MUR",
    "payment-title": "Paiement",
    "request-mode": "simple",
    "amount-source": "fixed",
  });

  const [creds, setCreds] = useState<CredentialsForm>(EMPTY_CREDS);
  const [credsSaved, setCredsSaved] = useState(false);
  const [showCredsForm, setShowCredsForm] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsStatus, setCredsStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [credsMessage, setCredsMessage] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(true);

  // ── Chargement initial ──────────────────────────────────────────────────────
  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoadingConfig(true);
    try {
      const widgetKeys: (keyof WidgetConfig)[] = [
        "button-text",
        "button-color",
        "amount",
        "currency",
        "payment-title",
        "request-mode",
        "amount-source",
      ];
      const results = await Promise.all(
        widgetKeys.map((k) => widget.getProp(k).then((v) => ({ k, v }))),
      );
      const loaded: Partial<WidgetConfig> = {};
      results.forEach(({ k, v }) => {
        if (v && v !== "undefined" && v !== "null") loaded[k] = v;
      });
      setConfig((prev) => ({ ...prev, ...loaded }));

      // Charger les credentials chiffrés
      const encrypted = await widget.getProp("encrypted-credentials");
      if (
        encrypted &&
        encrypted !== "undefined" &&
        encrypted !== "null" &&
        encrypted !== ""
      ) {
        setCredsSaved(true);
        // Déchiffrer pour pré-remplir le formulaire
        try {
          const dec = await decryptCredentials(encrypted);
          setCreds({
            id_merchant: dec.id_merchant || "",
            id_entity: dec.id_entity || "",
            id_operator: dec.id_operator || "",
            operator_password: dec.operator_password || "",
            imn_salt: dec.imn_salt || "",
            imn_cipher_key: dec.imn_cipher_key || "",
            auth_basic_username: dec.auth_basic_username || "",
            auth_basic_password: dec.auth_basic_password || "",
          });
        } catch {
          // Credentials existants mais ne peuvent pas être déchiffrés (changement de passphrase?)
          setCredsSaved(true);
        }
      }
    } catch (err) {
      console.error("Erreur chargement:", err);
    } finally {
      setLoadingConfig(false);
    }
  };

  // ── Mise à jour prop widget ─────────────────────────────────────────────────
  const updateProp = useCallback(
    async <K extends keyof WidgetConfig>(key: K, value: string) => {
      setConfig((prev) => ({ ...prev, [key]: value }));
      try {
        await widget.setProp(key, value);
      } catch (err) {
        console.error(`Erreur sauvegarde ${key}:`, err);
      }
    },
    [],
  );

  const updateCred = (key: keyof CredentialsForm, value: string) => {
    setCreds((prev) => ({ ...prev, [key]: value }));
  };

  // ── Sauvegarde credentials chiffrés ────────────────────────────────────────
  const handleSaveCredentials = async () => {
    // Validation champs obligatoires
    const required: (keyof CredentialsForm)[] = [
      "id_merchant",
      "id_entity",
      "id_operator",
      "operator_password",
      "auth_basic_username",
      "auth_basic_password",
    ];
    const missing = required.filter((k) => !creds[k].trim());
    if (missing.length > 0) {
      setCredsStatus("error");
      setCredsMessage("Veuillez remplir tous les champs obligatoires (*).");
      return;
    }

    setSavingCreds(true);
    setCredsStatus("idle");
    setCredsMessage("");

    try {
      const encrypted = await encryptCredentials({
        id_merchant: creds.id_merchant.trim(),
        id_entity: creds.id_entity.trim(),
        id_operator: creds.id_operator.trim(),
        operator_password: creds.operator_password.trim(),
        imn_salt: creds.imn_salt.trim(),
        imn_cipher_key: creds.imn_cipher_key.trim(),
        auth_basic_username: creds.auth_basic_username.trim(),
        auth_basic_password: creds.auth_basic_password.trim(),
      });

      await widget.setProp("encrypted-credentials", encrypted);

      setCredsSaved(true);
      setShowCredsForm(false);
      setCredsStatus("success");
      setCredsMessage("✓ Credentials chiffrés et sauvegardés !");

      setTimeout(() => {
        setCredsStatus("idle");
        setCredsMessage("");
      }, 5000);
    } catch (err: any) {
      setCredsStatus("error");
      setCredsMessage(`Erreur : ${err.message || "Chiffrement échoué"}`);
    } finally {
      setSavingCreds(false);
    }
  };

  const handleDeleteCredentials = async () => {
    if (
      !window.confirm(
        "Supprimer les credentials MiPS ? Le bouton de paiement sera désactivé.",
      )
    )
      return;
    try {
      await widget.setProp("encrypted-credentials", "");
      setCredsSaved(false);
      setCreds(EMPTY_CREDS);
      setCredsStatus("idle");
    } catch (err) {
      console.error("Erreur suppression:", err);
    }
  };

  if (loadingConfig) {
    return (
      <WixDesignSystemProvider>
        <SidePanel width="300" height="100vh">
          <SidePanel.Content noPadding stretchVertically>
            <SidePanel.Field>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: "40px",
                }}
              >
                <Loader size="medium" />
              </div>
            </SidePanel.Field>
          </SidePanel.Content>
        </SidePanel>
      </WixDesignSystemProvider>
    );
  }

  return (
    <WixDesignSystemProvider>
      <SidePanel width="300" height="100vh">
        <SidePanel.Content noPadding stretchVertically>
          {/* ─── Titre ─── */}
          <SidePanel.Field>
            <Text weight="bold" size="small">
              ⚙ Configuration MiPS
            </Text>
          </SidePanel.Field>

          <Divider />

          {/* ─── Section Credentials ─── */}
          <SidePanel.Field>
            <Text weight="bold" size="small">
              🔐 Credentials MiPS
            </Text>
          </SidePanel.Field>

          {/* Statut credentials */}
          {credsSaved && !showCredsForm && (
            <SidePanel.Field>
              <SectionHelper fullWidth appearance="success">
                ✓ Credentials configurés et chiffrés (AES-256-GCM)
              </SectionHelper>
            </SidePanel.Field>
          )}

          {!credsSaved && !showCredsForm && (
            <SidePanel.Field>
              <SectionHelper fullWidth appearance="warning">
                ⚠ Aucun credential. Le bouton de paiement sera inactif.
              </SectionHelper>
            </SidePanel.Field>
          )}

          {/* Boutons gestion credentials */}
          {!showCredsForm && (
            <SidePanel.Field>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <Button
                  size="small"
                  priority={credsSaved ? "secondary" : "primary"}
                  onClick={() => setShowCredsForm(true)}
                >
                  {credsSaved ? "✏ Modifier" : "➕ Configurer"}
                </Button>
                {credsSaved && (
                  <Button
                    size="small"
                    priority="secondary"
                    skin="destructive"
                    onClick={handleDeleteCredentials}
                  >
                    🗑 Supprimer
                  </Button>
                )}
              </div>
            </SidePanel.Field>
          )}

          {/* Feedback sauvegarde */}
          {credsStatus === "success" && (
            <SidePanel.Field>
              <SectionHelper fullWidth appearance="success">
                {credsMessage}
              </SectionHelper>
            </SidePanel.Field>
          )}
          {credsStatus === "error" && (
            <SidePanel.Field>
              <SectionHelper fullWidth appearance="danger">
                {credsMessage}
              </SectionHelper>
            </SidePanel.Field>
          )}

          {/* Formulaire credentials */}
          {showCredsForm && (
            <>
              <SidePanel.Field>
                <SectionHelper fullWidth appearance="standard">
                  🔒 Les credentials sont chiffrés avec AES-256-GCM avant
                  stockage. Ils ne quittent jamais votre navigateur en clair.
                </SectionHelper>
              </SidePanel.Field>

              {/* Identifiants MiPS */}
              <SidePanel.Field>
                <Text size="tiny" secondary>
                  — Identifiants MiPS —
                </Text>
              </SidePanel.Field>

              <SecureInput
                label="Identifiant Marchand"
                value={creds.id_merchant}
                onChange={(v) => updateCred("id_merchant", v)}
                placeholder="ex: 12345"
                required
                hint="id_merchant fourni par MiPS"
              />

              <SecureInput
                label="Identifiant Entité"
                value={creds.id_entity}
                onChange={(v) => updateCred("id_entity", v)}
                placeholder="ex: 1"
                required
                hint="id_entity fourni par MiPS"
              />

              <SecureInput
                label="Identifiant Opérateur"
                value={creds.id_operator}
                onChange={(v) => updateCred("id_operator", v)}
                placeholder="ex: operator123"
                required
                hint="id_operator fourni par MiPS"
              />

              <SecureInput
                label="Mot de passe Opérateur"
                value={creds.operator_password}
                onChange={(v) => updateCred("operator_password", v)}
                placeholder="••••••••"
                required
                hint="operator_password fourni par MiPS"
              />

              {/* Auth Basic */}
              <SidePanel.Field>
                <Text size="tiny" secondary>
                  — Authentification Basic —
                </Text>
              </SidePanel.Field>

              <SecureInput
                label="Nom d'utilisateur MiPS"
                value={creds.auth_basic_username}
                onChange={(v) => updateCred("auth_basic_username", v)}
                placeholder="username"
                required
                hint="Identifiant pour l'authentification HTTP Basic Auth"
              />

              <SecureInput
                label="Mot de passe MiPS"
                value={creds.auth_basic_password}
                onChange={(v) => updateCred("auth_basic_password", v)}
                placeholder="••••••••"
                required
                hint="Mot de passe pour l'authentification HTTP Basic Auth"
              />

              {/* IMN (callbacks) */}
              <SidePanel.Field>
                <Text size="tiny" secondary>
                  — Callbacks IMN (optionnel) —
                </Text>
              </SidePanel.Field>

              <SecureInput
                label="Salt MiPS"
                value={creds.imn_salt}
                onChange={(v) => updateCred("imn_salt", v)}
                placeholder="salt IMN"
                hint="Utilisé pour déchiffrer les callbacks IMN"
              />

              <SecureInput
                label="Clé de chiffrement MiPS"
                value={creds.imn_cipher_key}
                onChange={(v) => updateCred("imn_cipher_key", v)}
                placeholder="cipher key IMN"
                hint="Clé utilisée pour déchiffrer les callbacks IMN"
              />

              {/* Boutons formulaire */}
              <SidePanel.Field>
                <div style={{ display: "flex", gap: "8px" }}>
                  <Button
                    onClick={handleSaveCredentials}
                    disabled={savingCreds}
                    size="small"
                  >
                    {savingCreds ? (
                      <Loader size="tiny" />
                    ) : (
                      "🔒 Chiffrer & Sauvegarder"
                    )}
                  </Button>
                  <Button
                    size="small"
                    priority="secondary"
                    onClick={() => {
                      setShowCredsForm(false);
                      setCredsStatus("idle");
                    }}
                  >
                    Annuler
                  </Button>
                </div>
              </SidePanel.Field>

              {credsStatus === "error" && (
                <SidePanel.Field>
                  <SectionHelper fullWidth appearance="danger">
                    {credsMessage}
                  </SectionHelper>
                </SidePanel.Field>
              )}
            </>
          )}

          <Divider />

          {/* ─── Apparence ─── */}
          <SidePanel.Field>
            <Text weight="bold" size="small">
              🎨 Apparence
            </Text>
          </SidePanel.Field>

          <SidePanel.Field>
            <FormField label="Texte du bouton">
              <Input
                value={config["button-text"]}
                onChange={(e) => updateProp("button-text", e.target.value)}
                placeholder="Payer avec MiPS"
              />
            </FormField>
          </SidePanel.Field>

          <SidePanel.Field>
            <FormField label="Couleur du bouton">
              <ColorInput
                value={config["button-color"]}
                onChange={(value) =>
                  updateProp("button-color", value as string)
                }
              />
            </FormField>
          </SidePanel.Field>

          <Divider />

          {/* ─── Paiement ─── */}
          <SidePanel.Field>
            <Text weight="bold" size="small">
              💳 Paiement
            </Text>
          </SidePanel.Field>

          <SidePanel.Field>
            <FormField label="Titre du paiement">
              <Input
                value={config["payment-title"]}
                onChange={(e) => updateProp("payment-title", e.target.value)}
                placeholder="ex: Réservation"
              />
            </FormField>
          </SidePanel.Field>

          <SidePanel.Field>
            <FormField label="Source du montant">
              <Dropdown
                selectedId={config["amount-source"] || "fixed"}
                options={AMOUNT_SOURCE_OPTIONS}
                onSelect={(opt) =>
                  updateProp("amount-source", opt.id as string)
                }
              />
            </FormField>
          </SidePanel.Field>

          {(config["amount-source"] === "fixed" ||
            !config["amount-source"]) && (
            <SidePanel.Field>
              <FormField label="Montant">
                <NumberInput
                  value={parseFloat(config["amount"]) || 0}
                  onChange={(value) =>
                    updateProp("amount", String(value || ""))
                  }
                  placeholder="ex: 150.00"
                  suffix={
                    <Text size="small" secondary>
                      {config["currency"]}
                    </Text>
                  }
                />
              </FormField>
            </SidePanel.Field>
          )}

          <SidePanel.Field>
            <FormField label="Devise">
              <Dropdown
                selectedId={config["currency"]}
                options={CURRENCY_OPTIONS}
                onSelect={(opt) => updateProp("currency", opt.id as string)}
              />
            </FormField>
          </SidePanel.Field>

          <SidePanel.Field>
            <FormField
              label="Mode de paiement"
              infoContent="Type de paiement MiPS"
            >
              <Dropdown
                selectedId={config["request-mode"]}
                options={REQUEST_MODE_OPTIONS}
                onSelect={(opt) => updateProp("request-mode", opt.id as string)}
              />
            </FormField>
          </SidePanel.Field>
        </SidePanel.Content>

        {/* ─── Footer ─── */}
        <SidePanel.Footer noPadding>
          <SectionHelper fullWidth appearance="warning" border="topBottom">
            🔐 Chiffrement AES-256-GCM. Vos credentials ne sont jamais envoyés à
            un serveur tiers — ils sont déchiffrés uniquement dans le navigateur
            de l'acheteur au moment du paiement.
          </SectionHelper>
        </SidePanel.Footer>
      </SidePanel>
    </WixDesignSystemProvider>
  );
};

export default Panel;

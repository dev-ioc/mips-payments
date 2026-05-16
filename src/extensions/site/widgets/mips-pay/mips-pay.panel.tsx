// src/extensions/site/widgets/mips-pay/mips-pay.panel.tsx
// Panel de configuration MiPS — credentials chiffrés, stockés comme prop Wix

import React, { type FC, useState, useEffect, useCallback } from "react";
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
} from "@wix/design-system";
import "@wix/design-system/styles.global.css";

// ─── Clé de dérivation (doit être identique dans mips-pay.tsx) ───────────────
const DERIVE_PASSPHRASE = "mips-wix-secure-2025";

// ─── Utilitaires crypto ───────────────────────────────────────────────────────
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

// ─── Options ──────────────────────────────────────────────────────────────────
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
  { id: "cart", value: "Panier Wix (automatique)" },
  { id: "fixed", value: "Montant fixe" },
  { id: "selector", value: "Sélecteur CSS" },
];

// ─── Composant Panel ─────────────────────────────────────────────────────────
const Panel: FC = () => {
  // Config widget (apparence + paiement)
  const [config, setConfig] = useState<WidgetConfig>({
    "button-text": "Payer avec MiPS",
    "button-color": "#2563EB",
    amount: "",
    currency: "MUR",
    "payment-title": "Paiement",
    "request-mode": "simple",
    "amount-source": "fixed",
  });

  // Formulaire credentials (en clair, uniquement dans le panel)
  const [creds, setCreds] = useState<CredentialsForm>({
    id_merchant: "",
    id_entity: "",
    id_operator: "",
    operator_password: "",
    imn_salt: "",
    imn_cipher_key: "",
    auth_basic_username: "",
    auth_basic_password: "",
  });

  const [credentialsEncrypted, setCredentialsEncrypted] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsStatus, setCredsStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [credsMessage, setCredsMessage] = useState("");
  const [showCreds, setShowCreds] = useState(false);

  // Chargement initial
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const widgetKeys: (keyof WidgetConfig)[] = [
      "button-text",
      "button-color",
      "amount",
      "currency",
      "payment-title",
      "request-mode",
      "amount-source",
    ];
    try {
      const results = await Promise.all(
        widgetKeys.map((k) => widget.getProp(k).then((v) => ({ k, v }))),
      );
      const loaded: Partial<WidgetConfig> = {};
      results.forEach(({ k, v }) => {
        if (v && v !== "undefined" && v !== "null") loaded[k] = v;
      });
      setConfig((prev) => ({ ...prev, ...loaded }));

      // Vérifier si des credentials chiffrés existent
      const encrypted = await widget.getProp("encrypted-credentials");
      if (encrypted && encrypted !== "undefined" && encrypted !== "null") {
        setCredentialsEncrypted(true);
        // Déchiffrer pour afficher dans le formulaire
        try {
          const decrypted = await decryptCredentials(encrypted);
          setCreds({
            id_merchant: decrypted.id_merchant || "",
            id_entity: decrypted.id_entity || "",
            id_operator: decrypted.id_operator || "",
            operator_password: decrypted.operator_password || "",
            imn_salt: decrypted.imn_salt || "",
            imn_cipher_key: decrypted.imn_cipher_key || "",
            auth_basic_username: decrypted.auth_basic_username || "",
            auth_basic_password: decrypted.auth_basic_password || "",
          });
        } catch {
          // Credentials existants mais ne peuvent pas être déchiffrés
          setCredentialsEncrypted(true);
        }
      }
    } catch (err) {
      console.error("Erreur chargement config:", err);
    }
  };

  // Mise à jour d'une prop widget (config apparence/paiement)
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

  // Mise à jour du formulaire credentials (local uniquement)
  const updateCred = (key: keyof CredentialsForm, value: string) => {
    setCreds((prev) => ({ ...prev, [key]: value }));
  };

  // Chiffrement et sauvegarde des credentials
  const handleSaveCredentials = async () => {
    // Validation
    if (
      !creds.id_merchant ||
      !creds.id_entity ||
      !creds.id_operator ||
      !creds.operator_password
    ) {
      setCredsStatus("error");
      setCredsMessage(
        "Les champs Identifiant Marchand, Entité, Opérateur et Mot de passe sont requis.",
      );
      return;
    }

    setSavingCreds(true);
    setCredsStatus("idle");
    setCredsMessage("");

    try {
      // Chiffrer les credentials
      const encrypted = await encryptCredentials({
        id_merchant: creds.id_merchant,
        id_entity: creds.id_entity,
        id_operator: creds.id_operator,
        operator_password: creds.operator_password,
        imn_salt: creds.imn_salt,
        imn_cipher_key: creds.imn_cipher_key,
        auth_basic_username: creds.auth_basic_username,
        auth_basic_password: creds.auth_basic_password,
      });

      // Sauvegarder le ciphertext comme prop Wix
      await widget.setProp("encrypted-credentials", encrypted);

      setCredentialsEncrypted(true);
      setCredsStatus("success");
      setCredsMessage("Credentials chiffrés et sauvegardés avec succès !");
      setShowCreds(false);

      setTimeout(() => {
        setCredsStatus("idle");
        setCredsMessage("");
      }, 5000);
    } catch (err: any) {
      setCredsStatus("error");
      setCredsMessage(`Erreur lors du chiffrement : ${err.message}`);
    } finally {
      setSavingCreds(false);
    }
  };

  return (
    <WixDesignSystemProvider>
      <SidePanel width="300" height="100vh">
        <SidePanel.Content noPadding stretchVertically>
          {/* ── En-tête ── */}
          <SidePanel.Field>
            <Text weight="bold" size="small">
              Configuration MiPS
            </Text>
          </SidePanel.Field>

          <Divider />

          {/* ── Section Credentials ── */}
          <SidePanel.Field>
            <Text weight="bold" size="small">
              🔐 Credentials MiPS
            </Text>
          </SidePanel.Field>

          {credentialsEncrypted && !showCreds && (
            <SidePanel.Field>
              <SectionHelper fullWidth appearance="success">
                ✓ Credentials configurés et chiffrés
              </SectionHelper>
            </SidePanel.Field>
          )}

          {!credentialsEncrypted && (
            <SidePanel.Field>
              <SectionHelper fullWidth appearance="warning">
                ⚠ Aucun credential configuré. Le bouton de paiement sera
                désactivé.
              </SectionHelper>
            </SidePanel.Field>
          )}

          <SidePanel.Field>
            <Button
              size="small"
              priority={credentialsEncrypted ? "secondary" : "primary"}
              onClick={() => setShowCreds((v) => !v)}
            >
              {showCreds
                ? "Masquer le formulaire"
                : credentialsEncrypted
                  ? "Modifier les credentials"
                  : "Configurer les credentials"}
            </Button>
          </SidePanel.Field>

          {showCreds && (
            <>
              <SidePanel.Field>
                <SectionHelper fullWidth appearance="standard">
                  Ces informations sont chiffrées (AES-256-GCM) avant d'être
                  stockées. Elles ne sont déchiffrées qu'au moment du paiement
                  dans le navigateur de l'acheteur.
                </SectionHelper>
              </SidePanel.Field>

              <SidePanel.Field>
                <FormField label="Identifiant Marchand *">
                  <Input
                    value={creds.id_merchant}
                    onChange={(e) => updateCred("id_merchant", e.target.value)}
                    placeholder="ex: 12345"
                    type="password"
                  />
                </FormField>
              </SidePanel.Field>

              <SidePanel.Field>
                <FormField label="Identifiant Entité *">
                  <Input
                    value={creds.id_entity}
                    onChange={(e) => updateCred("id_entity", e.target.value)}
                    placeholder="ex: 1"
                    type="password"
                  />
                </FormField>
              </SidePanel.Field>

              <SidePanel.Field>
                <FormField label="Identifiant Opérateur *">
                  <Input
                    value={creds.id_operator}
                    onChange={(e) => updateCred("id_operator", e.target.value)}
                    placeholder="ex: operator123"
                    type="password"
                  />
                </FormField>
              </SidePanel.Field>

              <SidePanel.Field>
                <FormField label="Mot de passe Opérateur *">
                  <Input
                    value={creds.operator_password}
                    onChange={(e) =>
                      updateCred("operator_password", e.target.value)
                    }
                    placeholder="••••••••"
                    type="password"
                  />
                </FormField>
              </SidePanel.Field>

              <SidePanel.Field>
                <FormField label="Salt IMN (pour callbacks)">
                  <Input
                    value={creds.imn_salt}
                    onChange={(e) => updateCred("imn_salt", e.target.value)}
                    placeholder="salt MiPS"
                    type="password"
                  />
                </FormField>
              </SidePanel.Field>

              <SidePanel.Field>
                <FormField label="Clé de chiffrement IMN">
                  <Input
                    value={creds.imn_cipher_key}
                    onChange={(e) =>
                      updateCred("imn_cipher_key", e.target.value)
                    }
                    placeholder="cipher key MiPS"
                    type="password"
                  />
                </FormField>
              </SidePanel.Field>

              <SidePanel.Field>
                <FormField label="Nom utilisateur Basic Auth">
                  <Input
                    value={creds.auth_basic_username}
                    onChange={(e) =>
                      updateCred("auth_basic_username", e.target.value)
                    }
                    placeholder="username"
                    type="password"
                  />
                </FormField>
              </SidePanel.Field>

              <SidePanel.Field>
                <FormField label="Mot de passe Basic Auth">
                  <Input
                    value={creds.auth_basic_password}
                    onChange={(e) =>
                      updateCred("auth_basic_password", e.target.value)
                    }
                    placeholder="••••••••"
                    type="password"
                  />
                </FormField>
              </SidePanel.Field>

              {credsStatus === "error" && (
                <SidePanel.Field>
                  <SectionHelper fullWidth appearance="danger">
                    {credsMessage}
                  </SectionHelper>
                </SidePanel.Field>
              )}

              {credsStatus === "success" && (
                <SidePanel.Field>
                  <SectionHelper fullWidth appearance="success">
                    {credsMessage}
                  </SectionHelper>
                </SidePanel.Field>
              )}

              <SidePanel.Field>
                <Button
                  onClick={handleSaveCredentials}
                  disabled={savingCreds}
                  size="small"
                >
                  {savingCreds ? (
                    <Loader size="tiny" />
                  ) : (
                    "🔒 Chiffrer et sauvegarder"
                  )}
                </Button>
              </SidePanel.Field>
            </>
          )}

          <Divider />

          {/* ── Apparence ── */}
          <SidePanel.Field>
            <Text weight="bold" size="small">
              Apparence
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

          {/* ── Paiement ── */}
          <SidePanel.Field>
            <Text weight="bold" size="small">
              Paiement
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

          <SidePanel.Field>
            <FormField label="Montant fixe">
              <NumberInput
                value={parseFloat(config["amount"]) || 0}
                onChange={(value) => updateProp("amount", String(value || ""))}
                placeholder="ex: 150.00"
                suffix={
                  <Text size="small" secondary>
                    {config["currency"]}
                  </Text>
                }
              />
            </FormField>
          </SidePanel.Field>

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
              infoContent="Type de paiement MiPS à utiliser"
            >
              <Dropdown
                selectedId={config["request-mode"]}
                options={REQUEST_MODE_OPTIONS}
                onSelect={(opt) => updateProp("request-mode", opt.id as string)}
              />
            </FormField>
          </SidePanel.Field>
        </SidePanel.Content>

        <SidePanel.Footer noPadding>
          <SectionHelper fullWidth appearance="warning" border="topBottom">
            🔐 Vos credentials sont chiffrés avec AES-256-GCM et stockés comme
            attributs du widget. Ils ne sont jamais envoyés à un serveur tiers.
          </SectionHelper>
        </SidePanel.Footer>
      </SidePanel>
    </WixDesignSystemProvider>
  );
};

export default Panel;

// panel.tsx - Version avec sauvegarde automatique après vérification
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
  TextButton,
} from "@wix/design-system";
// import "@wix/design-system/styles.global.css";

const BACKEND = "https://mips-wix-backend.onrender.com";

interface MipsConfig {
  "button-text": string;
  "button-color": string;
  amount: string;
  currency: string;
  "payment-title": string;
  "public-key": string;
  "sending-mode": string;
  "request-mode": string;
  "public-key-input": string;
  "amount-source": string;
}

const CURRENCY_OPTIONS = [
  { id: "MUR", value: "MUR — Roupie mauricienne" },
  { id: "USD", value: "USD — Dollar américain" },
  { id: "EUR", value: "EUR — Euro" },
  { id: "GBP", value: "GBP — Livre sterling" },
  { id: "ZAR", value: "ZAR — Rand sud-africain" },
];

const SENDING_MODE_OPTIONS = [
  { id: "link", value: "Lien (le client reçoit un lien)" },
  { id: "mail", value: "Email (MiPS envoie l'email)" },
  { id: "sms", value: "SMS (MiPS envoie un SMS)" },
];

const REQUEST_MODE_OPTIONS = [
  { id: "simple", value: "Simple (paiement unique)" },
  { id: "deposit", value: "Dépôt" },
  { id: "odrp", value: "ODRP" },
  { id: "membership", value: "Abonnement" },
  { id: "bill_presentment", value: "Présentation de facture" },
];

const Panel: FC = () => {
  const [config, setConfig] = useState<MipsConfig>({
    "button-text": "Payer avec MiPS",
    "button-color": "#2563EB",
    amount: "",
    currency: "MUR",
    "payment-title": "Paiement",
    "public-key": "",
    "public-key-input": "",
    "sending-mode": "link",
    "request-mode": "simple",
    "amount-source": "cart",
  });

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [saveMessage, setSaveMessage] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const keys: (keyof MipsConfig)[] = [
      "button-text",
      "button-color",
      "amount",
      "currency",
      "payment-title",
      "public-key",
      "sending-mode",
      "request-mode",
      "amount-source",
    ];

    Promise.all(keys.map((k) => widget.getProp(k).then((v) => ({ k, v }))))
      .then((results) => {
        const loaded: Partial<MipsConfig> = {};
        results.forEach(({ k, v }) => {
          if (v) loaded[k] = v;
        });

        setConfig((prev) => ({ ...prev, ...loaded }));

        if (loaded["public-key"]) {
          verifyPublicKey(loaded["public-key"]);
        }
      })
      .catch(console.error);
  }, []);

  // Fonction pour sauvegarder la clé à plusieurs endroits
  const savePublicKey = useCallback((publicKey: string) => {
    console.log("💾 Sauvegarde automatique de la clé:", publicKey);

    // 1. Sauvegarder via widget API
    widget.setProp("public-key", publicKey);

    // 2. Sauvegarder dans localStorage
    localStorage.setItem("mips_public_key", publicKey);

    // 3. Sauvegarder comme variable globale
    if (typeof window !== "undefined") {
      (window as any).MIPS_PUBLIC_KEY = publicKey;
    }

    // 4. Sauvegarder comme attribut direct sur l'élément widget
    setTimeout(() => {
      const widgetElement = document.querySelector("mips-pay");
      if (widgetElement) {
        widgetElement.setAttribute("public-key", publicKey);
        console.log("✅ Clé ajoutée comme attribut sur l'élément widget");
      }
    }, 100);

    // Mettre à jour l'état
    setConfig((prev) => ({ ...prev, "public-key": publicKey }));
  }, []);

  const verifyPublicKey = async (publicKey: string) => {
    if (!publicKey) return;

    setVerifying(true);
    try {
      const res = await fetch(
        `${BACKEND}/api/merchant/verify-public-key?public_key=${publicKey}`,
      );
      const data = await res.json();

      if (data.valid) {
        // ✅ Clé valide - Sauvegarde automatique
        savePublicKey(publicKey);

        setSaveStatus("success");
        setSaveMessage(
          "✅ Clé publique valide ! Configuration chargée et sauvegardée.",
        );

        // Mettre à jour la configuration avec les données du merchant
        if (data.merchant.currency) {
          updateProp("currency", data.merchant.currency);
        }
        if (data.merchant.sending_mode) {
          updateProp("sending-mode", data.merchant.sending_mode);
        }
        if (data.merchant.request_mode) {
          updateProp("request-mode", data.merchant.request_mode);
        }
      } else {
        setSaveStatus("error");
        setSaveMessage(
          "❌ Clé publique invalide. Veuillez vérifier votre clé.",
        );
      }
    } catch (err) {
      setSaveStatus("error");
      setSaveMessage("❌ Impossible de vérifier la clé publique.");
    } finally {
      setVerifying(false);
      setTimeout(() => {
        if (saveStatus !== "success") {
          setSaveStatus("idle");
          setSaveMessage("");
        }
      }, 4000);
    }
  };

  const updateProp = useCallback(
    <K extends keyof MipsConfig>(key: K, value: string) => {
      setConfig((prev) => ({ ...prev, [key]: value }));
      widget.setProp(key, value);
    },
    [],
  );

  const handleVerifyKey = () => {
    if (config["public-key-input"]) {
      verifyPublicKey(config["public-key-input"]);
    }
  };

  const handleSaveAllConfig = async () => {
    setSaving(true);
    setSaveStatus("idle");
    setSaveMessage("");

    try {
      const res = await fetch(`${BACKEND}/api/merchant/save-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_key: config["public-key"] || config["public-key-input"],
          currency: config["currency"],
          sending_mode: config["sending-mode"],
          request_mode: config["request-mode"],
          button_text: config["button-text"],
          button_color: config["button-color"],
          payment_title: config["payment-title"],
          amount: config["amount"],
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSaveStatus("success");
        setSaveMessage("✅ Configuration enregistrée !");
      } else {
        setSaveStatus("error");
        setSaveMessage(data.error || "❌ Erreur lors de l'enregistrement.");
      }
    } catch (err) {
      setSaveStatus("error");
      setSaveMessage("❌ Impossible de joindre le serveur.");
    } finally {
      setSaving(false);
      setTimeout(() => {
        setSaveStatus("idle");
        setSaveMessage("");
      }, 4000);
    }
  };
  const AMOUNT_SOURCE_OPTIONS = [
    { id: "cart", value: "Panier Wix (automatique)" },
    { id: "fixed", value: "Montant fixe" },
  ];
  return (
    <WixDesignSystemProvider>
      <SidePanel width="300" height="100vh">
        <SidePanel.Content noPadding stretchVertically>
          {/* ── Configuration de la clé publique ── */}
          <SidePanel.Field>
            <Text weight="bold" size="small">
              🔑 Configuration MiPS
            </Text>
          </SidePanel.Field>

          <SidePanel.Field>
            <FormField
              label="Clé publique MiPS"
              infoContent="Entrez votre clé publique - elle sera automatiquement sauvegardée si valide"
            >
              <div
                style={{ display: "flex", gap: "8px", alignItems: "center" }}
              >
                <div style={{ flex: 1 }}>
                  <Input
                    value={config["public-key-input"]}
                    onChange={(e) => {
                      setConfig((prev) => ({
                        ...prev,
                        "public-key-input": e.target.value,
                      }));
                    }}
                    placeholder="pk_live_xxxxxxxxxxxxxxxxxxxxxxxx"
                  />
                </div>
                <Button
                  onClick={handleVerifyKey}
                  disabled={verifying || !config["public-key-input"]}
                  size="small"
                >
                  {verifying ? <Loader size="tiny" /> : "Vérifier"}
                </Button>
              </div>
            </FormField>
          </SidePanel.Field>

          {config["public-key"] && (
            <SidePanel.Field>
              <SectionHelper fullWidth appearance="success">
                🔑 Clé active : {config["public-key"].substring(0, 25)}...
              </SectionHelper>
            </SidePanel.Field>
          )}

          <Divider />

          {/* ── Apparence ── */}
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

          <SidePanel.Field>
            <Text weight="bold" size="small">
              💰 Paiement
            </Text>
          </SidePanel.Field>

          <SidePanel.Field>
            <FormField label="Titre du paiement">
              <Input
                value={config["payment-title"]}
                onChange={(e) => updateProp("payment-title", e.target.value)}
                placeholder="ex: Réservation chambre"
              />
            </FormField>
          </SidePanel.Field>
          <SidePanel.Field>
            <FormField label="Source du montant">
              <Dropdown
                selectedId={config["amount-source"] || "cart"}
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

          <Divider />
          <SidePanel.Field>
            <Text weight="bold" size="small">
              📤 Mode MiPS
            </Text>
          </SidePanel.Field>

          <SidePanel.Field>
            <FormField
              label="Mode d'envoi"
              infoContent="Comment MiPS envoie le lien de paiement au client"
            >
              <Dropdown
                selectedId={config["sending-mode"]}
                options={SENDING_MODE_OPTIONS}
                onSelect={(opt) => updateProp("sending-mode", opt.id as string)}
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

          <Divider />
          <SidePanel.Field>
            <TextButton
              size="small"
              as="a"
              href="https://mips-payments.dev-mdg.workers.dev"
              target="_blank"
            >
              Configurer mes credentials MiPS →
            </TextButton>
          </SidePanel.Field>

          {/* <SidePanel.Field>
            {saving ? (
              <Loader size="small" />
            ) : (
              <Button fullWidth onClick={handleSaveAllConfig}>
                Enregistrer toute la configuration
              </Button>
            )}
          </SidePanel.Field> */}

          {saveStatus === "success" && (
            <SidePanel.Field>
              <SectionHelper fullWidth appearance="success">
                {saveMessage}
              </SectionHelper>
            </SidePanel.Field>
          )}
          {saveStatus === "error" && (
            <SidePanel.Field>
              <SectionHelper fullWidth appearance="danger">
                {saveMessage}
              </SectionHelper>
            </SidePanel.Field>
          )}
        </SidePanel.Content>

        <SidePanel.Footer noPadding>
          <SectionHelper fullWidth appearance="warning" border="topBottom">
            🔒 Vos credentials MiPS sont stockés de façon sécurisée dans la base
            de données.
            <br />
            📌 La clé publique est automatiquement sauvegardée après
            vérification.
          </SectionHelper>
        </SidePanel.Footer>
      </SidePanel>
    </WixDesignSystemProvider>
  );
};

export default Panel;

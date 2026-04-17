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
} from "@wix/design-system";
import "@wix/design-system/styles.global.css";

interface MipsConfig {
  "button-text": string;
  "button-color": string;
  amount: string;
  currency: string;
  "payment-title": string;
  "site-id": string;
}

const CURRENCY_OPTIONS = [
  { id: "MUR", value: "MUR — Roupie mauricienne" },
  { id: "USD", value: "USD — Dollar américain" },
  { id: "EUR", value: "EUR — Euro" },
];

const Panel: FC = () => {
  const [config, setConfig] = useState<MipsConfig>({
    "button-text": "Payer avec MiPS",
    "button-color": "#2563EB",
    amount: "",
    currency: "MUR",
    "payment-title": "Paiement",
    "site-id": "",
  });

  useEffect(() => {
    const keys: (keyof MipsConfig)[] = [
      "button-text",
      "button-color",
      "amount",
      "currency",
      "payment-title",
      "site-id",
    ];

    Promise.all(keys.map((k) => widget.getProp(k).then((v) => ({ k, v }))))
      .then((results) => {
        const loaded: Partial<MipsConfig> = {};
        results.forEach(({ k, v }) => {
          if (v) loaded[k] = v;
        });
        setConfig((prev) => ({ ...prev, ...loaded }));
      })
      .catch(console.error);
  }, []);

  const updateProp = useCallback(
    <K extends keyof MipsConfig>(key: K, value: string) => {
      setConfig((prev) => ({ ...prev, [key]: value }));
      widget.setProp(key, value);
    },
    [],
  );

  return (
    <WixDesignSystemProvider>
      <SidePanel width="300" height="100vh">
        <SidePanel.Content noPadding stretchVertically>
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
                placeholder="ex: Réservation chambre"
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
                    MUR
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
              Configuration
            </Text>
          </SidePanel.Field>

          <SidePanel.Field>
            <FormField
              label="Wix Site ID"
              infoContent="Trouvez votre Site ID dans les paramètres de votre site Wix"
            >
              <Input
                value={config["site-id"]}
                onChange={(e) => updateProp("site-id", e.target.value)}
                placeholder="ex: abc123-def456..."
              />
            </FormField>
          </SidePanel.Field>
        </SidePanel.Content>

        <SidePanel.Footer noPadding>
          <SectionHelper fullWidth appearance="success" border="topBottom">
            Configurez vos credentials MiPS dans le{" "}
            <strong>Dashboard de l'app</strong>
          </SectionHelper>
        </SidePanel.Footer>
      </SidePanel>
    </WixDesignSystemProvider>
  );
};

export default Panel;

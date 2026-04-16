import { extensions } from "@wix/astro/builders";

export default extensions.customElement({
  id: "70c4a12d-f5cb-4edc-870b-bfca1644cb63",
  name: "Bouton MiPS Payment",
  width: {
    defaultWidth: 450,
    allowStretch: true,
  },
  height: {
    defaultHeight: 250,
  },
  installation: {
    autoAdd: true,
  },
  presets: [
    {
      id: "a6510852-6f61-4466-8d42-a619af9ddd6e",
      name: "default",
      thumbnailUrl: "{{BASE_URL}}/mips-logo.png",
    },
  ],

  tagName: "mips-pay-button",
  element: "./extensions/site/widgets/mips-pay-button/mips-pay-button.tsx",
  settings:
    "./extensions/site/widgets/mips-pay-button/mips-pay-button.panel.tsx",
});

import { extensions } from "@wix/astro/builders";

export default extensions.customElement({
  id: "16c272a2-aea2-4377-b34c-aabdfa549a88",
  name: "mips-button-widget",
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
      id: "ee662c93-8cf3-4f80-956f-65597310a785",
      name: "default",
      thumbnailUrl: "{{BASE_URL}}/mips-logo.png",
    },
  ],

  tagName: "mips-button-widget",
  element:
    "./extensions/site/widgets/mips-button-widget/mips-button-widget.tsx",
  settings:
    "./extensions/site/widgets/mips-button-widget/mips-button-widget.panel.tsx",
});
